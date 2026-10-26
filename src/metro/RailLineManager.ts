import type { CountryCode, MergedStation, RailLine, Station } from './types'
import { AUTO_MERGE, MANUAL_MERGES } from './manualMerges'

// Auto-discovers every line file inside each country folder (MY/, TW/, SG/, ...)
const modules = import.meta.glob<{ default: RailLine }>(
    ['./*/*.ts', '!./*/index.ts'],
    { eager: true },
)

const normalize = (s: string) =>
    s.toLowerCase().replace(/\b(station|lrt|mrt)\b/g, '').replace(/[^\p{L}\p{N}]/gu, '')

const distM = (a: [number, number], b: [number, number]) => {
    const k = 111320
    return Math.hypot((b[1] - a[1]) * k, (b[0] - a[0]) * k * Math.cos((a[1] * Math.PI) / 180))
}

export interface NearbyConnection {
    station: MergedStation
    distM: number
}

export interface LineInterchange {
    station: MergedStation
    others: RailLine[]
}

class RailLineManager {
    private lines = new Map<string, RailLine>()
    private mergedCache = new Map<CountryCode, MergedStation[]>()

    constructor() {
        for (const [path, mod] of Object.entries(modules)) {
            const line = mod.default
            if (!line) continue

            const folder = path.split('/')[1]
            if (folder !== line.country) {
                console.warn(`[RailLineManager] ${path} declares country ${line.country}`)
            }
            this.lines.set(line.id, line)
        }
    }

    getAll(): RailLine[] {
        return [...this.lines.values()]
    }

    getById(id: string): RailLine | undefined {
        return this.lines.get(id)
    }

    getByCountry(country: CountryCode): RailLine[] {
        return this.getAll().filter((l) => l.country === country)
    }

    getCountries(): CountryCode[] {
        return [...new Set(this.getAll().map((l) => l.country))]
    }

    /** 'MY-KJL:KL Sentral' -> line + every station on it matching that name or code */
    private resolveRef(ref: string): { line: RailLine; stations: Station[] } | undefined {
        const i = ref.indexOf(':')
        if (i < 0) return
        const line = this.lines.get(ref.slice(0, i))
        if (!line) return
        const q = ref.slice(i + 1).trim()
        const nq = normalize(q)
        const stations = line.stations.filter((s) => s.code === q || normalize(s.name) === nq)
        return stations.length ? { line, stations } : undefined
    }

    private toMerged(
        name: string,
        members: MergedStation['members'],
        at?: [number, number],
    ): MergedStation {
        const n = members.length
        const coordinates: [number, number] = at ?? [
            members.reduce((a, m) => a + m.station.coordinates[0], 0) / n,
            members.reduce((a, m) => a + m.station.coordinates[1], 0) / n,
        ]
        return { name, key: normalize(name), coordinates, members }
    }

    /** One entry per physical station; interchanges list every line serving them */
    getMergedStations(country: CountryCode): MergedStation[] {
        const claimed = new Set<Station>()
        const manual: MergedStation[] = []

        // 1. manual rules win
        for (const rule of MANUAL_MERGES) {
            const members: MergedStation['members'] = []
            for (const ref of rule.stations) {
                const hit = this.resolveRef(ref)
                if (!hit) {
                    console.warn(`[manualMerges] no station matches "${ref}"`)
                    continue
                }
                if (hit.line.country !== country) continue
                hit.stations.forEach((s) => claimed.add(s))
                if (!members.some((m) => m.line.id === hit.line.id)) {
                    members.push({ line: hit.line, station: hit.stations[0] })
                }
            }
            if (members.length) {
                manual.push(this.toMerged(rule.name ?? members[0].station.name, members, rule.at))
            }
        }

        // 2. automatic proximity merge for everything not claimed
        const clusters: MergedStation[] = []
        for (const line of this.getByCountry(country)) {
            for (const station of line.stations) {
                if (claimed.has(station)) continue
                const key = normalize(station.name)

                const found = AUTO_MERGE
                    ? clusters.find((c) => {
                        const d = distM(c.coordinates, station.coordinates)
                        const sameName = key !== '' && key !== 'unknown' && c.key === key
                        return d < 80 || (d < 400 && sameName)
                    })
                    : undefined

                if (found) {
                    if (!found.members.some((m) => m.line.id === line.id)) {
                        found.members.push({ line, station })
                    }
                    const n = found.members.length
                    found.coordinates = [
                        found.coordinates[0] + (station.coordinates[0] - found.coordinates[0]) / n,
                        found.coordinates[1] + (station.coordinates[1] - found.coordinates[1]) / n,
                    ]
                } else {
                    clusters.push({
                        name: station.name,
                        key,
                        coordinates: [...station.coordinates] as [number, number],
                        members: [{ line, station }],
                    })
                }
            }
        }

        return [...manual, ...clusters]
    }

    private merged(country: CountryCode) {
        if (!this.mergedCache.has(country)) this.mergedCache.set(country, this.getMergedStations(country))
        return this.mergedCache.get(country)!
    }

    /** Other stations within walking distance that offer a line this station doesn't */
    getNearbyConnections(st: MergedStation, maxM = 350): NearbyConnection[] {
        const country = st.members[0]?.line.country
        if (!country) return []
        const mine = new Set(st.members.map((m) => m.line.id))
        const myStations = new Set(st.members.map((m) => m.station))

        return this.merged(country)
            .filter((o) => !o.members.some((m) => myStations.has(m.station)))
            .filter((o) => o.members.some((m) => !mine.has(m.line.id)))
            .map((o) => ({ station: o, distM: distM(st.coordinates, o.coordinates) }))
            .filter((c) => c.distM <= maxM)
            .sort((a, b) => a.distM - b.distM)
            .slice(0, 6)
    }

    /** Every interchange along one line, in the order the line stores its stations */
    getLineInterchanges(line: RailLine): LineInterchange[] {
        const out: { order: number; item: LineInterchange }[] = []
        for (const st of this.merged(line.country)) {
            const mine = st.members.find((m) => m.line.id === line.id)
            if (!mine || st.members.length < 2) continue
            out.push({
                order: line.stations.indexOf(mine.station),
                item: { station: st, others: st.members.filter((m) => m.line.id !== line.id).map((m) => m.line) },
            })
        }
        return out.sort((a, b) => a.order - b.order).map((o) => o.item)
    }

    /** Line as GeoJSON, ready for a MapLibre source */
    toGeoJSON(line: RailLine) {
        const coordinates = line.path ?? [line.stations.map((s) => s.coordinates)]

        return {
            type: 'FeatureCollection' as const,
            features: [
                {
                    type: 'Feature' as const,
                    properties: { id: line.id, color: line.color },
                    geometry: { type: 'MultiLineString' as const, coordinates },
                },
            ],
        }
    }
}

export const railLineManager = new RailLineManager()