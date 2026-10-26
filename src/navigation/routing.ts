import { railLineManager } from '../metro/RailLineManager'
import { REGIONS } from '../metro/regions'
import type { MergedStation, RailLine } from '../metro/types'
import { trackBetween } from './trackpath'
import { countryAt, rideHailFares, transitFare } from './fares'
import type { Fare } from './fares'
import { getWalkContext, usesBridge, countCrossings, distToPath, EMPTY_CONTEXT } from './skybridge'
import type { Skybridge } from './skybridge'

export type { Fare }
export type LngLat = [number, number]
export type Mode = 'walk' | 'drive' | 'transit' | 'ride'

export interface Place {
    name: string
    coordinates: LngLat
}

export interface Leg {
    kind: 'walk' | 'drive' | 'ride' | 'bridge'
    coordinates: LngLat[]
    color: string
}

export interface Step {
    text: string
    distanceM: number
    location: LngLat
    color?: string
}

export interface Route {
    id: string
    title: string
    mode: Mode
    distanceM: number
    durationS: number
    legs: Leg[]
    steps: Step[]
    fares: Fare[]
    note?: string
}

export const WALK_COLOR = '#2b7de9'
export const DRIVE_COLOR = '#3b3b98'
export const BRIDGE_COLOR = '#7c3aed'

const WALK_SPEED = 1.39 // m/s (5 km/h)
const TRAIN_SPEED = 35000 / 3600
const STOP_PENALTY = 25
const TRANSFER = 240
const WAIT = 180
const MAX_WALK_TO_STATION = 1500

const MAX_SKYBRIDGE_WALK_M = 6000 // longer walks skip the skybridge search

const hav = (a: LngLat, b: LngLat) => {
    const rad = Math.PI / 180
    const dLat = (b[1] - a[1]) * rad
    const dLng = (b[0] - a[0]) * rad
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLng / 2) ** 2
    return 2 * 6371000 * Math.asin(Math.sqrt(h))
}

const pathLength = (pts: LngLat[]) => {
    let d = 0
    for (let i = 0; i < pts.length - 1; i++) d += hav(pts[i], pts[i + 1])
    return d
}

// fetch with a time limit. A timeout and a user abort both throw AbortError,
// so callers check `signal?.aborted` to tell them apart.
async function fetchT(url: string, init: RequestInit = {}, ms = 8000, signal?: AbortSignal) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), ms)
    const onAbort = () => ctrl.abort()
    signal?.addEventListener('abort', onAbort)
    try {
        return await fetch(url, { ...init, signal: ctrl.signal })
    } finally {
        clearTimeout(timer)
        signal?.removeEventListener('abort', onAbort)
    }
}

// ---------- OSRM (drive, and walking fallback) ----------

interface OsrmRoute {
    distanceM: number
    durationS: number
    coordinates: LngLat[]
    steps: Step[]
    skybridges?: number
    crossings?: number
    score?: number
    bridges?: LngLat[][]
    crossPts?: LngLat[]
}

function describe(step: any): string {
    const { type, modifier } = step.maneuver
    const name: string = step.name
    if (type === 'depart') return name ? `Head out on ${name}` : 'Start'
    if (type === 'arrive') return 'You have arrived'
    if (type === 'roundabout' || type === 'rotary') return 'Enter the roundabout'
    if (modifier === 'uturn') return 'Make a U-turn'
    if (!modifier || modifier === 'straight') return name ? `Continue on ${name}` : 'Continue straight'
    return name ? `Turn ${modifier} onto ${name}` : `Turn ${modifier}`
}

async function osrm(profile: 'foot' | 'car', from: LngLat, to: LngLat, signal?: AbortSignal): Promise<OsrmRoute[]> {
    const url = `https://routing.openstreetmap.de/routed-${profile}/route/v1/driving/${from.join(',')};${to.join(',')}?overview=full&geometries=geojson&steps=true&alternatives=true`
    const res = await fetchT(url, {}, 8000, signal)
    if (!res.ok) throw new Error(`Routing failed (HTTP ${res.status})`)
    const data = await res.json()
    if (data.code !== 'Ok' || !data.routes?.length) throw new Error('No route found between these points')

    return data.routes.map((r: any) => ({
        distanceM: r.distance,
        // the public foot server's duration is unreliable, so walking is computed from distance
        durationS: profile === 'foot' ? r.distance / WALK_SPEED : r.duration,
        coordinates: r.geometry.coordinates,
        steps: r.legs.flatMap((leg: any) =>
            leg.steps.map((s: any): Step => ({ text: describe(s), distanceM: s.distance, location: s.maneuver.location })),
        ),
    }))
}

