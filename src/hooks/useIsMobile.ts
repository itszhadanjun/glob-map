import { useEffect, useState } from 'react'

const QUERY = '(max-width: 640px)'

export function useIsMobile() {
    const [mobile, setMobile] = useState(() => window.matchMedia(QUERY).matches)
    useEffect(() => {
        const mq = window.matchMedia(QUERY)
        const onChange = () => setMobile(mq.matches)
        mq.addEventListener('change', onChange)
        return () => mq.removeEventListener('change', onChange)
    }, [])
    return mobile
}