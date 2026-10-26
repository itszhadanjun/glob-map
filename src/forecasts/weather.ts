export interface WeatherForecast {
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