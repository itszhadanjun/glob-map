// First and last train times and minutes between trains. SINGAPORE HAS NO PUBLIC MRT TIMETABLE,
// so these are approximate values from memory: check them against SMRT / SBS Transit before relying on them.
export interface Freq {
    first: string // HH:mm
    last: string // HH:mm, a time before "first" means after midnight
    peak: number // minutes between trains, weekday 07:00-09:30 and 17:00-20:00
    off: number // minutes between trains, rest of the day
}

export const SG_FREQ: Record<string, Freq> = {
    NSL: { first: '05:30', last: '00:10', peak: 3, off: 5 },
    EWL: { first: '05:30', last: '00:05', peak: 3, off: 5 },
    NEL: { first: '05:45', last: '00:15', peak: 3, off: 5 },
    CCL: { first: '05:50', last: '23:55', peak: 4, off: 6 },
    DTL: { first: '05:30', last: '00:15', peak: 3, off: 5 },
    TEL: { first: '05:30', last: '00:05', peak: 4, off: 6 },
    BPL: { first: '05:00', last: '00:45', peak: 5, off: 8 },
    SKL: { first: '05:00', last: '00:30', peak: 5, off: 8 },
    PGL: { first: '05:00', last: '00:30', peak: 5, off: 8 },
}