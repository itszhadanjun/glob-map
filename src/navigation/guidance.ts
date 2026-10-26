import type { LngLat, Route, Step } from './routing'

const K = 111320

export type Maneuver = 'straight' | 'left' | 'right' | 'uturn' | 'roundabout' | 'transit' | 'arrive'
export type GuideStep = Step & { idx: number; at: number; kind: Maneuver } // at = metres along the path

export interface PathIndex {
    coords: LngLat[]
    cum: number[] // cumulative metres at each vertex
    total: number
}

export const distM = (a: LngLat, b: LngLat) =>
    Math.hypot((b[1] - a[1]) * K, (b[0] - a[0]) * K * Math.cos((a[1] * Math.PI) / 180))

export function bearing(a: LngLat, b: LngLat) {
    const r = Math.PI / 180
    const dl = (b[0] - a[0]) * r
    const y = Math.sin(dl) * Math.cos(b[1] * r)
    const x = Math.cos(a[1] * r) * Math.sin(b[1] * r) - Math.sin(a[1] * r) * Math.cos(b[1] * r) * Math.cos(dl)
    return ((Math.atan2(y, x) / r) + 360) % 360
}

/** All legs of a route joined into one path (skybridge overlays are display-only and skipped) */
export function buildPath(route: Route): PathIndex {
    const coords: LngLat[] = []
    for (const leg of route.legs) {
        if (leg.kind === 'bridge') continue
        for (const c of leg.coordinates) {
            const l = coords[coords.length - 1]
            if (!l || l[0] !== c[0] || l[1] !== c[1]) coords.push(c)
        }
    }
    const cum = [0]
    for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + distM(coords[i - 1], coords[i]))
    return { coords, cum, total: cum[cum.length - 1] ?? 0 }
}

export function pointAt(p: PathIndex, d: number): LngLat {
    if (d <= 0) return p.coords[0]
    for (let i = 0; i < p.coords.length - 1; i++) {
        if (p.cum[i + 1] >= d) {
            const t = (d - p.cum[i]) / (p.cum[i + 1] - p.cum[i] || 1)
            const a = p.coords[i]
            const b = p.coords[i + 1]
            return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
        }
    }
    return p.coords[p.coords.length - 1]
}

/** Nearest point on the path, optionally limited to a window of distance along it */
export function snapToPath(p: PathIndex, pos: LngLat, minAlong = -Infinity, maxAlong = Infinity) {
    const cos = Math.cos((pos[1] * Math.PI) / 180)
    let best = { index: 0, point: p.coords[0], offM: Infinity, along: 0, segBearing: 0 }

    for (let i = 0; i < p.coords.length - 1; i++) {
        if (p.cum[i + 1] < minAlong || p.cum[i] > maxAlong) continue
        const a = p.coords[i]
        const b = p.coords[i + 1]
        const ax = (a[0] - pos[0]) * K * cos
        const ay = (a[1] - pos[1]) * K
        const dx = (b[0] - a[0]) * K * cos
        const dy = (b[1] - a[1]) * K
        const len2 = dx * dx + dy * dy
        const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2))
        const off = Math.hypot(ax + t * dx, ay + t * dy)
        if (off < best.offM) {
            best = {
                index: i,
                point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
                offM: off,
                along: p.cum[i] + t * Math.sqrt(len2),
                segBearing: bearing(a, b),
            }
        }
    }
    return best
}

function kindOf(text: string): Maneuver {
    const t = text.toLowerCase()
    if (/arrived|destination is|you will arrive/.test(t)) return 'arrive'
    if (/u-turn/.test(t)) return 'uturn'
    if (/roundabout|rotary/.test(t)) return 'roundabout'
    if (/^(take|change)/.test(t)) return 'transit'
    if (/\bleft\b/.test(t)) return 'left'
    if (/\bright\b/.test(t)) return 'right'
    return 'straight'
}

/** Place every instruction at a distance along the path */
export function buildSteps(route: Route, path: PathIndex): GuideStep[] {
    let prev = 0
    return route.steps.map((s, idx) => {
        const kind = kindOf(s.text)
        const sn = snapToPath(path, s.location, prev - 5)
        if (sn.offM !== Infinity) prev = Math.max(prev, sn.along)
        const at = kind === 'arrive' && idx === route.steps.length - 1 ? path.total : prev
        return { ...s, idx, at, kind }
    })
}