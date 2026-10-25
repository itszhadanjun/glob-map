export type CountryCode = 'MY' | 'TW' | 'SG'

export type RailType = 'LRT' | 'MRT' | 'BRT' | 'Monorail' | 'Commuter' | 'HSR'

export interface Station {
    code: string // e.g. 'KJ13'
    name: string
    coordinates: [number, number] // [lng, lat]
    interchanges?: string[] // codes of stations on other lines
}

export interface MergedStation {
    name: string
    key: string // normalized name, used for matching
    coordinates: [number, number] // average of member positions
    members: { line: RailLine; station: Station }[]
}

export interface RailLine {
    id: string // unique, e.g. 'MY-KJL'
    code: string // short code, e.g. 'KJL'
    name: string
    country: CountryCode
    type: RailType
    operator: string
    color: string
    stations: Station[] // ordered from one terminus to the other
    path?: [number, number][][] // real track geometry as separate segments
}