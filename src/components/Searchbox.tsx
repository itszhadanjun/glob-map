import { useEffect, useRef, useState } from 'react'
import type { Mode, Place } from '../navigation/routing'
import { useIsMobile } from '../hooks/useIsMobile'
import { useTranslation } from '../i18n/TranslationContext'

interface Result extends Place {
    detail: string
}

interface WeatherForecastItem {
    date: string
    morning_forecast: string
    afternoon_forecast: string
    night_forecast: string
    min_temp: number
    max_temp: number
    location: {
        location_id: string
        location_name: string
        state: string
    }
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

    const { lang, t } = useTranslation()

    useEffect(() => { setText(value?.name ?? '') }, [value])

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
                const code = lang.split('_')[0].toLowerCase()
                const apiLang = code === 'en' ? 'en' : 'default'

                const url = `${ENDPOINT}?q=${encodeURIComponent(q)}&limit=6&lang=${apiLang}${bias ? `&lon=${bias[0]}&lat=${bias[1]}` : ''}`

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
    }, [text, lang, getBias])

    // Close suggestion box when clicking outside
    useEffect(() => {
        const h = (e: MouseEvent) => {
            if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
                setOpen(false)
            }
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

    // Only show list if there's actual text typed and it's open
    const showList = open && text.trim().length >= 2 && (results.length > 0 || failed || !loading)

    return (
        <div ref={boxRef} style={{ position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f5f6f8', borderRadius: 8, padding: '0 8px' }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: dot, flexShrink: 0 }} />
                <input
                    value={text}
                    onChange={(e) => { setText(e.target.value); setOpen(true) }}
                    onFocus={() => { if (text.trim().length >= 2) setOpen(true) }}
                    onKeyDown={onKeyDown}
                    placeholder={busy ? t('searchbox.findLocation') : placeholder}
                    style={{ flex: 1, minWidth: 0, border: 0, outline: 'none', padding: '10px 0', fontSize: 14, background: 'transparent', color: '#222' }}
                />
                {loading && <span style={{ fontSize: 11, color: '#888' }}>...</span>}
                {text && !loading && (
                    <button onClick={() => { setText(''); setResults([]); setOpen(false); onClear() }} aria-label={t('common.close')} style={{ border: 0, background: 'none', fontSize: 16, cursor: 'pointer', color: '#888' }}>×</button>
                )}
                {action}
            </div>

            {showList && (
                <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', marginTop: 4, zIndex: 50, background: '#fff', borderRadius: 10, boxShadow: '0 4px 14px rgba(0,0,0,.25)', overflow: 'hidden', maxHeight: 280, overflowY: 'auto' }}>
                    {failed && <div style={{ padding: 12, fontSize: 13, color: '#c00' }}>Search failed. Try again in a moment.</div>}
                    {!failed && results.length === 0 && !loading && <div style={{ padding: 12, fontSize: 13, color: '#888' }}>No places found.</div>}
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

const MODES: { id: Mode; labelKey: string; icon: string }[] = [
    { id: 'drive', labelKey: 'modes.drive', icon: '🚗' },
    { id: 'ride', labelKey: 'modes.ride', icon: '🚕' },
    { id: 'transit', labelKey: 'modes.transit', icon: '🚆' },
    { id: 'walk', labelKey: 'modes.walk', icon: '🚶' },
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
    const { t } = useTranslation()
    const [weatherOpen, setWeatherOpen] = useState(false)
    const [todayForecast, setTodayForecast] = useState<WeatherForecastItem | null>(null)
    const [weatherLoading, setWeatherLoading] = useState(false)
    const [weatherError, setWeatherError] = useState<string | null>(null)

    const targetLocationName = destination?.name || 'Kuala Lumpur'

    useEffect(() => {
        if (!weatherOpen) return
        const fetchWeather = async () => {
            setWeatherLoading(true)
            setWeatherError(null)
            try {
                const response = await fetch(`http://localhost:5000/api/weather?location=${encodeURIComponent(targetLocationName)}`)
                if (!response.ok) throw new Error('Network response was not ok')
                const data: WeatherForecastItem[] = await response.json()

                const now = new Date()
                const localDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

                const found = data.find((item) => item.date === localDateStr) || data[0] || null
                setTodayForecast(found)
            } catch (err) {
                setWeatherError(t('searchbox.weatherError'))
            } finally {
                setWeatherLoading(false)
            }
        }
        fetchWeather()
    }, [weatherOpen, targetLocationName, t])

    const frame: React.CSSProperties = mobile
        ? { top: 0, left: 0, right: 0, borderRadius: '0 0 16px 16px', padding: 'calc(10px + env(safe-area-inset-top, 0px)) 12px 12px' }
        : { top: 12, left: 12, width: 340, borderRadius: 12, padding: 10 }

    return (
        <div style={{ position: 'fixed', zIndex: 3, boxSizing: 'border-box', background: '#fff', boxShadow: '0 2px 10px rgba(0,0,0,.25)', fontFamily: 'system-ui, sans-serif', ...frame }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <PlaceInput
                        value={origin}
                        placeholder={t('searchbox.startingPoint')}
                        dot="#2b7de9"
                        busy={locating}
                        onSelect={onOrigin}
                        onClear={() => onOrigin(null)}
                        getBias={getBias}
                        action={
                            <button onClick={onUseMyLocation} title={t('searchbox.useMyLocation')} aria-label={t('searchbox.useMyLocation')} style={{ border: 0, background: 'none', fontSize: 15, cursor: 'pointer', color: '#444' }}>
                                📍
                            </button>
                        }
                    />
                    <PlaceInput
                        value={destination}
                        placeholder={t('searchbox.whereTo')}
                        dot="#e5484d"
                        onSelect={onDestination}
                        onClear={() => onDestination(null)}
                        getBias={getBias}
                        action={
                            <button
                                onClick={() => setWeatherOpen((o) => !o)}
                                title={t('searchbox.toggleWeather')}
                                aria-label={t('searchbox.toggleWeather')}
                                style={{ border: 0, background: 'none', fontSize: 15, cursor: 'pointer', color: weatherOpen ? '#2b7de9' : '#444' }}
                            >
                                ⛅
                            </button>
                        }
                    />
                </div>
                <button
                    onClick={onSwap}
                    title={t('common.swap')}
                    aria-label={t('common.swap')}
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
                        {m.icon} {mobile ? '' : t(m.labelKey)}
                    </button>
                ))}
            </div>

            {weatherOpen && (
                <div style={{ marginTop: 12, borderTop: '1px solid #eee', paddingTop: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>
                            {t('searchbox.weatherTitle')}: {targetLocationName}
                        </span>
                        <button
                            onClick={() => setWeatherOpen(false)}
                            style={{ border: 0, background: 'none', fontSize: 14, cursor: 'pointer', color: '#888' }}
                        >
                            ✕
                        </button>
                    </div>

                    {weatherLoading && <p style={{ fontSize: 12, color: '#666', textAlign: 'center', margin: '10px 0' }}>{t('common.loading')}</p>}
                    {weatherError && <p style={{ fontSize: 12, color: '#c00', margin: '10px 0' }}>{weatherError}</p>}

                    {!weatherLoading && !weatherError && !todayForecast && (
                        <p style={{ fontSize: 12, color: '#666', textAlign: 'center', margin: '10px 0' }}>{t('searchbox.noWeather')}</p>
                    )}

                    {!weatherLoading && !weatherError && todayForecast && (
                        <div style={{ border: '1px solid #e5e5e5', padding: '10px', borderRadius: 6, fontSize: 12, background: '#fafafa' }}>
                            <div style={{ fontWeight: 600, color: '#222', marginBottom: 4 }}>Date: {todayForecast.date}</div>
                            <div style={{ marginBottom: 2 }}><strong>{t('searchbox.morning')}:</strong> {todayForecast.morning_forecast}</div>
                            <div style={{ marginBottom: 2 }}><strong>{t('searchbox.afternoon')}:</strong> {todayForecast.afternoon_forecast}</div>
                            <div style={{ marginBottom: 2 }}><strong>{t('searchbox.night')}:</strong> {todayForecast.night_forecast}</div>
                            <div><strong>{t('searchbox.temp')}:</strong> {todayForecast.min_temp}°C - {todayForecast.max_temp}°C</div>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}