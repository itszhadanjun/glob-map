import type { CountryCode } from './types'

export interface Region {
    name: string
    country: CountryCode
    bbox: [number, number, number, number] // west, south, east, north
}

export const REGIONS: Region[] = [
    { name: 'Klang Valley', country: 'MY', bbox: [101.2, 2.7, 101.95, 3.45] },
    { name: 'Singapore', country: 'SG', bbox: [103.6, 1.2, 104.05, 1.48] },
    { name: 'Taipei', country: 'TW', bbox: [121.3, 24.9, 121.85, 25.3] },
]

// zoom >= LINE_ZOOM: lines appear (city view)
// zoom >= MARKER_ZOOM: station logo markers appear (close view)
export const LINE_ZOOM = 9
export const MARKER_ZOOM = 13