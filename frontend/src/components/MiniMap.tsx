import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef } from 'react'
import { initials } from './ui'

type Person = { pub: string; name: string; color: string; spot?: [number, number] | null }

/** A small map for a place card: a pin for where we meet, and a coloured initials dot for each person at their
 *  city-level spot (rounded to about 10 km, never an address). OpenStreetMap tiles, no key. */
export default function MiniMap({ lat, lon, title, people }: { lat: number; lon: number; title: string; people: Person[] }) {
  const el = useRef<HTMLDivElement>(null)
  const who = people.filter((p) => p.spot)
  const key = `${lat},${lon}|${who.map((p) => `${p.pub}${p.spot}${p.color}`).join(';')}`

  useEffect(() => {
    if (!el.current) return
    const map = L.map(el.current, { zoomControl: false, attributionControl: true, scrollWheelZoom: false, dragging: false, touchZoom: false,
      doubleClickZoom: false, boxZoom: false, keyboard: false })
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; OpenStreetMap' }).addTo(map)
    map.attributionControl.setPrefix(false)
    const pin = L.divIcon({ className: '', iconSize: [26, 34], iconAnchor: [13, 34],
      html: '<svg viewBox="0 0 26 34" width="26" height="34" aria-hidden="true"><path d="M13 33C13 33 2 20 2 12a11 11 0 0 1 22 0c0 8-11 21-11 21z" fill="var(--ink)" stroke="var(--surface)" stroke-width="2"/><circle cx="13" cy="12" r="4" fill="var(--surface)"/></svg>' })
    L.marker([lat, lon], { icon: pin, title, zIndexOffset: 1000 }).addTo(map)
    // people sharing a spot sit side by side instead of on top of each other
    const seen: Record<string, number> = {}
    for (const p of who) {
      const k = String(p.spot)
      const n = (seen[k] = (seen[k] ?? -1) + 1)
      const icon = L.divIcon({ className: '', iconSize: [24, 24], iconAnchor: [12 - n * 20, 12],
        html: `<span class="map-dot on-pastel" style="background:${p.color}">${initials(p.name)}</span>` })
      L.marker(p.spot!, { icon, title: `${p.name}, roughly` }).addTo(map)
    }
    const pts = [[lat, lon], ...who.map((p) => p.spot!)] as L.LatLngTuple[]
    if (pts.length > 1) map.fitBounds(L.latLngBounds(pts), { padding: [28, 28], maxZoom: 13 })
    else map.setView([lat, lon], 13)
    return () => { map.remove() }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="mini-map h-40 w-full border-2 border-ink" ref={el} role="img"
      aria-label={`Map: ${title}${who.length ? `, and roughly where ${who.map((p) => p.name).join(', ')} are coming from` : ''}`} />
  )
}
