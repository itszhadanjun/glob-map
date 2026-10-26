import { useEffect, useMemo, useState } from 'react'
import type { MergedStation, RailLine, Station } from '../metro/types'
import { railLineManager } from '../metro/RailLineManager'
import { OPERATOR_LOGOS } from '../metro/operators'
import { departuresForMembers, type Departure } from '../metro/live'

export interface CardMember {
    line: RailLine
    station?: Station
}

// "Now", "12 min", "3 h 11 min"
const fmtMin = (m: number) => {
    if (m <= 0) return 'Now'
    if (m < 60) return `${m} min`
    const h = Math.floor(m / 60)
    const r = m % 60
    return r ? `${h} h ${r} min` : `${h} h`
}

// readable text colour on top of a line colour
const ink = (hex: string) => {
    const n = parseInt(hex.replace('#', ''), 16)
    const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
    return lum > 0.62 ? '#222' : '#fff'
}

// "From Bandar Utama to Johan Setia" / "To Tamsui" -> the destination
const destOf = (h: string) => h.match(/\bto\s+(.+)$/i)?.[1] ?? h

function colorFor(d: Departure, members: CardMember[]) {
    const r = d.route.toLowerCase()
    const hit = members.find((m) => {
        const code = m.line.code.toLowerCase()
        return code.length <= 2 ? r === code : r.includes(code) || m.line.name.toLowerCase().includes(r.replace(/\s*line$/, ''))
    })
    return (hit ?? (members.length === 1 ? members[0] : undefined))?.line.color ?? '#9aa3af'
}

const walkMin = (m: number) => Math.max(1, Math.round((m * 1.3) / 80)) // ~80 m per minute, with a detour factor

function LineChip({ line }: { line: RailLine }) {
    return (
        <span
            title={line.name}
            style={{ display: 'inline-block', background: line.color, color: ink(line.color), borderRadius: 999, padding: '1px 8px', fontSize: 11.5, fontWeight: 800, lineHeight: '18px' }}
        >
      {line.code}
    </span>
    )
}

function OperatorLogo({ operator }: { operator: string }) {
    const [failed, setFailed] = useState(false)
    const src = OPERATOR_LOGOS[operator]
    const box: React.CSSProperties = { width: 34, height: 34, flexShrink: 0 }

    if (!src || failed) {
        const initials = operator.split(/\s+/).map((w) => w[0]).join('').slice(0, 3).toUpperCase()
        return (
            <div style={{ ...box, borderRadius: 8, background: '#fff', color: '#667', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 11 }}>
                {initials}
            </div>
        )
    }
    return <img src={src} alt={operator} onError={() => setFailed(true)} style={{ ...box, objectFit: 'contain' }} />
}

const sectionTitle: React.CSSProperties = {
    fontSize: 11, fontWeight: 800, color: '#8a93a0', textTransform: 'uppercase', letterSpacing: 0.6,
}

const linkRow: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
    padding: '8px 0', border: 0, background: 'none', font: 'inherit', color: 'inherit',
}

