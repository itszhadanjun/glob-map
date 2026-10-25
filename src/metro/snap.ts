import type { RailLine } from './types'

type P = [number, number] // [lng, lat]

/** Move a point onto the nearest track of the given lines, if within maxM metres */
export function snapToLines(point: P, lines: RailLine[], maxM = 80): P {
    const k = 111320
    const cos = Math.cos((point[1] * Math.PI) / 180)
    // local metres relative to the point
    const toM = (p: P): P => [(p[0] - point[0]) * k * cos, (p[1] - point[1]) * k]

    let best: P | undefined
    let bestD = maxM

    for (const line of lines) {
        const segments = line.path ?? [line.stations.map((s) => s.coordinates)]
        for (const seg of segments) {
            for (let i = 0; i < seg.length - 1; i++) {
                const a = toM(seg[i])
                const b = toM(seg[i + 1])
                const dx = b[0] - a[0]
                const dy = b[1] - a[1]
                const len2 = dx * dx + dy * dy
                // projection of the origin (our point) onto segment a-b
                const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(a[0] * dx + a[1] * dy) / len2))
                const d = Math.hypot(a[0] + t * dx, a[1] + t * dy)
                if (d < bestD) {
                    bestD = d
                    best = [seg[i][0] + (seg[i + 1][0] - seg[i][0]) * t, seg[i][1] + (seg[i + 1][1] - seg[i][1]) * t]
                }
            }
        }
    }
    return best ?? point
}