import { REGIONS } from '../metro/regions'
import type { CountryCode } from '../metro/types'

export interface Fare {
    label: string | { key: string; params?: Record<string, any> }
    currency: string
    low?: number
    high?: number
    note?: string | { key: string; params?: Record<string, any> }
}

export const countryAt = (p: [number, number]): CountryCode | undefined =>
    REGIONS.find((r) => p[0] >= r.bbox[0] && p[0] <= r.bbox[2] && p[1] >= r.bbox[1] && p[1] <= r.bbox[3])?.country

export function formatFare(f: Fare) {
    if (f.low === undefined || f.high === undefined) return { key: 'fares.checkApp' }
    return f.low === f.high ? `${f.currency} ${f.low}` : `${f.currency} ${f.low}–${f.high}`
}

const round = (cur: string, v: number) => (cur === 'NT$' ? Math.round(v / 10) * 10 : Math.round(v * 2) / 2)

interface Rate { name: string; base: number; perKm: number; perMin: number; min: number; note?: string }

const RIDE_HAIL: Partial<Record<CountryCode, { currency: string; providers: Rate[] }>> = {
    MY: { currency: 'RM', providers: [
            { name: 'Grab', base: 2.5, perKm: 1.0, perMin: 0.25, min: 5 },
            { name: 'Taxi (metered)', base: 3, perKm: 1.3, perMin: 0.3, min: 6 },
        ] },
    SG: { currency: 'S$', providers: [
            { name: 'Grab', base: 3.5, perKm: 0.9, perMin: 0.3, min: 8 },
            { name: 'Gojek', base: 3.3, perKm: 0.85, perMin: 0.28, min: 7 },
        ] },
    TW: { currency: 'NT$', providers: [
            { name: 'Uber', base: 70, perKm: 18, perMin: 3, min: 100 },
            { name: 'Taxi (metered)', base: 85, perKm: 25, perMin: 0, min: 85 },
        ] },
}

export const RAPID_ON_DEMAND_ZONES: { name: string; bbox: [number, number, number, number] }[] = []

export function rideHailFares(country: CountryCode | undefined, distanceM: number, durationS: number, origin: [number, number]): Fare[] {
    const out: Fare[] = []
    const cfg = country && RIDE_HAIL[country]
    if (cfg) {
        const km = distanceM / 1000
        const min = durationS / 60
        for (const p of cfg.providers) {
            const est = Math.max(p.min, p.base + p.perKm * km + p.perMin * min)
            out.push({
                label: p.name,
                currency: cfg.currency,
                low: round(cfg.currency, est * 0.85),
                high: round(cfg.currency, est * 1.3),
                note: { key: 'fares.surgeEstimate' }
            })
        }
    }
    for (const z of RAPID_ON_DEMAND_ZONES) {
        const [w, s, e, n] = z.bbox
        if (origin[0] >= w && origin[0] <= e && origin[1] >= s && origin[1] <= n) {
            out.push({
                label: { key: 'fares.rapidOnDemand', params: { name: z.name } },
                currency: 'RM',
                note: { key: 'fares.rapidOnDemandNote' }
            })
        }
    }
    return out
}

interface RailRate { currency: string; base: number; perKm: number; min: number; max: number }

const SG: RailRate = { currency: 'S$', base: 0.95, perKm: 0.08, min: 1.0, max: 2.6 }
const TW: RailRate = { currency: 'NT$', base: 16, perKm: 2.5, min: 20, max: 65 }

const RAIL: Record<string, RailRate> = {
    'Rapid Rail': { currency: 'RM', base: 0.8, perKm: 0.25, min: 1.2, max: 6.5 },
    'Rapid Bus': { currency: 'RM', base: 1, perKm: 0, min: 1, max: 1 },
    'KTMB': { currency: 'RM', base: 1, perKm: 0.12, min: 1, max: 10 },
    SMRT: SG,
    'SBS Transit': SG,
    'Taipei Metro': TW,
    'New Taipei Metro': TW,
    'Taoyuan Metro': TW,
    'Taiwan Railway': { currency: 'NT$', base: 15, perKm: 2.1, min: 15, max: 120 },
}

export function transitFare(segments: { operator: string; distanceM: number }[]): Fare[] {
    let low = 0
    let currency = ''
    const missing: string[] = []
    for (const s of segments) {
        const r = RAIL[s.operator]
        if (!r) { if (!missing.includes(s.operator)) missing.push(s.operator); continue }
        currency ||= r.currency
        low += Math.min(r.max, Math.max(r.min, r.base + r.perKm * (s.distanceM / 1000)))
    }
    if (!currency) return [{
        label: { key: 'fares.publicTransport' },
        currency: '',
        note: { key: 'fares.noFareData', params: { operators: missing.join(', ') } }
    }]
    return [{
        label: { key: 'fares.publicTransport' },
        currency,
        low: round(currency, low * 0.9),
        high: round(currency, low * 1.1),
        note: missing.length ? { key: 'fares.doesNotInclude', params: { operators: missing.join(', ') } } : { key: 'fares.rideEstimate' },
    }]
}