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

function addrOf(p: any): string {
  return [p.street, p.district, p.city, p.state, p.country].filter(Boolean).join(', ')
}

function cleanQuery(q: string): string {
  return q
    .replace(/\?/g, ' ')
    .replace(/\b(where (is|are|can i find)|show me|can you (find|show)|find( me)?|please|the )\b/gi, ' ')
    .replace(/\b(nearest|closest|nearby|near by|around me|near me|best|top|good|some|a few)\b/gi, ' ')
    .replace(/\bon (a |the )?map\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Searches for places matching `query` via Photon (OSM). Biases around `near`. */
export async function searchPlaces(query: string, near?: [number, number]): Promise<PlacesResult | null> {
  try {
    const q = cleanQuery(query) || query
    let url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=12`
    if (near) url += `&lat=${near[0]}&lon=${near[1]}`
    const r = await fetch(url)
    const data = await r.json()
    const feats: any[] = data?.features ?? []
    const places: Place[] = feats
      .filter((f) => f.geometry?.coordinates && (f.properties?.name || f.properties?.street))
      .map((f) => ({
        name: f.properties.name || f.properties.street || 'Place',
        address: addrOf(f.properties),
        lat: f.geometry.coordinates[1],
        lng: f.geometry.coordinates[0],
        category: f.properties.osm_value,
      }))
    if (!places.length) return null
    const center: [number, number] = near ?? [places[0].lat, places[0].lng]
    return { center, places, label: q }
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
