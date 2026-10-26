import './App.css'
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { railLineManager } from './metro/RailLineManager'
import { fetchVehicles } from './metro/live'
import { iconKinds, iconSvg } from './metro/icons'
import { snapToLines } from './metro/snap'
import { REGIONS, LINE_ZOOM, VEHICLE_ZOOM, MARKER_ZOOM, viewedCountry } from './metro/regions'
import type { MergedStation } from './metro/types'
import LineCard from './components/LineCard'
import Searchbox from './components/Searchbox'
import RoutePanel from './components/RoutePanel'
import type { RouteStatus } from './components/RoutePanel'
import NavigationHUD from './components/NavigationHUD'
import { useIsMobile } from './hooks/useIsMobile'
import { fetchRoutes } from './navigation/routing'
import type { LngLat, Mode, Place, Route } from './navigation/routing'
import { useJourney } from './navigation/useJourney'
import { speak, stopSpeaking, spokenDistance } from './navigation/voice'
import SettingsModal from './components/SettingsModal'
import { useTranslation } from './i18n/TranslationContext'
import { TranslationProvider } from './i18n/TranslationContext'

maplibregl.setWorkerUrl(workerUrl)

const ARROW_SVG =
    '<svg viewBox="0 0 40 40" width="44" height="44"><circle cx="20" cy="20" r="18" fill="#2b7de9" fill-opacity=".18"/><path d="M20 6 L30 31 L20 26 L10 31 Z" fill="#2b7de9" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/></svg>'

function createStationElement(st: MergedStation) {
    const colors = st.members.map((m) => m.line.color)
    const border =
        colors.length > 1
            ? `linear-gradient(90deg, ${colors.map((c, i) => `${c} ${(i / colors.length) * 100}% ${((i + 1) / colors.length) * 100}%`).join(',')})`
            : `linear-gradient(${colors[0]}, ${colors[0]})`

    const kinds = iconKinds(st.members.map((m) => m.line.type))

    const outer = document.createElement('div')
    outer.style.cssText = 'cursor: pointer; pointer-events: auto; z-index: 10;'

    const pill = document.createElement('div')
    pill.style.cssText = `display:flex;align-items:center;justify-content:center;gap:3px;height:26px;min-width:26px;padding:0 ${kinds.length > 1 ? 6 : 0}px;box-sizing:border-box;border-radius:13px;border:3px solid transparent;background:linear-gradient(#fff,#fff) padding-box, ${border} border-box;color:#333;box-shadow:0 1px 4px rgba(0,0,0,.35)`

    for (const kind of kinds) {
        const icon = document.createElement('span')
        icon.innerHTML = iconSvg(kind)
        icon.style.cssText = 'width:14px;height:14px;display:block;pointer-events:none'
        icon.querySelector('svg')!.style.cssText = 'width:100%;height:100%;display:block'
        pill.appendChild(icon)
    }

    outer.appendChild(pill)
    return outer
}

