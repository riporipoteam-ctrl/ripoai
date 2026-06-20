import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Navigation, MapPin } from 'lucide-react'
import type { Place } from '../lib/places'

export interface MapData {
  center: [number, number]
  places: Place[]
  label: string
}

function dirUrl(p: Place) {
  return `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`
}

export default function MapCard({ data }: { data: MapData }) {
  const ref = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const [active, setActive] = useState(0)

  useEffect(() => {
    if (!ref.current || mapRef.current) return
    const dark = document.documentElement.classList.contains('dark')
    const map = L.map(ref.current, { zoomControl: true, attributionControl: false }).setView(data.center, 13)
    mapRef.current = map
    L.tileLayer(
      dark
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
      { maxZoom: 19 },
    ).addTo(map)

    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
    const color = accent ? `rgb(${accent})` : '#7c5cff'
    const bounds: [number, number][] = []
    data.places.forEach((p, i) => {
      const icon = L.divIcon({
        className: '',
        html: `<div style="background:${color};width:26px;height:26px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center"><span style="transform:rotate(45deg);color:#fff;font-size:11px;font-weight:700">${i + 1}</span></div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 26],
      })
      const m = L.marker([p.lat, p.lng], { icon }).addTo(map)
      m.bindPopup(`<strong>${p.name}</strong><br>${p.address.split(',').slice(0, 3).join(',')}`)
      m.on('click', () => setActive(i))
      bounds.push([p.lat, p.lng])
    })
    if (bounds.length > 1) map.fitBounds(bounds, { padding: [30, 30] })
    setTimeout(() => map.invalidateSize(), 200)
    return () => {
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function focus(i: number) {
    setActive(i)
    const p = data.places[i]
    mapRef.current?.setView([p.lat, p.lng], 16, { animate: true })
  }

  return (
    <div className="my-2 w-full max-w-lg overflow-hidden rounded-3xl border border-white/10 bg-white/5">
      <div className="flex items-center gap-2 px-3 py-2 text-sm font-semibold">
        <MapPin size={15} className="text-accent" /> {data.label}
        <span className="ml-auto text-xs text-muted">{data.places.length} places</span>
      </div>
      <div ref={ref} className="h-56 w-full" style={{ background: 'rgba(127,127,127,0.1)' }} />
      <ul className="max-h-60 divide-y divide-white/5 overflow-y-auto">
        {data.places.map((p, i) => (
          <li
            key={i}
            className={`flex items-start gap-2 px-3 py-2.5 text-sm transition ${active === i ? 'bg-white/8' : ''}`}
          >
            <button onClick={() => focus(i)} className="flex min-w-0 flex-1 items-start gap-2 text-left">
              <span className="accent-gradient-bg mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white">
                {i + 1}
              </span>
              <span className="min-w-0">
                <div className="truncate font-medium">{p.name}</div>
                <div className="truncate text-xs text-muted">{p.address.split(',').slice(1, 4).join(',').trim()}</div>
              </span>
            </button>
            <a
              href={dirUrl(p)}
              target="_blank"
              rel="noreferrer"
              className="accent-gradient-bg pressable flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold text-white"
            >
              <Navigation size={12} /> Directions
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
