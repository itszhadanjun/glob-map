import { useEffect, useState } from 'react'
import type { RailLine, Station } from '../metro/types'
import { OPERATOR_LOGOS } from '../metro/operators'
import { departuresForMembers, type Departure } from '../metro/live'

export interface CardMember {
    line: RailLine
    station?: Station
}

function OperatorLogo({ operator }: { operator: string }) {
    const [failed, setFailed] = useState(false)
    const src = OPERATOR_LOGOS[operator]

    if (!src || failed) {
        const initials = operator.split(/\s+/).map((w) => w[0]).join('').slice(0, 3).toUpperCase()
        return (
            <div style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 6, background: '#eee', color: '#555', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 11 }}>
                {initials}
            </div>
        )
    }
    return <img src={src} alt={operator} onError={() => setFailed(true)} style={{ width: 32, height: 32, flexShrink: 0, objectFit: 'contain' }} />
}

const chip = (bg: string, color = '#fff'): React.CSSProperties => ({
    background: bg, color, padding: '1px 7px', borderRadius: 10, fontSize: 11, fontWeight: 600,
})

type Timetable = Departure[] | 'nodata' | 'error' | undefined // undefined = loading

export default function LineCard({
                                     title,
                                     members,
                                     showTimetable = false,
                                 }: {
    title?: string
    members: CardMember[]
    showTimetable?: boolean
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
        const timer = setInterval(load, 30_000) // keeps the "in X min" countdown fresh
        return () => { cancelled = true; clearInterval(timer) }
    }, [members, showTimetable])

    return (
        <div style={{ width: 600, background: '#fff', color: '#222', fontFamily: 'system-ui, sans-serif' }}>
            {/* one color segment per line */}
            <div style={{ display: 'flex', height: 6 }}>
                {members.map((m) => <div key={m.line.id} style={{ flex: 1, background: m.line.color }} />)}
            </div>

            <div style={{ padding: 14 }}>
                {title && <div style={{ fontWeight: 700, fontSize: 17, paddingRight: 22, marginBottom: 10 }}>{title}</div>}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {members.map((m) => (
                        <div key={m.line.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <OperatorLogo operator={m.line.operator} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.25 }}>{m.line.name}</div>
                                <div style={{ fontSize: 11, color: '#777' }}>
                                    {m.line.operator} · {m.line.type}
                                    {m.station && <> · {m.station.name}</>}
                                </div>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                                <span style={chip(m.line.color)}>{m.line.code}</span>
                                {m.station?.code && <span style={chip('#f0f0f0', '#333')}>{m.station.code}</span>}
                            </div>
                        </div>
                    ))}
                </div>

                {showTimetable && (
                    <div style={{ marginTop: 14, borderTop: '1px solid #eee', paddingTop: 10 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                            Next departures
                        </div>

                        {timetable === undefined && <div style={{ fontSize: 12, color: '#888' }}>Loading...</div>}
                        {timetable === 'nodata' && <div style={{ fontSize: 12, color: '#888' }}>No timetable source for this operator yet.</div>}
                        {timetable === 'error' && <div style={{ fontSize: 12, color: '#c00' }}>Timetable unavailable. Run scripts/fetchTimetable.mjs.</div>}
                        {Array.isArray(timetable) && timetable.length === 0 && (
                            <div style={{ fontSize: 12, color: '#888' }}>No more scheduled departures today.</div>
                        )}
                        {Array.isArray(timetable) && timetable.length > 0 && (
                            <div style={{ maxHeight: 190, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 5 }}>
                                {timetable.map((d, i) => (
                                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '44px 52px 1fr', alignItems: 'baseline', fontSize: 12, gap: 6 }}>
                                        <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{d.time}</span>
                                        <b style={{ color: d.inMin <= 3 ? '#d33' : '#222' }}>{d.inMin === 0 ? 'Now' : `${d.inMin} min`}</b>
                                        <span style={{ color: '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {d.route}{d.headsign ? ` → ${d.headsign}` : ''}
                    </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}