// ---------- Valhalla pedestrian routing (prefers footways and park paths) ----------

function decodePolyline6(str: string): LngLat[] {
    const out: LngLat[] = []
    let i = 0
    let lat = 0
    let lng = 0
    while (i < str.length) {
        for (const axis of [0, 1]) {
            let shift = 0
            let result = 0
            let b: number
            do {
                b = str.charCodeAt(i++) - 63
                result |= (b & 0x1f) << shift
                shift += 5
            } while (b >= 0x20)
            const d = result & 1 ? ~(result >> 1) : result >> 1
            if (axis === 0) lat += d
            else lng += d
        }
        out.push([lng / 1e6, lat / 1e6])
    }
    return out
}

// `via` = waypoints the route must pass through (used to force a route over a skybridge)
async function valhallaFoot(from: LngLat, to: LngLat, signal?: AbortSignal, via: LngLat[] = []): Promise<OsrmRoute[]> {
    const res = await fetchT(
        'https://valhalla1.openstreetmap.de/route',
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                locations: [
                    { lon: from[0], lat: from[1] },
                    ...via.map((p) => ({ lon: p[0], lat: p[1], type: 'through' })),
                    { lon: to[0], lat: to[1] },
                ],
                costing: 'pedestrian',
                costing_options: {
                    pedestrian: {
                        walking_speed: 5,
                        walkway_factor: 0.6, // below 1 = prefer footways and park paths
                        sidewalk_factor: 0.8,
                        use_hills: 0.3,
                        step_penalty: 30,
                    },
                },
                alternates: via.length ? 0 : 2,
                directions_options: { units: 'kilometers' },
            }),
        },
        6000,
        signal,
    )
    if (!res.ok) throw new Error(`Valhalla failed (HTTP ${res.status})`)
    const data = await res.json()
    const trips = [data.trip, ...(data.alternates ?? []).map((a: any) => a.trip)].filter(Boolean)
    if (!trips.length) throw new Error('No walking route found')

    return trips.map((t: any): OsrmRoute => {
        const leg = t.legs[0]
        const coords = decodePolyline6(leg.shape)
        return {
            distanceM: t.summary.length * 1000,
            durationS: (t.summary.length * 1000) / WALK_SPEED,
            coordinates: coords,
            steps: leg.maneuvers.map((m: any): Step => ({
                text: m.instruction,
                distanceM: m.length * 1000,
                location: coords[m.begin_shape_index],
            })),
        }
    })
}

// Valhalla first, OSRM as the fallback (also when Valhalla times out)
async function foot(from: LngLat, to: LngLat, signal?: AbortSignal) {
    try {
        return await valhallaFoot(from, to, signal)
    } catch (e: any) {
        if (signal?.aborted) throw e
        console.warn('Valhalla failed, falling back to OSRM', e)
        return osrm('foot', from, to, signal)
    }
}

// ---------- skybridge-aware walking ----------

function annotate(r: OsrmRoute, bridges: Skybridge[], ctx: Awaited<ReturnType<typeof getWalkContext>>) {
    const used = bridges.filter((x) => usesBridge(r.coordinates, x))
    const c = countCrossings(r.coordinates, ctx, used)
    r.skybridges = used.length
    r.crossings = c.count
    r.crossPts = c.points
    r.bridges = used.map((x) => x.coords)
    r.score = r.distanceM + c.penaltyM // distance plus the cost of every road crossed at street level
    return r
}

const byScore = (a: OsrmRoute, b: OsrmRoute) => (a.score ?? a.distanceM) - (b.score ?? b.distanceM)
const shortest = (rs: OsrmRoute[]) => [...rs].sort((a, b) => a.distanceM - b.distanceM)[0]

