import type { CountryCode } from './types'

export interface Region {
    name: string
    country: CountryCode
    bbox: [number, number, number, number] // west, south, east, north
}

// city regions: used to decide which stations to build
export const REGIONS: Region[] = [
    { name: 'Klang Valley', country: 'MY', bbox: [101.2, 2.7, 101.95, 3.45] },
    { name: 'Singapore', country: 'SG', bbox: [103.6, 1.2, 104.05, 1.48] },
    { name: 'Taipei', country: 'TW', bbox: [121.3, 24.9, 121.85, 25.3] },
]

// whole-country boxes: used to decide which country you are looking at
// listed smallest first, because Singapore sits inside the Malaysia box
const COUNTRIES: { country: CountryCode; bbox: [number, number, number, number] }[] = [
    { country: 'SG', bbox: [103.55, 1.15, 104.15, 1.55] },
    { country: 'TW', bbox: [119.3, 21.8, 122.4, 25.5] },
    { country: 'MY', bbox: [99.4, 0.8, 104.7, 7.0] }, // peninsular Malaysia
]

/** The country in view: the one under the map centre, else the one covering most of the screen */
export function viewedCountry(
    lng: number,
    lat: number,
    view: [number, number, number, number], // west, south, east, north
): CountryCode | undefined {
    for (const c of COUNTRIES) {
        const [w, s, e, n] = c.bbox
        if (lng >= w && lng <= e && lat >= s && lat <= n) return c.country
    }

    let best: CountryCode | undefined
    let bestArea = 0
    for (const c of COUNTRIES) {
        const [w, s, e, n] = c.bbox
        const area = Math.max(0, Math.min(e, view[2]) - Math.max(w, view[0])) * Math.max(0, Math.min(n, view[3]) - Math.max(s, view[1]))
        if (area > bestArea) { bestArea = area; best = c.country }
    }
    return best
}

// zoom >= LINE_ZOOM: lines of the viewed country appear (country overview)
// zoom >= VEHICLE_ZOOM: live train dots appear
// zoom >= MARKER_ZOOM: station markers appear (close view)
export const LINE_ZOOM = 5
export const VEHICLE_ZOOM = 9
export const MARKER_ZOOM = 13