import { useEffect, useRef, useState } from 'react'
import type { Mode, Place } from '../navigation/routing'
import { useIsMobile } from '../hooks/useIsMobile'

interface Result extends Place {
    detail: string
}

const ENDPOINT = 'https://photon.komoot.io/api/'

function toResult(f: any): Result | null {
    const p = f.properties ?? {}
    const c = f.geometry?.coordinates
    if (!c || !p.name) return null
    const detail = [p.street, p.district, p.city, p.state, p.country]
        .filter((v, i, a) => v && v !== p.name && a.indexOf(v) === i)
        .join(', ')
    return { name: p.name, detail, coordinates: [c[0], c[1]] }
}

function PlaceInput({
                        value, placeholder, dot, busy, onSelect, onClear, getBias, action,
                    }: {
    value: Place | null
    placeholder: string
    dot: string
    busy?: boolean
    onSelect: (p: Place) => void
    onClear: () => void
    getBias?: () => [number, number] | undefined
    action?: React.ReactNode
}) {
    const [text, setText] = useState(value?.name ?? '')
    const [results, setResults] = useState<Result[]>([])
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [failed, setFailed] = useState(false)
    const [active, setActive] = useState(-1)
    const boxRef = useRef<HTMLDivElement | null>(null)
    const valueRef = useRef(value)
    valueRef.current = value

    // keep the text in step with the value (swap, auto location, clear)
    useEffect(() => { setText(value?.name ?? '') }, [value])

    // debounced search
    useEffect(() => {
        const q = text.trim()
        if (q.length < 2 || q === valueRef.current?.name) {
            setResults([]); setLoading(false); setFailed(false)
            return
        }
        const ctrl = new AbortController()
        const timer = setTimeout(async () => {
            setLoading(true); setFailed(false)
            try {
                const bias = getBias?.()
                const url = `${ENDPOINT}?q=${encodeURIComponent(q)}&limit=6&lang=en${bias ? `&lon=${bias[0]}&lat=${bias[1]}` : ''}`
                const res = await fetch(url, { signal: ctrl.signal })
                if (!res.ok) throw new Error(`HTTP ${res.status}`)
                const data = await res.json()
                setResults((data.features ?? []).map(toResult).filter(Boolean) as Result[])
                setActive(-1)
                setOpen(true)
            } catch (e: any) {
                if (e.name !== 'AbortError') { setFailed(true); setResults([]) }
            } finally {
                if (!ctrl.signal.aborted) setLoading(false)
            }
        }, 350)
        return () => { clearTimeout(timer); ctrl.abort() }
    }, [text])

    useEffect(() => {
        const h = (e: MouseEvent) => {
            if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
        }
        document.addEventListener('mousedown', h)
        return () => document.removeEventListener('mousedown', h)
    }, [])

    const choose = (r: Result) => {
        setText(r.name)
        setOpen(false)
        onSelect({ name: r.name, coordinates: r.coordinates })
    }

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, results.length - 1)) }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
        else if (e.key === 'Enter') { const r = results[active >= 0 ? active : 0]; if (r) choose(r) }
        else if (e.key === 'Escape') setOpen(false)
    }

    const showList = open && (results.length > 0 || failed || (text.trim().length >= 2 && !loading))

    return (
        <div ref={boxRef} style={{ position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f5f6f8', borderRadius: 8, padding: '0 8px' }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: dot, flexShrink: 0 }} />
                <input
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onFocus={(e) => { e.target.select(); if (results.length) setOpen(true) }}
                    onKeyDown={onKeyDown}
                    placeholder={busy ? 'Finding your location...' : placeholder}
                    style={{ flex: 1, minWidth: 0, border: 0, outline: 'none', padding: '10px 0', fontSize: 14, background: 'transparent', color: '#222' }}
                />
                {loading && <span style={{ fontSize: 11, color: '#888' }}>...</span>}
                {text && !loading && (
                    <button onClick={() => { setText(''); setResults([]); setOpen(false); onClear() }} aria-label="Clear" style={{ border: 0, background: 'none', fontSize: 16, cursor: 'pointer', color: '#888' }}>×</button>
                )}
                {action}
            </div>

            {showList && (
                <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', marginTop: 4, zIndex: 5, background: '#fff', borderRadius: 10, boxShadow: '0 2px 10px rgba(0,0,0,.3)', overflow: 'hidden', maxHeight: 280, overflowY: 'auto' }}>
                    {failed && <div style={{ padding: 12, fontSize: 13, color: '#c00' }}>Search failed. Try again in a moment.</div>}
                    {!failed && results.length === 0 && <div style={{ padding: 12, fontSize: 13, color: '#888' }}>No places found.</div>}
                    {results.map((r, i) => (
                        <div
                            key={i}
                            onMouseDown={(e) => { e.preventDefault(); choose(r) }}
                            onMouseEnter={() => setActive(i)}
                            style={{ padding: '9px 12px', cursor: 'pointer', background: i === active ? '#f2f6fd' : '#fff', borderBottom: '1px solid #f3f3f3' }}
                        >
                            <div style={{ fontSize: 14, fontWeight: 600, color: '#222' }}>{r.name}</div>
                            {r.detail && <div style={{ fontSize: 12, color: '#777', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.detail}</div>}
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

const MODES: { id: Mode; label: string; icon: string }[] = [
    { id: 'drive', label: 'Drive', icon: '🚗' },
    { id: 'ride', label: 'Ride', icon: '🚕' },
    { id: 'transit', label: 'Transit', icon: '🚆' },
    { id: 'walk', label: 'Walk', icon: '🚶' },
]

export default function Searchbox({
                                      origin, destination, mode, locating,
                                      onOrigin, onDestination, onMode, onUseMyLocation, onSwap, getBias,
                                  }: {
    origin: Place | null
    destination: Place | null
    mode: Mode
    locating: boolean
    onOrigin: (p: Place | null) => void
    onDestination: (p: Place | null) => void
    onMode: (m: Mode) => void
    onUseMyLocation: () => void
    onSwap: () => void
    getBias?: () => [number, number] | undefined
}) {
    const mobile = useIsMobile()

    // phones: a full-width bar across the top; desktop: a floating card
    const frame: React.CSSProperties = mobile
        ? { top: 0, left: 0, right: 0, borderRadius: '0 0 16px 16px', padding: 'calc(10px + env(safe-area-inset-top, 0px)) 12px 12px' }
        : { top: 12, left: 12, width: 340, borderRadius: 12, padding: 10 }

    return (
        <div style={{ position: 'fixed', zIndex: 3, boxSizing: 'border-box', background: '#fff', boxShadow: '0 2px 10px rgba(0,0,0,.25)', fontFamily: 'system-ui, sans-serif', ...frame }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <PlaceInput
                        value={origin}
                        placeholder="Starting point"
                        dot="#2b7de9"
                        busy={locating}
                        onSelect={onOrigin}
                        onClear={() => onOrigin(null)}
                        getBias={getBias}
                        action={
                            <button onClick={onUseMyLocation} title="Use my location" aria-label="Use my location" style={{ border: 0, background: 'none', fontSize: 15, cursor: 'pointer', color: '#444' }}>
                                📍
                            </button>
                        }
                    />
                    <PlaceInput
                        value={destination}
                        placeholder="Where to?"
                        dot="#e5484d"
                        onSelect={onDestination}
                        onClear={() => onDestination(null)}
                        getBias={getBias}
                    />
                </div>
                <button
                    onClick={onSwap}
                    title="Swap"
                    aria-label="Swap start and destination"
                    style={{ border: '1px solid #ddd', background: '#fff', color: '#444', borderRadius: 8, width: 34, height: 34, cursor: 'pointer', fontSize: 16, flexShrink: 0 }}
                >
                    ⇅
                </button>
            </div>

            <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                {MODES.map((m) => (
                    <button
                        key={m.id}
                        onClick={() => onMode(m.id)}
                        style={{
                            flex: 1, padding: '7px 0', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
                            border: `1px solid ${mode === m.id ? '#2b7de9' : '#ddd'}`,
                            background: mode === m.id ? '#eaf2fe' : '#fff',
                            color: mode === m.id ? '#1d5fc0' : '#444',
                        }}
                    >
                        {m.icon} {mobile ? '' : m.label}
                    </button>
                ))}
            </div>
        </div>
    )
}