/**
 * A walk that is guaranteed to use the skybridge: walk to one end, cross, walk on from the other end.
 * Built from three pieces, so it does not depend on the router choosing the bridge by itself.
 * Pedestrians can use a bridge either way, so the cheaper end is the entry.
 */
async function viaBridge(
    from: LngLat,
    to: LngLat,
    c: { b: Skybridge; line: LngLat[] },
    signal?: AbortSignal,
): Promise<OsrmRoute | null> {
    const entry = c.line[0]
    const exit = c.line[c.line.length - 1]
    const [l1, l2] = await Promise.all([foot(from, entry, signal), foot(exit, to, signal)])
    const a = shortest(l1)
    const z = shortest(l2)
    // the router must have reached the bridge ends, not some other road next to them
    if (hav(a.coordinates[a.coordinates.length - 1], entry) > 40 || hav(z.coordinates[0], exit) > 40) return null

    const distanceM = a.distanceM + c.b.lengthM + z.distanceM
    return {
        distanceM,
        durationS: distanceM / WALK_SPEED,
        coordinates: [...a.coordinates, ...c.line, ...z.coordinates],
        steps: [
            ...a.steps.slice(0, -1), // drop "you have arrived" of the first piece
            { text: 'Cross the road on the skybridge', distanceM: c.b.lengthM, location: entry, color: BRIDGE_COLOR },
            ...z.steps,
        ],
    }
}

/**
 * Walking route that prefers skybridges over street-level crossings.
 * Reports progress through onUpdate: the normal route first, then re-ranked, then with skybridge options.
 */
async function walk(
    from: LngLat,
    to: LngLat,
    signal?: AbortSignal,
    onUpdate?: (rs: OsrmRoute[]) => void,
    quick = false, // short legs inside transit trips: tighter limits
): Promise<OsrmRoute[]> {
    // start looking for skybridges and roads at the same time as the normal route
    const ctxP = getWalkContext(from, to, quick ? 3000 : 8000).catch(() => EMPTY_CONTEXT)

    const base = await foot(from, to, signal)
    onUpdate?.(base) // stage 1: the normal walking route, shown straight away

    const ref = shortest(base)
    if (ref.distanceM > MAX_SKYBRIDGE_WALK_M) return base

    const ctx = await ctxP
    if (!ctx.bridges.length) return base

    base.forEach((r) => annotate(r, ctx.bridges, ctx))
    const ranked = [...base].sort(byScore)
    onUpdate?.(ranked) // stage 2: road crossings counted, routes re-ranked

    const best = ranked[0]
    if (!best.crossings) return ranked // the best route already has no street-level crossing
    const spots = best.crossPts ?? []

    // skybridges close to the places where the best route crosses a road
    const direct = hav(from, to)
    const cands = ctx.bridges
        .filter((b) => !base.some((r) => usesBridge(r.coordinates, b)))
        .filter((b) => spots.some((p) => distToPath(p, b.coords) <= 400))
        .map((b) => {
            const a = b.coords[0]
            const z = b.coords[b.coords.length - 1]
            const d1 = hav(from, a) + hav(z, to)
            const d2 = hav(from, z) + hav(a, to)
            const fwd = d1 <= d2 // either direction is fine for a pedestrian, take the cheaper one
            return { b, line: fwd ? b.coords : [...b.coords].reverse(), via: (fwd ? d1 : d2) + b.lengthM }
        })
        .filter((c) => c.via <= direct * 2 + 300)
        .sort((x, y) => x.via - y.via)
        .slice(0, quick ? 1 : 3)

    const built = await Promise.all(
        cands.map(async (c) => {
            try {
                return await viaBridge(from, to, c, signal)
            } catch (e: any) {
                if (signal?.aborted) throw e
                return null // a timeout just drops that candidate
            }
        }),
    )

    const out = [...base]
    for (const r of built) {
        if (!r) continue
        if (r.distanceM > ref.distanceM * 2 + 300) continue // too big a detour
        annotate(r, ctx.bridges, ctx)
        if (out.some((o) => Math.abs(o.distanceM - r.distanceM) < 5)) continue
        out.push(r)
    }
    return out.sort(byScore).slice(0, 4) // stage 3: skybridge routes added
}

