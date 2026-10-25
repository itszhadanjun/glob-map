import { useEffect, useMemo, useRef, useState } from 'react'
import type { LngLat, Route } from './routing'
import { bearing, buildPath, buildSteps, distM, pointAt, snapToPath } from './guidance'
import type { GuideStep } from './guidance'

export interface Journey {
    fix: { lngLat: LngLat; heading: number | null; speedKmh: number }
    along: number
    remainingM: number
    remainingS: number
    eta: Date
    next: GuideStep | null
    nextDistM: number
    then: GuideStep | null
    passed: LngLat[]
    arrived: boolean
    offRoute: boolean
}

interface RawFix { lngLat: LngLat; heading: number | null; speedMs: number }

export function useJourney({ route, active, simulate, onOffRoute }: {
    route: Route | null
    active: boolean
    simulate: boolean
    onOffRoute: (pos: LngLat) => void
}) {
    const path = useMemo(() => (route ? buildPath(route) : null), [route])
    const steps = useMemo(() => (route && path ? buildSteps(route, path) : []), [route, path])
    const [journey, setJourney] = useState<Journey | null>(null)
    const [gpsError, setGpsError] = useState('')
    const offRef = useRef(onOffRoute)
    offRef.current = onOffRoute

    useEffect(() => {
        setJourney(null)
        setGpsError('')
        if (!active || !route || !path || path.total < 1) return

        let along = 0
        let offCount = 0
        let lastReroute = 0
        let arrived = false
        let last: LngLat | null = null
        let lastHeading: number | null = null

        const handle = (raw: RawFix) => {
            if (arrived) return

            let s = snapToPath(path, raw.lngLat, along - 100, along + 1500)
            if (s.offM > 60) s = snapToPath(path, raw.lngLat) // lost: search the whole route
            const off = s.offM > 50
            offCount = off ? offCount + 1 : 0
            if (!off) along = Math.max(along, s.along) // never go backwards

            // heading: GPS when moving, else the direction we moved, else the road direction
            let heading: number | null
            if (raw.heading !== null && Number.isFinite(raw.heading) && raw.speedMs > 0.8) heading = raw.heading
            else if (last && distM(last, raw.lngLat) > 3) heading = bearing(last, raw.lngLat)
            else heading = lastHeading ?? s.segBearing
            last = raw.lngLat
            lastHeading = heading

            const remainingM = Math.max(0, path.total - along)
            const toEnd = distM(raw.lngLat, path.coords[path.coords.length - 1])
            arrived = (!off && remainingM < 30) || toEnd < 20

            const i = steps.findIndex((st) => st.at > along + 8)
            const next = i >= 0 ? steps[i] : null
            const after = i >= 0 ? steps[i + 1] : undefined
            const then = next && after && after.at - next.at < 400 ? after : null
            const remainingS = arrived ? 0 : route.durationS * (remainingM / path.total)

            setJourney({
                fix: { lngLat: raw.lngLat, heading, speedKmh: raw.speedMs * 3.6 },
                along,
                remainingM: arrived ? 0 : remainingM,
                remainingS,
                eta: new Date(Date.now() + remainingS * 1000),
                next,
                nextDistM: next ? Math.max(0, next.at - along) : remainingM,
                then,
                passed: [...path.coords.slice(0, s.index + 1), s.point],
                arrived,
                offRoute: off && offCount >= 2,
            })

            if (offCount >= 3 && Date.now() - lastReroute > 15000) {
                lastReroute = Date.now()
                offRef.current(raw.lngLat)
            }
        }

        // demo: move along the route (faster than real life)
        if (simulate) {
            let d = 0
            const v = route.mode === 'walk' ? 8 : 18
            const tick = () => {
                d = Math.min(path.total, d + v)
                const p = pointAt(path, d)
                const q = pointAt(path, Math.min(path.total, d + 8))
                handle({ lngLat: p, heading: bearing(p, q), speedMs: v })
            }
            tick()
            const t = setInterval(tick, 1000)
            return () => clearInterval(t)
        }

        if (!navigator.geolocation) {
            setGpsError('Location is not available in this browser')
            return
        }
        const id = navigator.geolocation.watchPosition(
            (p) => {
                setGpsError('')
                handle({ lngLat: [p.coords.longitude, p.coords.latitude], heading: p.coords.heading, speedMs: p.coords.speed ?? 0 })
            },
            (e) => setGpsError(e.code === 1 ? 'Location permission denied' : 'Waiting for GPS signal...'),
            { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 },
        )
        return () => navigator.geolocation.clearWatch(id)
    }, [active, route, path, steps, simulate])

    // keep the screen on while navigating
    useEffect(() => {
        if (!active || !('wakeLock' in navigator)) return
        let lock: WakeLockSentinel | undefined
        navigator.wakeLock.request('screen').then((l) => (lock = l)).catch(() => {})
        return () => { lock?.release().catch(() => {}) }
    }, [active])

    return { journey, gpsError }
}