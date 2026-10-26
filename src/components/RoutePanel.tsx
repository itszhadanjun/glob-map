import { useEffect, useRef } from 'react'
import type { Place, Route } from '../navigation/routing'
import { formatFare } from '../navigation/fares'
import { useIsMobile } from '../hooks/useIsMobile'

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

const iconBtn: React.CSSProperties = {
    border: 0, background: 'none', cursor: 'pointer', color: '#777', fontSize: 20, lineHeight: 1, padding: '4px 8px',
}

export default function RoutePanel({
                                       destination, routes, selected, status, error, collapsed,
                                       onSelect, onClose, onToggle, onStepClick, onStart,
                                   }: {
    destination: Place
    routes: Route[]
    selected: number
    status: RouteStatus
    error: string
    collapsed: boolean
    onSelect: (i: number) => void
    onClose: () => void
    onToggle: () => void
    onStepClick: (lngLat: [number, number]) => void
    onStart: (simulate: boolean) => void
}) {
    const mobile = useIsMobile()
    const ref = useRef<HTMLDivElement | null>(null)
    const route = routes[selected]

    // tell the map controls how tall the sheet is, so they sit above it on phones
    useEffect(() => {
        const el = ref.current
        const root = document.documentElement
        if (!el || !mobile) {
            root.style.setProperty('--panel-h', '0px')
            return
        }
        const ro = new ResizeObserver(() => root.style.setProperty('--panel-h', `${el.offsetHeight}px`))
        ro.observe(el)
        return () => {
            ro.disconnect()
            root.style.setProperty('--panel-h', '0px')
        }
    }, [mobile])

    const frame: React.CSSProperties = mobile
        ? { left: 0, right: 0, bottom: 0, borderRadius: '18px 18px 0 0', maxHeight: collapsed ? 'none' : '62vh', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }
        : { left: 12, bottom: 12, width: 340, borderRadius: 12, maxHeight: collapsed ? 'none' : '55vh' }

    return (
        <div
            ref={ref}
            style={{ position: 'fixed', zIndex: 2, display: 'flex', flexDirection: 'column', background: '#fff', color: '#222', boxShadow: '0 4px 18px rgba(0,0,0,.28)', fontFamily: 'system-ui, sans-serif', overflow: 'hidden', ...frame }}
        >
            {/* drag handle (phones) */}
            {mobile && (
                <div onClick={onToggle} style={{ padding: '8px 0 2px', cursor: 'pointer' }}>
                    <div style={{ width: 40, height: 4, borderRadius: 2, background: '#d0d4da', margin: '0 auto' }} />
                </div>
            )}

            {/* header */}
            <div style={{ padding: mobile ? '4px 8px 8px 16px' : '10px 8px 10px 14px', display: 'flex', alignItems: 'center', gap: 4, borderBottom: collapsed ? 'none' : '1px solid #eee' }}>
                <div onClick={onToggle} style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5 }}>Route to</div>
                    <div style={{ fontWeight: 700, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{destination.name}</div>
                </div>
                <button onClick={onToggle} aria-label={collapsed ? 'Expand' : 'Minimise'} style={{ ...iconBtn, fontSize: 18 }}>
                    {collapsed ? '⌃' : '⌄'}
                </button>
                <button onClick={onClose} aria-label="Close" style={iconBtn}>×</button>
            </div>

            {/* collapsed summary */}
            {collapsed && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px 12px' }}>
                    {route ? (
                        <>
                            <div onClick={onToggle} style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>
                                <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{route.title}</div>
                                <div style={{ fontSize: 12, color: '#666' }}>
                                    <b style={{ color: '#222' }}>{fmtTime(route.durationS)}</b> · {fmtDist(route.distanceM)}
                                </div>
                            </div>
                            <button onClick={() => onStart(false)} style={{ padding: '9px 16px', border: 0, borderRadius: 10, background: '#1a9d5c', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                                ▶ Start
                            </button>
                        </>
                    ) : (
                        <div style={{ fontSize: 13, color: status === 'error' ? '#c00' : '#666' }}>
                            {status === 'routing' ? 'Finding routes...' : status === 'error' ? error || 'No route found.' : 'Set a starting point to see routes.'}
                        </div>
                    )}
                </div>
            )}

            {/* full content */}
            {!collapsed && (
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
                                style={{ flex: 1, padding: '11px 0', border: 0, borderRadius: 10, background: '#1a9d5c', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
                            >
                                ▶ Start journey
                            </button>
                            <button
                                onClick={() => onStart(true)}
                                title="Move along the route automatically, for testing"
                                style={{ padding: '11px 14px', border: '1px solid #ddd', borderRadius: 10, background: '#fff', color: '#333', fontSize: 13, cursor: 'pointer' }}
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
            )}
        </div>
    )
}