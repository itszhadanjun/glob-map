export function speak(text: string) {
    if (!('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text))
}

export function stopSpeaking() {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
}

export function spokenDistance(m: number) {
    return m < 1000 ? `${Math.max(10, Math.round(m / 10) * 10)} meters` : `${(m / 1000).toFixed(1)} kilometers`
}