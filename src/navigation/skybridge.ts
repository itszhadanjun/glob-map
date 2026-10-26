type P = [number, number] // [lng, lat]

export interface Skybridge {
    id: number
    coords: P[]
    lengthM: number
}

export interface Road {
    coords: P[]
    weight: number // how costly it is to cross, in metres of extra walking
}

export interface WalkContext {
    bridges: Skybridge[]
    roads: Road[]
}

export const EMPTY_CONTEXT: WalkContext = { bridges: [], roads: [] }

const K = 111320

const ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
]

// ask every server at once, take the first good answer, give up after `ms`
async function overpass(query: string, ms: number) {
    const ctrls = ENDPOINTS.map(() => new AbortController())
    const timer = setTimeout(() => ctrls.forEach((c) => c.abort()), ms)
    try {
        return await Promise.any(
            ENDPOINTS.map(async (url, i) => {
                const res = await fetch(url, {
                    method: 'POST',
                    body: 'data=' + encodeURIComponent(query),
                    signal: ctrls[i].signal,
                })
                const text = await res.text()
                if (!res.ok || text.trimStart().startsWith('<')) throw new Error('bad response')
                const data = JSON.parse(text)
                ctrls.forEach((c, j) => { if (j !== i) c.abort() })
                return data
            }),
        )
    } finally {
        clearTimeout(timer)
    }
}

const hav = (a: P, b: P) =>
    Math.hypot((b[1] - a[1]) * K, (b[0] - a[0]) * K * Math.cos((a[1] * Math.PI) / 180))

/** Shortest distance in metres from a point to a polyline */
export function distToPath(p: P, path: P[]) {
    const cos = Math.cos((p[1] * Math.PI) / 180)
    let best = Infinity
    for (let i = 0; i < path.length - 1; i++) {
        const ax = (path[i][0] - p[0]) * K * cos
        const ay = (path[i][1] - p[1]) * K
        const dx = (path[i + 1][0] - path[i][0]) * K * cos
        const dy = (path[i + 1][1] - path[i][1]) * K
        const l2 = dx * dx + dy * dy
        const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2))
        const d = Math.hypot(ax + t * dx, ay + t * dy)
        if (d < best) best = d
    }
    return best
}

/** A route uses a skybridge when it passes through both ends (direction does not matter) */
export function usesBridge(path: P[], b: Skybridge) {
    return distToPath(b.coords[0], path) < 10 && distToPath(b.coords[b.coords.length - 1], path) < 10
}

// cost of crossing each kind of road, in metres of extra walking
const ROAD_WEIGHT: Record<string, number> = {
    motorway: 400,
    trunk: 300,
    primary: 220,
    secondary: 160,
    tertiary: 100,
}
const ROAD_RE = /^(motorway|trunk|primary|secondary|tertiary)(_link)?$/

export interface Crossings {
    count: number
    penaltyM: number
    points: P[]
}

/**
 * Street-level road crossings of a walking route, found geometrically:
 * the route crosses a road when consecutive points of the route fall on opposite sides of it.
 * Crossings beneath a skybridge the route uses don't count. Direction of the road does not matter.
 */
