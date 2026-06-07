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
  return /\b(near me|nearby|near by|near my location|near current location|using my location|close to me|by me|in my area|around here|nearest|closest|around me|where (is|are|can i)|find (me )?(a |the )?(nearest|closest|nearby)?|directions to|how do i get to|on a map|shopping mall|malls?|restaurants?|cafes?|coffee shops?|hotels?|bars?|gas station|petrol|pharmac(y|ies)|hospitals?|parks?|gyms?|stores? near|shops? near|atm|supermarket)\b/i.test(
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
      { enableHighAccuracy: true, timeout, maximumAge: 300000 },
    )
  })
}

export async function getLocationPermissionState(): Promise<PermissionState | 'unsupported' | 'unknown'> {
  try {
    if (!navigator.geolocation) return 'unsupported'
    if (!navigator.permissions?.query) return 'unknown'
    const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName })
    return status.state
  } catch {
    return 'unknown'
  }
}

export interface UserPlace {
  lat: number
  lng: number
  city?: string
  country?: string
  label: string
}

let cachedPlace: UserPlace | null = null

export function getCachedUserPlace(): UserPlace | null {
  return cachedPlace
}

export function clearUserPlaceCache() {
  cachedPlace = null
}

// The user's real location (device GPS + reverse geocode), cached for the
// session. Used to give the AI accurate "where am I / near me" context instead
// of it hallucinating a city.
export async function getUserPlace(opts: { forceRefresh?: boolean } = {}): Promise<UserPlace | null> {
  if (cachedPlace && !opts.forceRefresh) return cachedPlace
  const loc = await getUserLocation()
  if (!loc) return null
  let city: string | undefined
  let country: string | undefined
  try {
    const r = await fetch(`https://photon.komoot.io/reverse?lat=${loc[0]}&lon=${loc[1]}`)
    const d = await r.json()
    const p = d?.features?.[0]?.properties ?? {}
    city = p.city || p.town || p.village || p.name || p.county || p.state
    country = p.country
  } catch {
    /* reverse geocode failed — still return coords */
  }
  const label =
    [city, country].filter(Boolean).join(', ') || `${loc[0].toFixed(3)}, ${loc[1].toFixed(3)}`
  cachedPlace = { lat: loc[0], lng: loc[1], city, country, label }
  return cachedPlace
}

// Does the message need the user's location? (multilingual — EN + Bosnian/
// Croatian/Serbian + common roots) so "where am I", "gdje sam", "u kojem
// gradu", "near me", "auto servis ... blizu" all trigger location context.
export function wantsLocationContext(text: string): boolean {
  return (
    wantsPlaces(text) ||
    /\b(where am i|my location|your location|use my location|using my location|current location|my city|which city|what city|near me|nearby|near my location|around here|around me|closest|nearest|here|my area|directions|local to me)\b/i.test(
      text,
    ) ||
    /(gdje sam|gdje se|u kojem gradu|koji grad|moja lokacij|gde sam|gde se|blizu mene|u mojoj blizini|pored mene|gdje je|gdje su|najbli|lokacij|grad u kojem)/i.test(
      text,
    )
  )
}
