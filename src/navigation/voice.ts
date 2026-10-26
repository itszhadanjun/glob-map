export function speak(text: string) {
    if (!('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text))
}

export function stopSpeaking() {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
}

export function spokenDistance(m: number, t?: (key: string, params?: any) => string) {
    if (m < 1000) {
        const val = Math.max(10, Math.round(m / 10) * 10)
        return t ? t('navigation.meters', { val }) : `${val} meters`
    }
    const val = (m / 1000).toFixed(1)
    return t ? t('navigation.kilometers', { val }) : `${val} kilometers`
}