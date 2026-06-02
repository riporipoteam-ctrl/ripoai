// Free place search via OpenStreetMap Nominatim (no API key). Used for the Maps
// feature. Rate-limited to ~1 req/s by OSM policy — fine for occasional use.

export interface Place {
  name: string
  address: string
  lat: number
  lng: number
  category?: string
}

export interface PlacesResult {
  center: [number, number]
  places: Place[]
  label: string
}

// Heuristic: is the user asking to find places / locations?
export function wantsPlaces(text: string): boolean {
  return /\b(near me|nearby|near by|nearest|closest|around me|where (is|are|can i)|find (me )?(a |the )?(nearest|closest|nearby)?|directions to|how do i get to|on a map|shopping mall|malls?|restaurants?|cafes?|coffee shops?|hotels?|bars?|gas station|petrol|pharmac(y|ies)|hospitals?|parks?|gyms?|stores? near|shops? near|atm|supermarket)\b/i.test(
    text,
  )
}

async function geocode(query: string): Promise<[number, number] | null> {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`,
      { headers: { Accept: 'application/json' } },
    )
    const d = await r.json()
    if (d?.[0]) return [parseFloat(d[0].lat), parseFloat(d[0].lon)]
  } catch {
    /* ignore */
  }
  return null
}

/** Searches for places matching `query`. If `near` is given, biases around it. */
export async function searchPlaces(query: string, near?: [number, number]): Promise<PlacesResult | null> {
  try {
    let url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=12&addressdetails=1&q=${encodeURIComponent(query)}`
    if (near) {
      const [la, ln] = near
      const d = 0.1 // ~11km box
      url += `&viewbox=${ln - d},${la + d},${ln + d},${la - d}&bounded=1`
    }
    const r = await fetch(url, { headers: { Accept: 'application/json' } })
    const data = await r.json()
    if (!Array.isArray(data) || !data.length) return null
    const places: Place[] = data.map((p: any) => ({
      name: p.name || p.display_name?.split(',')[0] || 'Place',
      address: p.display_name || '',
      lat: parseFloat(p.lat),
      lng: parseFloat(p.lon),
      category: p.type,
    }))
    const center: [number, number] = near ?? [places[0].lat, places[0].lng]
    return { center, places, label: query }
  } catch {
    return null
  }
}

export function getUserLocation(timeout = 8000): Promise<[number, number] | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null)
    const t = setTimeout(() => resolve(null), timeout)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(t)
        resolve([pos.coords.latitude, pos.coords.longitude])
      },
      () => {
        clearTimeout(t)
        resolve(null)
      },
      { enableHighAccuracy: false, timeout },
    )
  })
}

export { geocode }
