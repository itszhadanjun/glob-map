export interface ManualMerge {
    name?: string // display name, defaults to the first station's name
    stations: string[] // 'LINE_ID:station name or code'
    at?: [number, number] // optional [lng, lat] for the marker, otherwise the average
}

// false = no automatic merging at all, only the rules below
export const AUTO_MERGE = true

export const MANUAL_MERGES: ManualMerge[] = [
    /* MALAYSIA - MY */
    { name: 'Masjid Jamek', stations: ['MY-KJL:Masjid Jamek', 'MY-AGL:Masjid Jamek(AG SP)', 'MY-SPL:Masjid Jamek(AG SP)'] },
    { name: 'Kajang', stations: ['MY-KGL:Kajang(KG)', 'MY-SBL:Kajang(KTM)', "MY-ETS:Kajang(KTM)"] },
    { name: 'KL Sentral', stations: ['MY-KJL:KL Sentral(KJ)', 'MY-ERE:KL Sentral(ERL) Arrival', 'MY-ERT:KL Sentral(ERL) Arrival', 'MY-PKL:KL Sentral(KTM)', 'MY-SBL:KL Sentral(KTM)', 'MY-MR:KL Sentral(Monorail)', "MY-ETS:KL Sentral(KTM)"] },
    { name: 'Bukit Bintang', stations: ['MY-KGL:Bukit Bintang', 'MY-MRL:Bukit Bintang'], at: [101.7107, 3.1463] },
    { name: 'Chan Sow Lin', stations: ['MY-AGL:Chan Sow Lin', 'MY-SPL:Chan Sow Lin', 'MY-PYL:Chan Sow Lin'] },
    { name: 'Kampung Batu', stations: ['MY-PYL:Kampung Batu(PY)', 'MY-SBL:Kampung Batu(KTM)'] },
    { name: 'Sungai Buloh', stations: ['MY-PYL:Sungai Buloh(PY)', 'MY-PKL:Sungai Buloh(KTM)', 'MY-ETS:Sungai Buloh(KTM)'] },
    { name: 'USJ 7', stations: ['MY-KJL:USJ 7', 'MY-BRT:USJ 7'] },
    { name: 'Sunway-Setia Jaya', stations: ['MY-BRT:Sunway-Setia Jaya', 'MY-PKL:Setia Jaya'] },
    { name: 'Subang Jaya', stations: ['MY-PKL:Subang Jaya(KTM)', 'MY-KJL:Subang Jaya(LRT)'] },
    { name: 'Glenmarie', stations: ['MY-SAL:Glenmarie 2', 'MY-KJL:Glenmarie'] },
]