function App() {
    const mapContainer = useRef<HTMLDivElement | null>(null)
    const mapRef = useRef<maplibregl.Map | null>(null)
    const { t } = useTranslation()

    const [settingsOpen, setSettingsOpen] = useState(false)
    const isMobile = useIsMobile()
    const isMobileRef = useRef(isMobile)
    isMobileRef.current = isMobile
    const [panelCollapsed, setPanelCollapsed] = useState(false)

    const [origin, setOrigin] = useState<Place | null>(null)
    const [destination, setDestination] = useState<Place | null>(null)
    const [mode, setMode] = useState<Mode>('drive')
    const [routes, setRoutes] = useState<Route[]>([])
    const [selected, setSelected] = useState(0)
    const [status, setStatus] = useState<RouteStatus>('idle')
    const [error, setError] = useState('')
    const [locating, setLocating] = useState(false)
    const [refining, setRefining] = useState(false)
    const fitNext = useRef(false)
    const endMarkers = useRef<maplibregl.Marker[]>([])

    const [navigating, setNavigating] = useState(false)
    const [simulate, setSimulate] = useState(false)
    const [muted, setMuted] = useState(false)
    const [following, setFollowing] = useState(true)
    const [summary, setSummary] = useState<{ distanceM: number; elapsedS: number } | null>(null)
    const navigatingRef = useRef(false)
    navigatingRef.current = navigating
    const startedAt = useRef(0)
    const spoken = useRef(new Set<number>())
    const navMarker = useRef<maplibregl.Marker | null>(null)

    const activeRoute = routes[selected] ?? null

    const reroute = async (pos: LngLat) => {
        if (!destination) return
        try {
            const rs = await fetchRoutes(mode, pos, destination.coordinates)
            setRoutes([rs[0]])
            setSelected(0)
            if (!muted) speak(t('navigation.rerouting'))
        } catch (e) {
            console.warn('reroute failed', e)
        }
    }

    const { journey, gpsError } = useJourney({
        route: navigating ? activeRoute : null,
        active: navigating,
        simulate,
        onOffRoute: reroute,
    })

    const useMyLocation = () => {
        if (!navigator.geolocation) return
        setLocating(true)
        navigator.geolocation.getCurrentPosition(
            (p) => {
                setOrigin({ name: t('common.myLocation'), coordinates: [p.coords.longitude, p.coords.latitude] })
                setLocating(false)
            },
            () => setLocating(false),
            { enableHighAccuracy: true, timeout: 8000 },
        )
    }

    const swap = () => {
        setOrigin(destination)
        setDestination(origin)
    }

    const startJourney = (sim: boolean) => {
        if (!activeRoute) return
        spoken.current.clear()
        startedAt.current = Date.now()
        setSummary(null)
        setSimulate(sim)
        setFollowing(true)
        setNavigating(true)
        mapRef.current?.easeTo({ pitch: 55, zoom: activeRoute.mode === 'walk' ? 18 : 17, duration: 800 })
        if (!muted) speak(t('navigation.starting'))
    }

    const endJourney = () => {
        setNavigating(false)
        setSummary(null)
        stopSpeaking()
        mapRef.current?.easeTo({ pitch: 0, bearing: 0, padding: { top: 0, bottom: 0, left: 0, right: 0 }, duration: 800 })
    }

    const recenter = () => {
        setFollowing(true)
        const f = journey?.fix
        if (f) {
            mapRef.current?.flyTo({ center: f.lngLat, bearing: f.heading ?? 0, pitch: 55, zoom: activeRoute?.mode === 'walk' ? 18 : 17 })
        }
    }

    useEffect(() => { useMyLocation() }, [])

    useEffect(() => {
        if (mapRef.current || !mapContainer.current) return

        let timer: number | undefined
        let popup: maplibregl.Popup | undefined

        const map = new maplibregl.Map({
            container: mapContainer.current,
            style: 'https://tiles.openfreemap.org/styles/liberty',
            center: [101.6869, 3.139],
            zoom: 11,
        })

        map.on('dragstart', () => {
            if (navigatingRef.current) setFollowing(false)
            else if (isMobileRef.current) setPanelCollapsed(true)
        })

        const openPopup = (lngLat: [number, number] | maplibregl.LngLat, content: ReactNode) => {
            popup?.remove()
            const container = document.createElement('div')
            const root = createRoot(container)

            // Wrap content in TranslationProvider so hooks work inside MapLibre popups
            root.render(
                <TranslationProvider>
                    {content}
                </TranslationProvider>
            )

            const p = new maplibregl.Popup({ maxWidth: 'none', className: 'rail-popup', offset: 18 })
                .setLngLat(lngLat)
                .setDOMContent(container)
                .addTo(map)
            p.on('close', () => setTimeout(() => root.unmount(), 0))
            popup = p
        }

        map.on('load', () => {
            for (const layer of map.getStyle().layers) {
                if (layer.type === 'line' && /path|pedestrian|footway/i.test(layer.id)) {
                    map.setPaintProperty(layer.id, 'line-color', '#b08d6a')
                    map.setPaintProperty(layer.id, 'line-opacity', 0.9)
                    map.setPaintProperty(layer.id, 'line-width', ['interpolate', ['linear'], ['zoom'], 13, 0.8, 17, 2.2])
                }
            }

            const lineIds: string[] = []
            for (const line of railLineManager.getAll()) {
                lineIds.push(line.id)
                map.addSource(line.id, { type: 'geojson', data: railLineManager.toGeoJSON(line) })
                map.addLayer({
                    id: line.id,
                    type: 'line',
                    source: line.id,
                    layout: { 'line-join': 'round', 'line-cap': 'round', visibility: 'none' },
                    paint: {
                        'line-color': line.color,
                        'line-width': ['interpolate', ['linear'], ['zoom'], 5, 2, 9, 4, 13, 7],
                    },
                })
            }

            map.addSource('route', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
            map.addLayer({
                id: 'route-alt',
                type: 'line',
                source: 'route',
                filter: ['==', ['get', 'active'], false],
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: { 'line-color': '#8a94a6', 'line-width': 6, 'line-opacity': 0.7 },
            })
            map.addLayer({
                id: 'route-casing',
                type: 'line',
                source: 'route',
                filter: ['==', ['get', 'active'], true],
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: { 'line-color': '#fff', 'line-width': 9 },
            })
            map.addLayer({
                id: 'route-solid',
                type: 'line',
                source: 'route',
                filter: ['all', ['==', ['get', 'active'], true], ['!=', ['get', 'kind'], 'walk']],
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: { 'line-color': ['get', 'color'], 'line-width': 6 },
            })
            map.addLayer({
                id: 'route-walk',
                type: 'line',
                source: 'route',
                filter: ['all', ['==', ['get', 'active'], true], ['==', ['get', 'kind'], 'walk']],
                layout: { 'line-join': 'round', 'line-cap': 'butt' },
                paint: { 'line-color': ['get', 'color'], 'line-width': 6, 'line-dasharray': [1, 1.5] },
            })

            map.addSource('nav-passed', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
            map.addLayer({
                id: 'nav-passed',
                type: 'line',
                source: 'nav-passed',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: { 'line-color': '#9aa5b1', 'line-width': 6, 'line-opacity': 0.95 },
            })

            map.on('click', 'route-alt', (e) => {
                const idx = e.features?.[0]?.properties?.idx
                if (typeof idx === 'number') setSelected(idx)
            })
            map.on('mouseenter', 'route-alt', () => (map.getCanvas().style.cursor = 'pointer'))

            const linesAt = (point: maplibregl.Point) => {
                const box: [maplibregl.PointLike, maplibregl.PointLike] = [
                    [point.x - 12, point.y - 12],
                    [point.x + 12, point.y + 12],
                ]
                const visible = lineIds.filter((id) => map.getLayoutProperty(id, 'visibility') === 'visible')
                if (!visible.length) return []
                const features = map.queryRenderedFeatures(box, { layers: visible })
                const hitIds = new Set<string>()
                for (const f of features) {
                    if (f.layer?.id) hitIds.add(f.layer.id)
                }
                return [...hitIds].map((id) => railLineManager.getById(id)!).filter(Boolean)
            }

            map.on('click', (e) => {
                if (map.queryRenderedFeatures(e.point, { layers: ['route-alt'] }).length) return
                const lines = linesAt(e.point)
                console.log('Map clicked at:', e.lngLat, 'Found lines:', lines)
                if (!lines.length) return
                openPopup(
                    e.lngLat,
                    <LineCard
                        members={lines.map((line) => ({ line }))}
                        onJump={(c) => map.flyTo({ center: c, zoom: 17 })}
                    />,
                )
            })
            map.on('mousemove', (e) => {
                const onAlt = map.queryRenderedFeatures(e.point, { layers: ['route-alt'] }).length > 0
                map.getCanvas().style.cursor = onAlt || linesAt(e.point).length ? 'pointer' : ''
            })

            map.addSource('vehicles', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
            map.addLayer({
                id: 'vehicles',
                type: 'circle',
                source: 'vehicles',
                layout: { visibility: 'none' },
                paint: { 'circle-radius': 6, 'circle-color': '#fff', 'circle-stroke-width': 2, 'circle-stroke-color': '#000' },
            })

            const refresh = async () => {
                try {
                    const data = await fetchVehicles('rapid-rail-kl')
                    ;(map.getSource('vehicles') as maplibregl.GeoJSONSource).setData(data)
                } catch (e) {
                    console.warn('vehicle fetch failed', e)
                }
            }
            refresh()
            timer = window.setInterval(refresh, 30_000)

            const stations = REGIONS.flatMap((r) => railLineManager.getMergedStations(r.country)).map((st, i) => ({
                id: i,
                st: { ...st, coordinates: snapToLines(st.coordinates, st.members.map((m) => m.line)) },
            }))
            const markers = new Map<number, maplibregl.Marker>()

            const updateVisibility = () => {
                const z = map.getZoom()
                const b = map.getBounds()
                const c = map.getCenter()
                const country = viewedCountry(c.lng, c.lat, [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()])

                const showLines = z >= LINE_ZOOM
                const showMarkers = z >= MARKER_ZOOM

                for (const line of railLineManager.getAll()) {
                    const visible = showLines && line.country === country
                    map.setLayoutProperty(line.id, 'visibility', visible ? 'visible' : 'none')
                }
                map.setLayoutProperty('vehicles', 'visibility', z >= VEHICLE_ZOOM && country === 'MY' ? 'visible' : 'none')

                for (const { id, st } of stations) {
                    const want = showMarkers && st.members[0].line.country === country && b.contains(st.coordinates)
                    const existing = markers.get(id)

                    if (want && !existing) {
                        const el = createStationElement(st)
                        el.addEventListener('click', (e) => {
                            e.stopPropagation()
                            console.log('Station clicked:', st.name)
                            openPopup(
                                st.coordinates,
                                <LineCard
                                    title={st.name}
                                    members={st.members}
                                    station={st}
                                    showTimetable
                                    onJump={(coords) => map.flyTo({ center: coords, zoom: 17 })}
                                />,
                            )
                        })
                        markers.set(id, new maplibregl.Marker({ element: el }).setLngLat(st.coordinates).addTo(map))
                    } else if (!want && existing) {
                        existing.remove()
                        markers.delete(id)
                    }
                }
            }

            updateVisibility()
            map.on('moveend', updateVisibility)
        })

        map.addControl(new maplibregl.NavigationControl(), 'bottom-right')
        mapRef.current = map

        return () => {
            window.clearInterval(timer)
            popup?.remove()
            map.remove()
            mapRef.current = null
        }
    }, [])

    useEffect(() => {
        if (!origin || !destination) {
            setRoutes([])
            setStatus('idle')
            setRefining(false)
            return
        }
        const ctrl = new AbortController()
        let first = true
        fitNext.current = true
        setStatus('routing')
        setRefining(false)
        setError('')

        fetchRoutes(mode, origin.coordinates, destination.coordinates, ctrl.signal, (rs) => {
            setRoutes(rs)
            if (first) { setSelected(0); first = false }
            setStatus('idle')
            setPanelCollapsed(false)
            setRefining(true)
        })
            .then((rs) => {
                setRoutes(rs)
                if (first) setSelected(0)
                else setSelected((s) => Math.min(s, rs.length - 1))
                setStatus('idle')
                setPanelCollapsed(false)
                setRefining(false)
            })
            .catch((e) => {
                if (e.name === 'AbortError') return
                console.warn(e)
                setRefining(false)
                if (first) {
                    setRoutes([])
                    setError(e.message)
                    setStatus('error')
                }
            })
        return () => ctrl.abort()
    }, [origin, destination, mode])

    useEffect(() => {
        const map = mapRef.current
        if (!map) return
        endMarkers.current.forEach((m) => m.remove())
        endMarkers.current = []
        if (origin) endMarkers.current.push(new maplibregl.Marker({ color: '#2b7de9', scale: 0.7 }).setLngLat(origin.coordinates).addTo(map))
        if (destination) endMarkers.current.push(new maplibregl.Marker({ color: '#e5484d' }).setLngLat(destination.coordinates).addTo(map))
    }, [origin, destination])

    useEffect(() => {
        const src = mapRef.current?.getSource('route') as maplibregl.GeoJSONSource | undefined
        if (!src) return
        src.setData({
            type: 'FeatureCollection',
            features: routes.flatMap((r, idx) =>
                r.legs.map((leg) => ({
                    type: 'Feature' as const,
                    properties: { kind: leg.kind, color: leg.color, idx, active: idx === selected },
                    geometry: { type: 'LineString' as const, coordinates: leg.coordinates },
                })),
            ),
        })
    }, [routes, selected])

    useEffect(() => {
        const map = mapRef.current
        if (!map || !routes.length || navigatingRef.current) return
        if (!fitNext.current) return
        fitNext.current = false
        const first = routes[0].legs[0].coordinates[0]
        const b = new maplibregl.LngLatBounds(first, first)
        routes.forEach((r) => r.legs.forEach((leg) => leg.coordinates.forEach((c) => b.extend(c))))
        map.fitBounds(b, {
            padding: isMobileRef.current
                ? { top: 190, bottom: 330, left: 40, right: 40 }
                : { top: 80, bottom: 80, left: 400, right: 60 },
            maxZoom: 17,
        })
    }, [routes])

    useEffect(() => {
        const map = mapRef.current
        if (destination && !origin && map) {
            map.flyTo({ center: destination.coordinates, zoom: Math.max(map.getZoom(), 14) })
        }
    }, [destination])

    useEffect(() => {
        document.documentElement.classList.toggle('navigating', navigating)
        return () => document.documentElement.classList.remove('navigating')
    }, [navigating])

    useEffect(() => {
        const map = mapRef.current
        if (!map || !map.getLayer('route-alt')) return
        map.setLayoutProperty('route-alt', 'visibility', navigating ? 'none' : 'visible')
    }, [navigating])

    useEffect(() => {
        const src = mapRef.current?.getSource('nav-passed') as maplibregl.GeoJSONSource | undefined
        if (!src) return
        src.setData({
            type: 'FeatureCollection',
            features:
                navigating && journey && journey.passed.length > 1
                    ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: journey.passed } }]
                    : [],
        })
    }, [journey, navigating])

    useEffect(() => {
        const map = mapRef.current
        if (!map) return
        if (!navigating) {
            navMarker.current?.remove()
            navMarker.current = null
            return
        }
        if (!journey) return

        const { lngLat, heading } = journey.fix
        if (!navMarker.current) {
            const el = document.createElement('div')
            el.innerHTML = ARROW_SVG
            navMarker.current = new maplibregl.Marker({ element: el, rotationAlignment: 'map', pitchAlignment: 'map' })
                .setLngLat(lngLat)
                .addTo(map)
        }
        navMarker.current.setLngLat(lngLat).setRotation(heading ?? 0)

        if (following) {
            map.easeTo({
                center: lngLat,
                bearing: heading ?? map.getBearing(),
                pitch: 55,
                padding: { top: 260, bottom: 60, left: 0, right: 0 },
                duration: 900,
                easing: (t) => t,
            })
        }
    }, [journey, navigating, following])

    useEffect(() => {
        if (!journey || !navigating || muted || journey.arrived) return
        const n = journey.next
        if (!n) return
        const limit = activeRoute?.mode === 'walk' ? 40 : 150
        if (journey.nextDistM <= limit && !spoken.current.has(n.idx)) {
            spoken.current.add(n.idx)
            speak(n.kind === 'arrive' ? (typeof n.text === 'object' ? t(n.text.key, n.text.params) : n.text) : `In ${spokenDistance(journey.nextDistM, t)}, ${typeof n.text === 'object' ? t(n.text.key, n.text.params) : n.text}`)
        }
    }, [journey, navigating, muted, activeRoute?.mode, t])

    useEffect(() => {
        if (!journey?.arrived || !destination || !activeRoute) return
        setSummary({
            distanceM: activeRoute.distanceM,
            elapsedS: simulate ? activeRoute.durationS : (Date.now() - startedAt.current) / 1000,
        })
        navigator.vibrate?.([250, 120, 250])
        if (!muted) speak(t('navigation.arrived', { name: destination.name }))
    }, [journey?.arrived, destination, activeRoute, simulate, muted, t])

    return (
        <>
            <div ref={mapContainer} style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh' }} />

            {!navigating && (
                <button
                    onClick={() => setSettingsOpen(true)}
                    style={{
                        position: 'fixed', top: '16px', right: '16px', zIndex: 1000,
                        background: '#fff', border: 'none', borderRadius: '50%', width: '44px', height: '44px',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.2)', cursor: 'pointer', display: 'flex',
                        alignItems: 'center', justifyContent: 'center', fontSize: '20px'
                    }}
                    title={t('settings.title')}
                >
                    ⚙️
                </button>
            )}

            <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />

            {!navigating && (
                <Searchbox
                    origin={origin}
                    destination={destination}
                    mode={mode}
                    locating={locating}
                    onOrigin={setOrigin}
                    onDestination={setDestination}
                    onMode={setMode}
                    onUseMyLocation={useMyLocation}
                    onSwap={swap}
                    getBias={() => {
                        const c = mapRef.current?.getCenter()
                        return c ? [c.lng, c.lat] : undefined
                    }}
                />
            )}

            {destination && !navigating && (
                <RoutePanel
                    destination={destination}
                    routes={routes}
                    selected={selected}
                    status={status}
                    error={error}
                    collapsed={panelCollapsed}
                    refining={refining}
                    onSelect={setSelected}
                    onClose={() => setDestination(null)}
                    onToggle={() => setPanelCollapsed((c) => !c)}
                    onStepClick={(c) => mapRef.current?.flyTo({ center: c, zoom: 18 })}
                    onStart={startJourney}
                />
            )}

            {navigating && destination && (
                <NavigationHUD
                    journey={journey}
                    destinationName={destination.name}
                    muted={muted}
                    following={following}
                    gpsError={gpsError}
                    summary={summary}
                    simulate={simulate}
                    onToggleMute={() => { setMuted((m) => !m); stopSpeaking() }}
                    onRecenter={recenter}
                    onExit={endJourney}
                />
            )}
        </>
    )
}

export default App