export function countCrossings(path: P[], ctx: WalkContext, used: Skybridge[]): Crossings {
    if (path.length < 2 || !ctx.roads.length) return { count: 0, penaltyM: 0, points: [] }

    const o = path[0]
    const cos = Math.cos((o[1] * Math.PI) / 180)
    const m = (p: P): [number, number] => [(p[0] - o[0]) * K * cos, (p[1] - o[1]) * K]
    const back = (x: number, y: number): P => [o[0] + x / (K * cos), o[1] + y / K]

    // route as points every ~4 m, so that a crossing is always seen as a change of side
    const rp = path.map(m)
    const dense: [number, number][] = [rp[0]]
    for (let i = 1; i < rp.length; i++) {
        const [ax, ay] = rp[i - 1]
        const [bx, by] = rp[i]
        const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 4))
        for (let k = 1; k <= n; k++) dense.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n])
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const [x, y] of dense) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
    }

    const found: { p: P; w: number }[] = []
    for (const road of ctx.roads) {
        const rr = road.coords.map(m)
        for (let i = 0; i < rr.length - 1; i++) {
            const [ax, ay] = rr[i]
            const [bx, by] = rr[i + 1]
            if (Math.max(ax, bx) < minX - 2 || Math.min(ax, bx) > maxX + 2) continue
            if (Math.max(ay, by) < minY - 2 || Math.min(ay, by) > maxY + 2) continue
            const dx = bx - ax
            const dy = by - ay
            const len2 = dx * dx + dy * dy
            if (len2 === 0) continue

            for (let j = 0; j < dense.length - 1; j++) {
                const [px, py] = dense[j]
                const [qx, qy] = dense[j + 1]
                const sp = dx * (py - ay) - dy * (px - ax)
                const sq = dx * (qy - ay) - dy * (qx - ax)
                if (!((sp < 0 && sq > 0) || (sp > 0 && sq < 0))) continue
                const t = sp / (sp - sq)
                const cx = px + (qx - px) * t
                const cy = py + (qy - py) * t
                const u = ((cx - ax) * dx + (cy - ay) * dy) / len2
                if (u < -0.001 || u > 1.001) continue // the route passes beyond the end of this road piece
                found.push({ p: back(cx, cy), w: road.weight })
            }
        }
    }

    // one crossing per spot (a road mapped as several pieces, or a route point right on a road node)
    const kept: { p: P; w: number }[] = []
    for (const f of found) {
        if (used.some((b) => distToPath(f.p, b.coords) < 8)) continue // we are on a skybridge here
        const near = kept.find((k) => hav(k.p, f.p) < 15)
        if (near) near.w = Math.max(near.w, f.w)
        else kept.push({ ...f })
    }
    return { count: kept.length, penaltyM: kept.reduce((s, k) => s + k.w, 0), points: kept.map((k) => k.p) }
}

// one small query around the walk, cached so repeat walks in the same area are instant
const cache = new Map<string, Promise<WalkContext>>()
const GRID = 0.002 // ~200 m
const PAD = 0.003

export function getWalkContext(from: P, to: P, timeoutMs = 8000): Promise<WalkContext> {
    const w = Math.floor((Math.min(from[0], to[0]) - PAD) / GRID) * GRID
    const e = Math.ceil((Math.max(from[0], to[0]) + PAD) / GRID) * GRID
    const s = Math.floor((Math.min(from[1], to[1]) - PAD) / GRID) * GRID
    const n = Math.ceil((Math.max(from[1], to[1]) + PAD) / GRID) * GRID
    if (e - w > 0.06 || n - s > 0.06) return Promise.resolve(EMPTY_CONTEXT) // too long a walk

    const key = [w, s, e, n].map((v) => v.toFixed(3)).join(',')
    if (!cache.has(key)) {
        const bb = `(${s.toFixed(4)},${w.toFixed(4)},${n.toFixed(4)},${e.toFixed(4)})`
        const p = overpass(
            `[out:json][timeout:12];
(
  way["highway"~"^(footway|pedestrian|path|corridor)$"]["bridge"]["bridge"!="no"]${bb};
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary)(_link)?$"]["bridge"!~"."]["tunnel"!~"."]${bb};
);
out geom;`,
            timeoutMs,
        )
            .then((data): WalkContext => {
                const bridges: Skybridge[] = []
                const roads: Road[] = []
                for (const el of data.elements ?? []) {
                    if (el.type !== 'way' || !el.geometry) continue
                    const coords: P[] = el.geometry.map((g: any) => [g.lon, g.lat])
                    const hw: string = el.tags?.highway ?? ''
                    if (ROAD_RE.test(hw)) {
                        roads.push({ coords, weight: ROAD_WEIGHT[hw.replace('_link', '')] * (hw.endsWith('_link') ? 0.6 : 1) })
                    } else if (el.tags?.bridge) {
                        let len = 0
                        for (let i = 0; i < coords.length - 1; i++) len += hav(coords[i], coords[i + 1])
                        if (len >= 20) bridges.push({ id: el.id, coords, lengthM: len })
                    }
                }
                return { bridges, roads }
            })
            .catch(() => {
                cache.delete(key) // retry next time
                return EMPTY_CONTEXT
            })
        cache.set(key, p)
    }
    return cache.get(key)!
}