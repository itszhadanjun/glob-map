import express, {type Request, type Response } from 'express'
import cors from 'cors'
import type {ForecastItem} from '../forecasts/types.ts'

const app = express()
const PORT = process.env.PORT || 5000

app.use(cors())
app.use(express.json())

app.get('/api/weather', async (req: Request, res: Response): Promise<void> => {
    try {
        const locationQuery = (req.query.location as string) || 'Kuala Lumpur'
        const targetUrl = `https://api.data.gov.my/weather/forecast?contains=${encodeURIComponent(locationQuery)}@location__location_name`

        const response = await fetch(targetUrl)
        if (!response.ok) {
            res.status(response.status).json({ error: 'Failed to fetch data from data.gov.my' })
            return
        }

        const data: ForecastItem[] = await response.json()
        res.json(data)
    } catch (error) {
        console.error('Error fetching weather:', error)
        res.status(500).json({ error: 'Internal Server Error' })
    }
})

app.listen(PORT, () => {
    console.log(`TypeScript Server running on http://localhost:${PORT}`)
})