// short walking legs inside a transit trip are reused between options
const footMemo = new Map<string, Promise<OsrmRoute>>()
function footLeg(a: LngLat, b: LngLat) {
    const key = `${a}|${b}`
    if (!footMemo.has(key)) {
        footMemo.set(
            key,
            walk(a, b, undefined, undefined, true).then((r) => [...r].sort(byScore)[0]),
        )
    }
    return footMemo.get(key)!
}

function labelRoutes(rs: OsrmRoute[], mode: 'walk' | 'drive'): Route[] {
    const list = mode === 'walk' ? [...rs].sort(byScore) : rs
    const fastest = list.reduce((b, r, i) => (r.durationS < list[b].durationS ? i : b), 0)
    const shortest = list.reduce((b, r, i) => (r.distanceM < list[b].distanceM ? i : b), 0)
    const color = mode === 'walk' ? WALK_COLOR : DRIVE_COLOR

    const routes = list.map((r, i): Route => {
        let title = 'Alternative'
        if (mode === 'walk') {
            if (r.skybridges) title = i === shortest ? 'Via skybridge · Shortest' : 'Via skybridge'
            else if (i === shortest) title = 'Shortest walk'
        } else if (i === fastest && i === shortest) title = 'Fastest & shortest'
        else if (i === fastest) title = 'Fastest'
        else if (i === shortest) title = 'Shortest'

        let note: string | undefined
        if (mode === 'walk' && r.crossings !== undefined) {
            const c = r.crossings
            if (r.skybridges) {
                note =
                    `Uses ${r.skybridges} skybridge${r.skybridges > 1 ? 's' : ''}` +
                    (c ? `, ${c} street-level crossing${c > 1 ? 's' : ''}` : ', no street-level crossings')
            } else if (c) {
                note = `${c} street-level crossing${c > 1 ? 's' : ''} (from map data)`
            }
        }

        return {
            id: `${mode}-${i}`,
            title,
            mode,
            distanceM: r.distanceM,
            durationS: r.durationS,
            legs: [
                { kind: mode, coordinates: r.coordinates, color },
                ...(r.bridges ?? []).map((b) => ({ kind: 'bridge' as const, coordinates: b, color: BRIDGE_COLOR })),
            ],
            steps: r.steps,
            fares: [],
            note,
        }
    })

    // walking is already ordered by score; driving keeps its own ordering
    return mode === 'walk'
        ? routes
        : routes.sort((a, b) => Number(a.title === 'Alternative') - Number(b.title === 'Alternative') || a.durationS - b.durationS)
}

// ---------- transit graph built from the rail data ----------

interface GraphState { node: number; line: RailLine }
interface Edge { to: number; time: number; kind: 'ride' | 'transfer' }
interface Graph { nodes: MergedStation[]; states: GraphState[]; adj: Edge[][] }

let graph: Graph | undefined

function getGraph(): Graph {
    if (graph) return graph

    const nodes = REGIONS.flatMap((r) => railLineManager.getMergedStations(r.country))
    const states: GraphState[] = []
    const stateIdx = new Map<string, number>()
    const nodesByLine = new Map<string, number[]>()
    const statesByNode = new Map<number, number[]>()

    nodes.forEach((n, i) => {
        for (const m of n.members) {
            const key = `${i}|${m.line.id}`
            if (stateIdx.has(key)) continue
            const s = states.length
            stateIdx.set(key, s)
            states.push({ node: i, line: m.line })
            nodesByLine.set(m.line.id, [...(nodesByLine.get(m.line.id) ?? []), i])
            statesByNode.set(i, [...(statesByNode.get(i) ?? []), s])
        }
    })

    const adj: Edge[][] = states.map(() => [])

    for (const list of statesByNode.values()) {
        for (const a of list) for (const b of list) if (a !== b) adj[a].push({ to: b, time: TRANSFER, kind: 'transfer' })
    }

    for (const line of railLineManager.getAll()) {
        const candidates = nodesByLine.get(line.id) ?? []
        const seq: number[] = []
        for (const st of line.stations) {
            let best = -1
            let bestD = 500
            for (const i of candidates) {
                const d = hav(st.coordinates, nodes[i].coordinates)
                if (d < bestD) { bestD = d; best = i }
            }
            if (best >= 0 && seq[seq.length - 1] !== best) seq.push(best)
        }
        for (let k = 0; k < seq.length - 1; k++) {
            const a = stateIdx.get(`${seq[k]}|${line.id}`)!
            const b = stateIdx.get(`${seq[k + 1]}|${line.id}`)!
            const d = hav(nodes[seq[k]].coordinates, nodes[seq[k + 1]].coordinates)
            if (d > 60000) continue
            const time = (d * 1.15) / TRAIN_SPEED + STOP_PENALTY
            adj[a].push({ to: b, time, kind: 'ride' })
            adj[b].push({ to: a, time, kind: 'ride' })
        }
    }

    graph = { nodes, states, adj }
    return graph
}

