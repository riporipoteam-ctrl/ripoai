// Free, keyless weather via Open-Meteo (open CORS). Geocode + forecast.

export interface WeatherData {
  place: string
  current: { temp: number; code: number; wind: number; humidity: number }
  daily: { date: string; max: number; min: number; code: number }[]
}

export function wantsWeather(text: string): boolean {
  return /\b(weather|forecast|temperature|how (hot|cold|warm)|is it (going to )?(rain|snow|sunny)|rain(ing)?|umbrella)\b/i.test(text)
}

export function weatherEmoji(code: number): string {
  if (code === 0) return '☀️'
  if (code <= 2) return '🌤️'
  if (code === 3) return '☁️'
  if (code <= 48) return '🌫️'
  if (code <= 67) return '🌧️'
  if (code <= 77) return '❄️'
  if (code <= 82) return '🌦️'
  if (code <= 86) return '🌨️'
  return '⛈️'
}

export function weatherText(code: number): string {
  if (code === 0) return 'Clear'
  if (code <= 2) return 'Partly cloudy'
  if (code === 3) return 'Cloudy'
  if (code <= 48) return 'Fog'
  if (code <= 67) return 'Rain'
  if (code <= 77) return 'Snow'
  if (code <= 82) return 'Showers'
  if (code <= 86) return 'Snow showers'
  return 'Thunderstorm'
}

function extractPlace(text: string): string | null {
  const m = text.match(/\b(?:in|at|for|near)\s+([A-Za-z .'-]{2,40})/i)
  return m ? m[1].trim().replace(/\b(today|tomorrow|now|this week|right now)\b/gi, '').trim() : null
}

export async function getWeather(query: string, near?: [number, number]): Promise<WeatherData | null> {
  try {
    let lat: number, lon: number, place: string
    if (near && /\bnear me|nearby|here|my (location|area)|current location\b/i.test(query)) {
      ;[lat, lon] = near
      place = 'Your location'
    } else {
      const placeName = extractPlace(query) || query.replace(/weather|forecast|temperature/gi, '').trim()
      const g = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(placeName)}&count=1`)
      const gd = await g.json()
      const r = gd?.results?.[0]
      if (!r && near) { ;[lat, lon] = near; place = 'Your location' }
      else if (!r) return null
      else { lat = r.latitude; lon = r.longitude; place = [r.name, r.country_code].filter(Boolean).join(', ') }
    }
    const f = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m&daily=temperature_2m_max,temperature_2m_min,weather_code&forecast_days=5&timezone=auto`,
    )
    const fd = await f.json()
    if (!fd?.current) return null
    return {
      place,
      current: {
        temp: Math.round(fd.current.temperature_2m),
        code: fd.current.weather_code,
        wind: Math.round(fd.current.wind_speed_10m),
        humidity: fd.current.relative_humidity_2m,
      },
      daily: (fd.daily?.time ?? []).map((d: string, i: number) => ({
        date: d,
        max: Math.round(fd.daily.temperature_2m_max[i]),
        min: Math.round(fd.daily.temperature_2m_min[i]),
        code: fd.daily.weather_code[i],
      })),
    }
  } catch {
    return null
  }
}
