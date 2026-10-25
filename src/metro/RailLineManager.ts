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

class RailLineManager {
    private lines = new Map<string, RailLine>()

    constructor() {
        for (const [path, mod] of Object.entries(modules)) {
            const line = mod.default
            if (!line) continue

            // path looks like './MY/KJL.ts', make sure the folder matches the line's country
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
                hit.stations.forEach((s) => claimed.add(s)) // both direction platforms
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