import { railLineManager } from '../metro/RailLineManager'
import { REGIONS } from '../metro/regions'
import type { MergedStation, RailLine } from '../metro/types'
import { trackBetween } from './trackpath'
import { countryAt, rideHailFares, transitFare } from './fares'
import type { Fare } from './fares'

export type { Fare }
export type LngLat = [number, number]
export type Mode = 'walk' | 'drive' | 'transit' | 'ride'

export interface Place {
    name: string
    coordinates: LngLat
}

export interface Leg {
    kind: 'walk' | 'drive' | 'ride'
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

const WALK_SPEED = 1.39 // m/s (5 km/h)
const TRAIN_SPEED = 35000 / 3600
const STOP_PENALTY = 25
const TRANSFER = 240
const WAIT = 180
const MAX_WALK_TO_STATION = 1500

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

// ---------- OSRM (drive, and walking fallback) ----------

interface OsrmRoute { distanceM: number; durationS: number; coordinates: LngLat[]; steps: Step[] }

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
    const res = await fetch(url, { signal })
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

async function valhallaFoot(from: LngLat, to: LngLat, signal?: AbortSignal): Promise<OsrmRoute[]> {
    const res = await fetch('https://valhalla1.openstreetmap.de/route', {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            locations: [{ lon: from[0], lat: from[1] }, { lon: to[0], lat: to[1] }],
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
            alternates: 2,
            directions_options: { units: 'kilometers' },
        }),
    })
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

// Valhalla first, OSRM as the fallback
async function foot(from: LngLat, to: LngLat, signal?: AbortSignal) {
    try {
        return await valhallaFoot(from, to, signal)
    } catch (e: any) {
        if (e.name === 'AbortError') throw e
        console.warn('Valhalla failed, falling back to OSRM', e)
        return osrm('foot', from, to, signal)
    }
}

// short walking legs inside a transit trip are reused between options
const footMemo = new Map<string, Promise<OsrmRoute>>()
function footLeg(a: LngLat, b: LngLat) {
    const key = `${a}|${b}`
    if (!footMemo.has(key)) footMemo.set(key, foot(a, b).then((r) => r.sort((x, y) => x.distanceM - y.distanceM)[0]))
    return footMemo.get(key)!
}

function labelRoutes(rs: OsrmRoute[], mode: 'walk' | 'drive'): Route[] {
    const fastest = rs.reduce((b, r, i) => (r.durationS < rs[b].durationS ? i : b), 0)
    const shortest = rs.reduce((b, r, i) => (r.distanceM < rs[b].distanceM ? i : b), 0)
    const color = mode === 'walk' ? WALK_COLOR : DRIVE_COLOR

    return rs
        .map((r, i): Route => {
            let title = 'Alternative'
            if (mode === 'walk') { if (i === shortest) title = 'Shortest walk' }
            else if (i === fastest && i === shortest) title = 'Fastest & shortest'
            else if (i === fastest) title = 'Fastest'
            else if (i === shortest) title = 'Shortest'
            return {
                id: `${mode}-${i}`,
                title,
                mode,
                distanceM: r.distanceM,
                durationS: r.durationS,
                legs: [{ kind: mode, coordinates: r.coordinates, color }],
                steps: r.steps,
                fares: [],
            }
        })
        .sort((a, b) => Number(a.title === 'Alternative') - Number(b.title === 'Alternative') || a.durationS - b.durationS)
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

export async function fetchRoutes(mode: Mode, from: LngLat, to: LngLat, signal?: AbortSignal): Promise<Route[]> {
    if (mode === 'transit') return transitRoutes(from, to)
    if (mode === 'walk') return labelRoutes(await foot(from, to, signal), 'walk')

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