interface Profile { title: string; transfer: number; walkW: number }
const PROFILES: Profile[] = [
    { title: 'Fastest', transfer: TRANSFER, walkW: 1 },
    { title: 'Fewest transfers', transfer: 1800, walkW: 1 },
    { title: 'Least walking', transfer: TRANSFER, walkW: 3 },
]

interface Segment { line: RailLine; nodes: number[] }

function planTransit(from: LngLat, to: LngLat, p: Profile) {
    const g = getGraph()
    const n = g.states.length
    const dist = new Array<number>(n).fill(Infinity)
    const prev = new Array<number>(n).fill(-1)
    const prevTime = new Array<number>(n).fill(0)
    const done = new Array<boolean>(n).fill(false)

    for (let i = 0; i < n; i++) {
        const d = hav(from, g.nodes[g.states[i].node].coordinates)
        if (d <= MAX_WALK_TO_STATION) dist[i] = (p.walkW * d * 1.3) / WALK_SPEED
    }

    for (;;) {
        let u = -1
        let best = Infinity
        for (let i = 0; i < n; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i }
        if (u < 0) break
        done[u] = true
        for (const e of g.adj[u]) {
            const c = e.kind === 'transfer' ? p.transfer : e.time
            if (dist[u] + c < dist[e.to]) { dist[e.to] = dist[u] + c; prev[e.to] = u; prevTime[e.to] = e.time }
        }
    }

    let end = -1
    let bestTotal = Infinity
    for (let i = 0; i < n; i++) {
        const d = hav(to, g.nodes[g.states[i].node].coordinates)
        if (d > MAX_WALK_TO_STATION || dist[i] === Infinity) continue
        const total = dist[i] + (p.walkW * d * 1.3) / WALK_SPEED
        if (total < bestTotal) { bestTotal = total; end = i }
    }
    if (end < 0) return null

    const path: number[] = []
    for (let s = end; s !== -1; s = prev[s]) path.unshift(s)
    const rideSeconds = path.slice(1).reduce((a, s) => a + prevTime[s], 0)

    const segments: Segment[] = []
    let cur: Segment | undefined
    for (const s of path) {
        const { node, line } = g.states[s]
        if (cur && cur.line.id === line.id) {
            if (cur.nodes[cur.nodes.length - 1] !== node) cur.nodes.push(node)
        } else {
            cur = { line, nodes: [node] }
            segments.push(cur)
        }
    }

    return { nodes: g.nodes, segments: segments.filter((s) => s.nodes.length > 1), rideSeconds }
}

type Plan = NonNullable<ReturnType<typeof planTransit>>

