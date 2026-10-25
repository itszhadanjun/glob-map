import type { Place, Route } from '../navigation/routing'
import { formatFare } from '../navigation/fares'

export type RouteStatus = 'idle' | 'routing' | 'error'

const fmtDist = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`)
const fmtTime = (s: number) => {
    const min = Math.max(1, Math.round(s / 60))
    return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`
}

const cheapest = (r: Route) => {
    const priced = r.fares.filter((f) => f.low !== undefined)
    if (!priced.length) return ''
    const f = priced.reduce((a, b) => (b.low! < a.low! ? b : a))
    return formatFare(f)
}

export default function RoutePanel({
                                       destination, routes, selected, status, error, onSelect, onClose, onStepClick, onStart,
                                   }: {
    destination: Place
    routes: Route[]
    selected: number
    status: RouteStatus
    error: string
    onSelect: (i: number) => void
    onClose: () => void
    onStepClick: (lngLat: [number, number]) => void
    onStart: (simulate: boolean) => void
}) {
    const route = routes[selected]

    return (
        <div style={{ position: 'fixed', left: 12, bottom: 12, zIndex: 2, width: 340, maxHeight: '55vh', display: 'flex', flexDirection: 'column', background: '#fff', color: '#222', borderRadius: 12, boxShadow: '0 4px 16px rgba(0,0,0,.25)', fontFamily: 'system-ui, sans-serif', overflow: 'hidden' }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid #eee', display: 'flex', alignItems: 'start', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5 }}>Route to</div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{destination.name}</div>
                </div>
                <button onClick={onClose} aria-label="Close" style={{ border: 0, background: 'none', fontSize: 20, cursor: 'pointer', color: '#888' }}>×</button>
            </div>

            <div style={{ overflowY: 'auto' }}>
                {status === 'routing' && <div style={{ padding: 14, fontSize: 13, color: '#666' }}>Finding routes...</div>}
                {status === 'error' && <div style={{ padding: 14, fontSize: 13, color: '#c00' }}>{error || 'No route found.'}</div>}
                {!routes.length && status === 'idle' && <div style={{ padding: 14, fontSize: 13, color: '#666' }}>Set a starting point to see routes.</div>}

                {routes.map((r, i) => (
                    <div
                        key={r.id}
                        onClick={() => onSelect(i)}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer', background: i === selected ? '#eaf2fe' : '#fff', borderBottom: '1px solid #f1f1f1', borderLeft: `4px solid ${i === selected ? '#2b7de9' : 'transparent'}` }}
                    >
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700 }}>{r.title}</div>
                            <div style={{ fontSize: 12, color: '#666' }}>{fmtDist(r.distanceM)}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 15, fontWeight: 700 }}>{fmtTime(r.durationS)}</div>
                            {cheapest(r) && <div style={{ fontSize: 11, color: '#666' }}>from {cheapest(r)}</div>}
                        </div>
                    </div>
                ))}

                {route && (
                    <div style={{ display: 'flex', gap: 8, padding: '10px 14px', borderBottom: '1px solid #eee' }}>
                        <button
                            onClick={() => onStart(false)}
                            style={{ flex: 1, padding: '10px 0', border: 0, borderRadius: 10, background: '#1a9d5c', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
                        >
                            ▶ Start journey
                        </button>
                        <button
                            onClick={() => onStart(true)}
                            title="Move along the route automatically, for testing"
                            style={{ padding: '10px 14px', border: '1px solid #ddd', borderRadius: 10, background: '#fff', fontSize: 13, cursor: 'pointer' }}
                        >
                            Demo
                        </button>
                    </div>
                )}

                {route && route.fares.length > 0 && (
                    <div style={{ padding: '10px 14px', borderBottom: '1px solid #eee' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Estimated fare</div>
                        {route.fares.map((f, i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, padding: '3px 0' }}>
                <span>
                  {f.label}
                    {f.note && <div style={{ fontSize: 11, color: '#999' }}>{f.note}</div>}
                </span>
                                <b style={{ whiteSpace: 'nowrap' }}>{formatFare(f)}</b>
                            </div>
                        ))}
                    </div>
                )}
                {route?.note && <div style={{ padding: '6px 14px', fontSize: 11, color: '#999' }}>{route.note}</div>}

                {route && (
                    <div style={{ padding: '4px 14px 12px' }}>
                        {route.steps.map((s, i) => (
                            <div
                                key={i}
                                onClick={() => onStepClick(s.location)}
                                style={{ display: 'flex', gap: 10, padding: '7px 0 7px 8px', borderBottom: '1px solid #f3f3f3', borderLeft: `4px solid ${s.color ?? 'transparent'}`, fontSize: 13, cursor: 'pointer' }}
                            >
                                <span style={{ flex: 1 }}>{s.text}</span>
                                {s.distanceM > 0 && <span style={{ color: '#888', whiteSpace: 'nowrap' }}>{fmtDist(s.distanceM)}</span>}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}