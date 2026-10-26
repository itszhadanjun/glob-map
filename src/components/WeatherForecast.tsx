import React, { useState, useEffect, type SyntheticEvent } from 'react'
import type {WeatherForecast as WeatherForecastType} from '../forecasts/weather'

export const WeatherForecast: React.FC = () => {
    const [forecasts, setForecasts] = useState<WeatherForecastType[]>([])
    const [searchTerm, setSearchTerm] = useState<string>('Kuala Lumpur')
    const [query, setQuery] = useState<string>('Kuala Lumpur')
    const [loading, setLoading] = useState<boolean>(false)
    const [weatherError, setWeatherError] = useState<string | null>(null)

    useEffect(() => {
        const fetchWeather = async () => {
            setLoading(true)
            setWeatherError(null)
            try {
                const response = await fetch(`http://localhost:5000/api/weather?location=${encodeURIComponent(query)}`)
                if (!response.ok) throw new Error('Network response was not ok')

                const data: WeatherForecastType[] = await response.json()
                setForecasts(data)
            } catch (err) {
                setWeatherError('Could not fetch weather data. Make sure the Node server is running.')
            } finally {
                setLoading(false)
            }
        }

        fetchWeather()
    }, [query])

    const handleSearch = (e: SyntheticEvent<HTMLFormElement>) => {
        e.preventDefault()
        setQuery(searchTerm)
    }

    return (
        <div style={{ padding: '2rem', fontFamily: 'sans-serif', maxWidth: '800px', margin: 'auto' }}>
            <h2>Malaysia Weather Forecast</h2>

            <form onSubmit={handleSearch} style={{ marginBottom: '1.5rem' }}>
                <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Enter location (e.g. George Town)"
                    style={{ padding: '0.5rem', width: '60%', marginRight: '0.5rem' }}
                />
                <button type="submit" style={{ padding: '0.5rem 1rem' }}>Search</button>
            </form>

            {loading && <p>Loading weather data...</p>}
            {weatherError && <p style={{ color: 'red' }}>{weatherError}</p>}

            {!loading && !weatherError && forecasts.length === 0 && (
                <p>No forecast data found for "{query}".</p>
            )}

            <div style={{ display: 'grid', gap: '1rem' }}>
                {forecasts.map((item, index) => (
                    <div key={index} style={{ border: '1px solid #ddd', padding: '1rem', borderRadius: '8px' }}>
                        <h3>{item.location?.location_name || 'Location'} ({item.location?.state})</h3>
                        <p><strong>Date:</strong> {item.date}</p>
                        <p><strong>Morning:</strong> {item.morning_forecast}</p>
                        <p><strong>Afternoon:</strong> {item.afternoon_forecast}</p>
                        <p><strong>Night:</strong> {item.night_forecast}</p>
                        <p><strong>Temp Range:</strong> {item.min_temp}°C - {item.max_temp}°C</p>
                    </div>
                ))}
            </div>
        </div>
    )
}