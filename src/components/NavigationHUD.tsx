import type { Journey } from '../navigation/useJourney.ts'
import type { Maneuver } from '../navigation/guidance.ts'
import { useTranslation } from '../i18n/TranslationContext'

const GREEN = '#0b5f5a'

const fmtDist = (m: number) => (m < 15 ? 'Now' : m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`)
const fmtMin = (s: number) => {
    const min = Math.max(1, Math.round(s / 60))
    return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`
}

const ARROWS: Record<string, string> = {
    straight: 'M12 21V4 M5 11l7-7 7 7',
    left: 'M18 21v-7a4 4 0 0 0-4-4H6 M10 4L5 9l5 5',
    right: 'M6 21v-7a4 4 0 0 1 4-4h8 M14 4l5 5-5 5',
    uturn: 'M7 21V9a5 5 0 0 1 10 0v9 M13 14l4 4 4-4',
}

function Icon({ kind, size = 48 }: { kind: Maneuver; size?: number }) {
    if (kind === 'arrive') return <span style={{ fontSize: size * 0.85 }}>🏁</span>
    if (kind === 'roundabout') return <span style={{ fontSize: size * 0.85 }}>↻</span>
    if (kind === 'transit') return <span style={{ fontSize: size * 0.8 }}>🚆</span>
    return (
        <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d={ARROWS[kind] ?? ARROWS.straight} />
        </svg>
    )
}

const roundBtn: React.CSSProperties = {
    width: 48, height: 48, borderRadius: '50%', border: 0, background: '#111', color: '#fff',
    fontSize: 20, cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,.4)',
}

export default function NavigationHUD({
                                          journey, destinationName, muted, following, gpsError, summary, simulate,
                                          onToggleMute, onRecenter, onExit,
                                      }: {
    journey: Journey | null
    destinationName: string
    muted: boolean
    following: boolean
    gpsError: string
    summary: { distanceM: number; elapsedS: number } | null
    simulate: boolean
    onToggleMute: () => void
    onRecenter: () => void
    onExit: () => void
}) {
    const { t } = useTranslation()
    const arrived = !!journey?.arrived

    return (
        <div style={{ fontFamily: 'system-ui, sans-serif' }}>
            <style>{`@keyframes pop{0%{transform:translateY(30px) scale(.9);opacity:0}100%{transform:none;opacity:1}}`}</style>

            {/* top banner */}
            {!arrived && (
                <div style={{ position: 'fixed', top: 12, left: 12, right: 12, maxWidth: 520, margin: '0 auto', zIndex: 4 }}>
                    <div style={{ background: GREEN, color: '#fff', borderRadius: 16, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 16, boxShadow: '0 4px 14px rgba(0,0,0,.35)' }}>
                        {journey ? (
                            <>
                                <div style={{ width: 52, display: 'grid', placeItems: 'center' }}>
                                    <Icon kind={journey.next?.kind ?? 'straight'} />
                                </div>
                                <div style={{ minWidth: 0 }}>
                                    <div style={{ fontSize: 30, fontWeight: 700, lineHeight: 1.1 }}>{fmtDist(journey.nextDistM)}</div>
                                    <div style={{ fontSize: 17, opacity: 0.95, marginTop: 2 }}>{journey.next?.text ?? `Continue to ${destinationName}`}</div>
                                </div>
                            </>
                        ) : (
                            <div style={{ fontSize: 16 }}>{gpsError || t('navigation.gettingPosition')}</div>
                        )}
                    </div>

                    {journey?.then && (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: GREEN, color: '#fff', padding: '6px 14px', borderRadius: '0 0 14px 14px', marginLeft: 8, fontSize: 15 }}>
                            {t('navigation.then')} <Icon kind={journey.then.kind} size={22} />
                        </div>
                    )}

                    {journey?.offRoute && (
                        <div style={{ marginTop: 8, background: '#f5b800', color: '#222', padding: '8px 14px', borderRadius: 10, fontSize: 14, fontWeight: 600 }}>
                            {t('navigation.leftRoute')}
                        </div>
                    )}
                    {journey && gpsError && (
                        <div style={{ marginTop: 8, background: '#f5b800', color: '#222', padding: '8px 14px', borderRadius: 10, fontSize: 14 }}>{gpsError}</div>
                    )}
                </div>
            )}

            {/* side buttons */}
            {!arrived && (
                <div style={{ position: 'fixed', right: 12, bottom: 150, zIndex: 4, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <button style={roundBtn} onClick={onToggleMute} aria-label={muted ? t('navigation.unmute') : t('navigation.mute')}>{muted ? '🔇' : '🔊'}</button>
                    {!following && <button style={{ ...roundBtn, background: '#2b7de9' }} onClick={onRecenter} aria-label={t('navigation.recenter')}>➤</button>}
                </div>
            )}

            {/* speed */}
            {!arrived && journey && (
                <div style={{ position: 'fixed', left: 12, bottom: 150, zIndex: 4, width: 64, height: 64, borderRadius: '50%', background: '#111', color: '#fff', display: 'grid', placeItems: 'center', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,.4)' }}>
                    <div>
                        <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1 }}>{Math.round(journey.fix.speedKmh)}</div>
                        <div style={{ fontSize: 10, opacity: 0.8 }}>km/h</div>
                    </div>
                </div>
            )}

            {/* bottom bar */}
            {!arrived && (
                <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 4, background: '#000', color: '#fff', borderRadius: '22px 22px 0 0', padding: '16px 20px 22px' }}>
                    <div style={{ maxWidth: 520, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 16 }}>
                        <button onClick={onExit} aria-label={t('navigation.endJourney')} style={{ ...roundBtn, background: 'transparent', border: '1.5px solid #888', fontSize: 22 }}>✕</button>
                        <div style={{ flex: 1, textAlign: 'center' }}>
                            <div style={{ fontSize: 30, fontWeight: 700, color: '#58d68d' }}>{journey ? fmtMin(journey.remainingS) : '--'}</div>
                            <div style={{ fontSize: 15, color: '#bbb' }}>
                                {journey ? `${fmtDist(journey.remainingM)} • ${journey.eta.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}
                                {simulate && ' • demo'}
                            </div>
                        </div>
                        <div style={{ width: 48 }} />
                    </div>
                </div>
            )}

            {/* arrival feedback */}
            {arrived && (
                <div style={{ position: 'fixed', left: 12, right: 12, bottom: 24, maxWidth: 420, margin: '0 auto', zIndex: 5, background: '#fff', color: '#222', borderRadius: 20, padding: 24, textAlign: 'center', boxShadow: '0 8px 30px rgba(0,0,0,.35)', animation: 'pop .4s ease-out' }}>
                    <div style={{ fontSize: 48 }}>🎉</div>
                    <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>{t('navigation.youHaveArrived')}</div>
                    <div style={{ fontSize: 16, color: '#555', marginTop: 4 }}>{destinationName}</div>
                    {summary && (
                        <div style={{ marginTop: 12, fontSize: 14, color: '#777' }}>
                            {fmtDist(summary.distanceM)} • {fmtMin(summary.elapsedS)}{simulate && ' (demo)'}
                        </div>
                    )}
                    <button onClick={onExit} style={{ marginTop: 18, width: '100%', padding: '12px 0', border: 0, borderRadius: 12, background: '#2b7de9', color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>
                        {t('navigation.done')}
                    </button>
                </div>
            )}
        </div>
    )
}