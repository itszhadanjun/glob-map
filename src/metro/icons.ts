import type { RailType } from './types'

export type IconKind = 'metro' | 'monorail' | 'train' | 'bus'

const SVG: Record<IconKind, string> = {
    // front-facing metro car (MRT, LRT)
    metro:
        '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8 2 4 2.5 4 6v9.5C4 17.4 5.6 19 7.5 19L6 20.5V21h2l2-2h4l2 2h2v-.5L16.5 19c1.9 0 3.5-1.6 3.5-3.5V6c0-3.5-4-4-8-4zM7.5 17c-.8 0-1.5-.7-1.5-1.5S6.7 14 7.5 14s1.5.7 1.5 1.5S8.3 17 7.5 17zM11 11H6V6h5v5zm2 0V6h5v5h-5zm3.5 6c-.8 0-1.5-.7-1.5-1.5s.7-1.5 1.5-1.5 1.5.7 1.5 1.5-.7 1.5-1.5 1.5z"/></svg>',
    // car riding on a single elevated beam
    monorail:
        '<svg viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="M5 3h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm1 2v4h5V5H6zm7 0v4h5V5h-5zM7 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm10 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2z"/><path d="M2 17h20v2H2z"/><path d="M11 19h2v3h-2z"/></svg>',
    // commuter / intercity train with one wide windshield
    train:
        '<svg viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="M12 2c-4 0-7 .6-7 4v9a3 3 0 0 0 3 3l-1.5 2h2l1.5-2h4l1.5 2h2L16 18a3 3 0 0 0 3-3V6c0-3.4-3-4-7-4zM7 8h10v4H7V8zm1.5 8a1.2 1.2 0 1 1 0-2.4 1.2 1.2 0 0 1 0 2.4zm7 0a1.2 1.2 0 1 1 0-2.4 1.2 1.2 0 0 1 0 2.4z"/></svg>',
    // bus (BRT)
    bus:
        '<svg viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="M4 16c0 .9.4 1.7 1 2.2V20a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1h8v1a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1.8c.6-.5 1-1.3 1-2.2V6c0-3.5-3.6-4-8-4S4 2.5 4 6v10zm3.5 1a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm9 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zM6 6h12v5H6V6z"/></svg>',
}

const KIND: Record<RailType, IconKind> = {
    MRT: 'metro',
    LRT: 'metro',
    Monorail: 'monorail',
    Commuter: 'train',
    HSR: 'train',
    BRT: 'bus',
}

const PRIORITY: IconKind[] = ['metro', 'monorail', 'train', 'bus']

/** Icon kinds for a set of line types, most important first, no duplicates */
export function iconKinds(types: RailType[]): IconKind[] {
    const set = new Set(types.map((t) => KIND[t]))
    return PRIORITY.filter((k) => set.has(k))
}

export const iconSvg = (kind: IconKind) => SVG[kind]