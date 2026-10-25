import type { RailLine } from '../metro/types'

type P = [number, number]
interface TrackGraph { coords: P[]; adj: { to: number; w: number }[][] }

const cache = new Map<string, TrackGraph | null>()

const hav = (a: P, b: P) => {
    const k = 111320
    return Math.hypot((b[1] - a[1]) * k, (b[0] - a[0]) * k * Math.cos((a[1] * Math.PI) / 180))
}

class Heap {
    private a: [number, number][] = []
    get size() { return this.a.length }
    push(x: [number, number]) {
        const a = this.a
        a.push(x)
        let i = a.length - 1
        while (i > 0) {
            const p = (i - 1) >> 1
            if (a[p][0] <= a[i][0]) break
                ;[a[p], a[i]] = [a[i], a[p]]
            i = p
        }
    }
    pop() {
        const a = this.a
        const top = a[0]
        const last = a.pop()!
        if (a.length) {
            a[0] = last
            let i = 0
            for (;;) {
                const l = 2 * i + 1, r = l + 1
                let m = i
                if (l < a.length && a[l][0] < a[m][0]) m = l
                if (r < a.length && a[r][0] < a[m][0]) m = r
                if (m === i) break
                    ;[a[m], a[i]] = [a[i], a[m]]
                i = m
            }
        }
        return top
    }
}

function build(line: RailLine): TrackGraph | null {
    if (!line.path?.length) return null
    const idx = new Map<string, number>()
    const coords: P[] = []
    const adj: { to: number; w: number }[][] = []
    const vid = (p: P) => {
        const k = `${p[0]},${p[1]}`
        let i = idx.get(k)
        if (i === undefined) { i = coords.length; idx.set(k, i); coords.push(p); adj.push([]) }
        return i
    }

    const ends: number[] = []
    for (const seg of line.path) {
        if (seg.length < 2) continue
        let prev = vid(seg[0])
        ends.push(prev)
        for (let i = 1; i < seg.length; i++) {
            const cur = vid(seg[i])
            if (cur === prev) continue
            const w = hav(coords[prev], coords[cur])
            adj[prev].push({ to: cur, w })
            adj[cur].push({ to: prev, w })
            prev = cur
        }
        ends.push(prev)
    }

    // OSM ways often stop a few metres short of each other: bridge small gaps
    const uniq = [...new Set(ends)]
    for (let i = 0; i < uniq.length; i++) {
        for (let j = i + 1; j < uniq.length; j++) {
            const d = hav(coords[uniq[i]], coords[uniq[j]])
            if (d <= 30 && !adj[uniq[i]].some((e) => e.to === uniq[j])) {
                adj[uniq[i]].push({ to: uniq[j], w: d })
                adj[uniq[j]].push({ to: uniq[i], w: d })
            }
        }
    }
    return { coords, adj }
}

function graphOf(line: RailLine) {
    if (!cache.has(line.id)) cache.set(line.id, build(line))
    return cache.get(line.id)!
}

// every vertex within 45 m (both tracks of a double-track line), or the single nearest within 300 m
function candidates(g: TrackGraph, p: P) {
    const near: { i: number; d: number }[] = []
    let best = { i: -1, d: Infinity }
    g.coords.forEach((c, i) => {
        const d = hav(p, c)
        if (d <= 45) near.push({ i, d })
        if (d < best.d) best = { i, d }
    })
    if (near.length) return near.sort((a, b) => a.d - b.d).slice(0, 20)
    return best.i >= 0 && best.d <= 300 ? [best] : []
}

/** Track geometry between two stations of one line, or null when it can't be found */
export function trackBetween(line: RailLine, a: P, b: P): P[] | null {
    const g = graphOf(line)
    if (!g) return null
    const S = candidates(g, a)
    const T = candidates(g, b)
    if (!S.length || !T.length) return null

    const targets = new Set(T.map((t) => t.i))
    const dist = new Map<number, number>()
    const prev = new Map<number, number>()
    const heap = new Heap()
    for (const s of S) { dist.set(s.i, s.d); heap.push([s.d, s.i]) }

    let end = -1
    while (heap.size) {
        const [d, u] = heap.pop()
        if (d > (dist.get(u) ?? Infinity)) continue
        if (targets.has(u)) { end = u; break }
        for (const e of g.adj[u]) {
            const nd = d + e.w
            if (nd < (dist.get(e.to) ?? Infinity)) {
                dist.set(e.to, nd)
                prev.set(e.to, u)
                heap.push([nd, e.to])
            }
        }
    }
    if (end < 0) return null

    const out: P[] = []
    for (let v: number | undefined = end; v !== undefined; v = prev.get(v)) out.unshift(g.coords[v])

    // reject absurd detours (wrong track, disconnected data): caller falls back to a straight line
    let len = 0
    for (let i = 0; i < out.length - 1; i++) len += hav(out[i], out[i + 1])
    return len <= hav(a, b) * 3 + 400 ? out : null
}