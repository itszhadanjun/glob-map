import GtfsRealtimeBindings from 'gtfs-realtime-bindings'
import type { RailLine, Station } from './types'

export type FeedId = 'rapid-rail-kl' | 'ktmb'

/** Which timetable feed serves a line. Undefined means no data source yet. */
export function feedOf(line: RailLine): FeedId | undefined {
    if (line.country !== 'MY') return undefined
    if (line.operator.includes('KTM')) return 'ktmb'
    if (line.operator.includes('Rapid')) return 'rapid-rail-kl'
    return undefined
}

interface StopInfo { id: string; name: string; lat: number; lon: number }
interface Calendar { id: string; days: boolean[]; start: string; end: string }
interface Exception { id: string; date: string; type: number }
interface Index { stops: StopInfo[]; calendar: Calendar[]; exceptions?: Exception[] }
interface RawDeparture { t: number; s: string; r: string; h: string }

export interface Departure {
    route: string
    headsign: string
    time: string
    inMin: number
    abs: number
}

const indexCache = new Map<FeedId, Index>()
const stopCache = new Map<string, RawDeparture[]>()

async function getIndex(feed: FeedId) {
    if (!indexCache.has(feed)) {
        const res = await fetch(`/timetable/${feed}/index.json`)
        if (!res.ok) throw new Error(`timetable index missing for ${feed}`)
        indexCache.set(feed, await res.json())
    }
    return indexCache.get(feed)!
}

async function getStopTimes(feed: FeedId, stopId: string) {
    const key = `${feed}/${stopId}`
    if (!stopCache.has(key)) {
        const res = await fetch(`/timetable/${feed}/${stopId}.json`)
        if (!res.ok) return []
        stopCache.set(key, await res.json())
    }
    return stopCache.get(key)!
}

const distM = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const k = 111320
    return Math.hypot((lat2 - lat1) * k, (lon2 - lon1) * k * Math.cos((lat1 * Math.PI) / 180))
}

/** Nearest GTFS stop within 250 m, plus same-named stops nearby (other platforms) */
export async function findStops(feed: FeedId, lng: number, lat: number) {
    const { stops } = await getIndex(feed)
    let best: StopInfo | undefined
    let bestD = 250
    for (const s of stops) {
        const d = distM(lat, lng, s.lat, s.lon)
        if (d < bestD) { best = s; bestD = d }
    }
    if (!best) return []
    const b = best
    return stops.filter((s) => s.id === b.id || (s.name === b.name && distM(b.lat, b.lon, s.lat, s.lon) < 400))
}

// a Date whose local fields read as Malaysia time (UTC+8)
const malaysiaNow = () => new Date(Date.now() + (8 * 60 + new Date().getTimezoneOffset()) * 60000)
const ymdOf = (d: Date) => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()

function activeServices(idx: Index, d: Date) {
    const ymd = ymdOf(d)
    const dayIdx = (d.getDay() + 6) % 7 // Monday = 0
    const set = new Set(
        idx.calendar.filter((c) => c.days[dayIdx] && +c.start <= ymd && +c.end >= ymd).map((c) => c.id),
    )
    for (const e of idx.exceptions ?? []) {
        if (+e.date !== ymd) continue
        if (e.type === 1) set.add(e.id)
        else if (e.type === 2) set.delete(e.id)
    }
    return set
}

const hhmm = (sec: number) =>
    `${String(Math.floor(sec / 3600) % 24).padStart(2, '0')}:${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}`

/** Next scheduled departures from one stop (Malaysia time) */
export async function nextDepartures(feed: FeedId, stopId: string, count = 8): Promise<Departure[]> {
    const idx = await getIndex(feed)
    const list = await getStopTimes(feed, stopId)

    const now = malaysiaNow()
    const nowSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()
    const today = activeServices(idx, now)
    const yesterday = activeServices(idx, new Date(now.getTime() - 86400000))

    const out: Departure[] = []
    for (const d of list) {
        const push = (abs: number) =>
            out.push({ route: d.r, headsign: d.h, time: hhmm(abs), inMin: Math.max(0, Math.round((abs - nowSec) / 60)), abs })
        if (today.has(d.s) && d.t >= nowSec) push(d.t)
        // trips after midnight that belong to yesterday's service day (times past 24:00)
        if (d.t >= 86400 && yesterday.has(d.s) && d.t - 86400 >= nowSec) push(d.t - 86400)
    }
    return out.sort((a, b) => a.abs - b.abs).slice(0, count)
}

/**
 * Combined departures for every line serving a station.
 * Returns null when none of the lines has a timetable source.
 */
export async function departuresForMembers(
    members: { line: RailLine; station?: Station }[],
    count = 8,
): Promise<Departure[] | null> {
    const byFeed = new Map<FeedId, Station[]>()
    for (const m of members) {
        const feed = feedOf(m.line)
        if (!feed || !m.station) continue
        byFeed.set(feed, [...(byFeed.get(feed) ?? []), m.station])
    }
    if (!byFeed.size) return null

    const all: Departure[] = []
    for (const [feed, stations] of byFeed) {
        const ids = new Set<string>()
        for (const s of stations) {
            for (const stop of await findStops(feed, s.coordinates[0], s.coordinates[1])) ids.add(stop.id)
        }
        for (const id of ids) all.push(...(await nextDepartures(feed, id, count)))
    }
    return all.sort((a, b) => a.abs - b.abs).slice(0, count)
}

/** Live vehicle positions as GeoJSON */
export async function fetchVehicles(feed: FeedId) {
    const url =
        feed === 'ktmb'
            ? 'https://api.data.gov.my/gtfs-realtime/vehicle-position/ktmb'
            : 'https://api.data.gov.my/gtfs-realtime/vehicle-position/prasarana?category=rapid-rail-kl'

    const res = await fetch(url)
    const msg = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(
        new Uint8Array(await res.arrayBuffer()),
    )

    return {
        type: 'FeatureCollection' as const,
        features: msg.entity
            .filter((e) => e.vehicle?.position)
            .map((e) => ({
                type: 'Feature' as const,
                properties: { id: e.id, route: e.vehicle!.trip?.routeId ?? '' },
                geometry: {
                    type: 'Point' as const,
                    coordinates: [e.vehicle!.position!.longitude, e.vehicle!.position!.latitude],
                },
            })),
    }
}