/** Station card: lines you can change to here, plus stations a short walk away */
function StationConnections({
                                station, onJump,
                            }: {
    station: MergedStation
    onJump?: (c: [number, number]) => void
}) {
    const nearby = useMemo(() => railLineManager.getNearbyConnections(station), [station])
    const interchange = station.members.length > 1

    if (!interchange && !nearby.length) return null

    return (
        <div style={{ marginTop: 14 }}>
            {interchange && (
                <div style={{ marginBottom: nearby.length ? 12 : 0 }}>
                    <div style={{ ...sectionTitle, marginBottom: 6 }}>Change here to</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {station.members.map((m) => <LineChip key={m.line.id} line={m.line} />)}
                    </div>
                </div>
            )}

            {nearby.length > 0 && (
                <div>
                    <div style={{ ...sectionTitle, marginBottom: 2 }}>Nearby connections</div>
                    {nearby.map((c, i) => (
                        <button
                            key={i}
                            onClick={() => onJump?.(c.station.coordinates)}
                            style={{ ...linkRow, cursor: onJump ? 'pointer' : 'default', borderTop: i ? '1px solid #f0f2f5' : 'none' }}
                        >
                            <span style={{ fontSize: 15 }}>🚶</span>
                            <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.station.name}</span>
                <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
                  {c.station.members.map((m) => <LineChip key={m.line.id} line={m.line} />)}
                </span>
              </span>
                            <span style={{ fontSize: 12, color: '#7b8493', whiteSpace: 'nowrap' }}>{walkMin(c.distM)} min walk</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}

/** Track card: every interchange along one line */
function LineInterchanges({ line, onJump }: { line: RailLine; onJump?: (c: [number, number]) => void }) {
    const [open, setOpen] = useState(false)
    const list = useMemo(() => (open ? railLineManager.getLineInterchanges(line) : []), [open, line])

    return (
        <div style={{ marginTop: 6 }}>
            <button
                onClick={() => setOpen((o) => !o)}
                style={{ border: 0, background: 'none', padding: '2px 0', font: 'inherit', fontSize: 12.5, fontWeight: 700, color: '#2b6fd6', cursor: 'pointer' }}
            >
                {open ? 'Hide interchanges ▴' : 'Show interchanges ▾'}
            </button>
            {open && (
                <div style={{ maxHeight: 'min(220px, 30vh)', overflowY: 'auto' }}>
                    {!list.length && <div style={{ fontSize: 12.5, color: '#8a93a0', padding: '6px 0' }}>No interchanges found on this line.</div>}
                    {list.map((x, i) => (
                        <button
                            key={i}
                            onClick={() => onJump?.(x.station.coordinates)}
                            style={{ ...linkRow, cursor: onJump ? 'pointer' : 'default', borderTop: i ? '1px solid #eceff3' : 'none' }}
                        >
                            <span style={{ flex: 1, minWidth: 0, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.station.name}</span>
                            <span style={{ display: 'flex', gap: 4 }}>{x.others.map((l) => <LineChip key={l.id} line={l} />)}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}

type Timetable = Departure[] | 'nodata' | 'error' | undefined // undefined = loading

export default function LineCard({
                                     title,
                                     members,
                                     station,
                                     showTimetable = false,
                                     onJump,
                                 }: {
    title?: string
    members: CardMember[]
    station?: MergedStation
    showTimetable?: boolean
    onJump?: (coordinates: [number, number]) => void
}) {
    const [timetable, setTimetable] = useState<Timetable>(undefined)

    useEffect(() => {
        if (!showTimetable) return
        let cancelled = false
        const load = async () => {
            try {
                const d = await departuresForMembers(members)
                if (!cancelled) setTimetable(d ?? 'nodata')
            } catch {
                if (!cancelled) setTimetable('error')
            }
        }
        load()
        const timer = setInterval(load, 30_000)
        return () => { cancelled = true; clearInterval(timer) }
    }, [members, showTimetable])

    const muted: React.CSSProperties = { fontSize: 12.5, color: '#8a93a0', padding: '6px 0' }
    const estimated = Array.isArray(timetable) && timetable.length > 0 && timetable.every((d) => d.estimated)

    return (
        <div
            style={{
                width: 'min(340px, calc(100vw - 40px))',
                maxHeight: '70vh',
                overflowY: 'auto',
                background: '#fff',
                color: '#1f2430',
                fontFamily: 'system-ui, sans-serif',
                fontSize: 'clamp(13px, 3.4vw, 14px)',
            }}
        >
            {/* one colour segment per line */}
            <div style={{ display: 'flex', height: 6 }}>
                {members.map((m) => <div key={m.line.id} style={{ flex: 1, background: m.line.color }} />)}
            </div>

            <div style={{ padding: 'clamp(12px, 3.5vw, 16px)' }}>
                {title && (
                    <div style={{ paddingRight: 26, marginBottom: 12 }}>
                        <div style={{ fontWeight: 800, fontSize: 'clamp(17px, 5vw, 21px)', lineHeight: 1.2, letterSpacing: -0.2 }}>{title}</div>
                        {members.length > 1 && (
                            <div style={{ fontSize: 12, color: '#8a93a0', marginTop: 2 }}>Interchange · {members.length} lines</div>
                        )}
                    </div>
                )}

                {/* lines */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingRight: title ? 0 : 22 }}>
                    {members.map((m) => (
                        <div key={m.line.id} style={{ background: '#f6f7f9', borderRadius: 12, padding: '9px 10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div
                                    style={{ width: 38, height: 38, flexShrink: 0, borderRadius: '50%', background: m.line.color, color: ink(m.line.color), display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: m.line.code.length > 3 ? 10 : 12.5, boxShadow: '0 1px 3px rgba(0,0,0,.2)' }}
                                >
                                    {m.line.code}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: 700, lineHeight: 1.25 }}>{m.line.name}</div>
                                    <div style={{ fontSize: 12, color: '#7b8493', lineHeight: 1.35 }}>
                                        {m.line.operator} · {m.line.type}
                                        {m.station && m.station.name !== title && <> · {m.station.name}</>}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                                    <OperatorLogo operator={m.line.operator} />
                                    {m.station?.code && (
                                        <span style={{ background: '#fff', border: '1px solid #e2e5ea', borderRadius: 8, padding: '0 6px', fontSize: 11, fontWeight: 700, color: '#556' }}>
                      {m.station.code}
                    </span>
                                    )}
                                </div>
                            </div>
                            {/* clicking a track (no station): list this line's interchanges */}
                            {!station && <LineInterchanges line={m.line} onJump={onJump} />}
                        </div>
                    ))}
                </div>

                {/* clicking a station: interchange + nearby connections */}
                {station && <StationConnections station={station} onJump={onJump} />}

                {/* timetable */}
                {showTimetable && (
                    <div style={{ marginTop: 14 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                            <span style={sectionTitle}>Next departures</span>
                            <span
                                title={estimated ? 'Calculated from first/last train and how often trains run, not an official timetable' : undefined}
                                style={{ fontSize: 10.5, color: estimated ? '#8a5a00' : '#9aa3af', background: estimated ? '#fff3d6' : '#f1f3f6', borderRadius: 8, padding: '1px 7px' }}
                            >
                {estimated ? 'Estimated' : 'Scheduled'}
              </span>
                        </div>

                        {timetable === undefined && <div style={muted}>Loading...</div>}
                        {timetable === 'nodata' && <div style={muted}>No timetable source for this operator yet.</div>}
                        {timetable === 'error' && <div style={{ ...muted, color: '#c33' }}>Timetable unavailable. Run the timetable scripts in /scripts.</div>}
                        {Array.isArray(timetable) && timetable.length === 0 && <div style={muted}>No more scheduled departures today.</div>}

                        {Array.isArray(timetable) && timetable.length > 0 && (
                            <div style={{ maxHeight: 'min(230px, 32vh)', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                                {timetable.map((d, i) => {
                                    const soon = d.inMin <= 3
                                    return (
                                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: i ? '1px solid #f0f2f5' : 'none' }}>
                                            <span style={{ width: 42, fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: '#445' }}>{d.time}</span>
                                            <span style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, background: colorFor(d, members), flexShrink: 0 }} />
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{destOf(d.headsign) || d.route}</div>
                                                <div style={{ fontSize: 11, color: '#9aa3af' }}>{d.route}</div>
                                            </div>
                                            <span
                                                style={{ whiteSpace: 'nowrap', fontWeight: 700, fontSize: 12.5, padding: '3px 10px', borderRadius: 999, background: soon ? '#fdeaea' : '#eef2f7', color: soon ? '#d22' : '#2a3342' }}
                                            >
                        {fmtMin(d.inMin)}
                      </span>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}