async function buildTransit(plan: Plan, title: string, id: string, from: LngLat, to: LngLat): Promise<Route> {
    const { nodes, segments } = plan
    const firstNode = nodes[segments[0].nodes[0]]
    const lastSeg = segments[segments.length - 1]
    const lastNode = nodes[lastSeg.nodes[lastSeg.nodes.length - 1]]

    const [w1, w2] = await Promise.all([footLeg(from, firstNode.coordinates), footLeg(lastNode.coordinates, to)])

    const legs: Leg[] = [{ kind: 'walk', coordinates: w1.coordinates, color: WALK_COLOR }]
    const steps: Step[] = [{ text: `Walk to ${firstNode.name}`, distanceM: w1.distanceM, location: from }]
    const fareInput: { operator: string; distanceM: number }[] = []
    let rideDist = 0

    for (const b of w1.bridges ?? []) legs.push({ kind: 'bridge', coordinates: b, color: BRIDGE_COLOR })

    segments.forEach((seg, i) => {
        // follow the real track between each pair of stations, straight line only as a fallback
        const pts: LngLat[] = []
        for (let k = 0; k < seg.nodes.length - 1; k++) {
            const a = nodes[seg.nodes[k]].coordinates
            const b = nodes[seg.nodes[k + 1]].coordinates
            const part = trackBetween(seg.line, a, b) ?? [a, b]
            for (const c of part) {
                const last = pts[pts.length - 1]
                if (!last || last[0] !== c[0] || last[1] !== c[1]) pts.push(c)
            }
        }
        const d = pathLength(pts)
        rideDist += d
        fareInput.push({ operator: seg.line.operator, distanceM: d })
        legs.push({ kind: 'ride', coordinates: pts, color: seg.line.color })

        if (i > 0) {
            steps.push({ text: `Change at ${nodes[seg.nodes[0]].name}`, distanceM: 0, location: pts[0], color: seg.line.color })
        }
        const a = nodes[seg.nodes[0]].name
        const b = nodes[seg.nodes[seg.nodes.length - 1]].name
        steps.push({
            text: `Take ${seg.line.name} from ${a} to ${b} (${seg.nodes.length - 1} stop${seg.nodes.length > 2 ? 's' : ''})`,
            distanceM: d,
            location: pts[0],
            color: seg.line.color,
        })
    })

    legs.push({ kind: 'walk', coordinates: w2.coordinates, color: WALK_COLOR })
    for (const b of w2.bridges ?? []) legs.push({ kind: 'bridge', coordinates: b, color: BRIDGE_COLOR })
    steps.push({ text: 'Walk to your destination', distanceM: w2.distanceM, location: lastNode.coordinates })

    return {
        id,
        title,
        mode: 'transit',
        distanceM: w1.distanceM + rideDist + w2.distanceM,
        durationS: w1.durationS + WAIT + plan.rideSeconds + w2.durationS,
        legs,
        steps,
        fares: transitFare(fareInput),
        note: 'Estimate, not a live timetable',
    }
}

async function transitRoutes(from: LngLat, to: LngLat): Promise<Route[]> {
    const unique = new Map<string, { plan: Plan; titles: string[] }>()
    for (const p of PROFILES) {
        const plan = planTransit(from, to, p)
        if (!plan || !plan.segments.length) continue
        const sig = plan.segments.map((s) => `${s.line.id}:${s.nodes[0]}>${s.nodes[s.nodes.length - 1]}`).join('|')
        const hit = unique.get(sig)
        if (hit) hit.titles.push(p.title)
        else unique.set(sig, { plan, titles: [p.title] })
    }
    if (!unique.size) throw new Error('No public transport within walking distance. Try walking or driving.')

    const routes = await Promise.all(
        [...unique.values()].map((u, i) => buildTransit(u.plan, u.titles.join(' · '), `transit-${i}`, from, to)),
    )
    return routes.sort((a, b) => a.durationS - b.durationS)
}

// ---------- public API ----------

export async function fetchRoutes(
    mode: Mode,
    from: LngLat,
    to: LngLat,
    signal?: AbortSignal,
    onUpdate?: (routes: Route[]) => void, // called with each improved result while the final one is still being worked out
): Promise<Route[]> {
    if (mode === 'transit') return transitRoutes(from, to)

    if (mode === 'walk') {
        const rs = await walk(from, to, signal, (partial) => onUpdate?.(labelRoutes(partial, 'walk')))
        return labelRoutes(rs, 'walk')
    }

    const drive = labelRoutes(await osrm('car', from, to, signal), 'drive')
    if (mode === 'drive') return drive

    // ride: the driving route with ride-hailing fares
    const country = countryAt(from)
    return drive.slice(0, 2).map((r) => ({
        ...r,
        id: r.id.replace('drive', 'ride'),
        mode: 'ride' as const,
        fares: rideHailFares(country, r.distanceM, r.durationS, from),
    }))
}