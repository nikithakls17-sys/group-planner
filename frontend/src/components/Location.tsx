import { useEffect, useRef, useState } from 'react'
import { local } from '../api'
import { Button, inputCls } from './ui'

export type Loc = { city: string; lat?: number; lon?: number }

/** City-level location, detected in the browser. Never an address. */
export async function detectCity(): Promise<Loc | null> {
  if (!('geolocation' in navigator)) return null
  const pos = await new Promise<GeolocationPosition | null>((res) =>
    navigator.geolocation.getCurrentPosition(res, () => res(null), { timeout: 8000, maximumAge: 3600_000, enableHighAccuracy: false }),
  )
  if (!pos) return null
  // round to ~1 km before it leaves the phone
  const lat = Math.round(pos.coords.latitude * 100) / 100
  const lon = Math.round(pos.coords.longitude * 100) / 100
  try {
    const r = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`)
    const j = await r.json()
    const city = [j.city || j.locality, j.countryName].filter(Boolean).join(', ')
    return { city: city || 'Near you', lat, lon }
  } catch {
    return { city: 'Near you', lat, lon }
  }
}

/** "You're in Bengaluru. Change location." Detects once, then lets people type a city instead. */
export default function LocationLine({ value, onChange }: { value: Loc | null; onChange: (l: Loc) => void }) {
  const [editing, setEditing] = useState(false)
  const [typed, setTyped] = useState(value?.city ?? local.city())
  const [state, setState] = useState<'idle' | 'finding' | 'failed'>('idle')
  const tried = useRef(false)

  useEffect(() => {
    if (value?.city || tried.current) return
    tried.current = true
    setState('finding')
    detectCity().then((l) => {
      if (l) {
        local.setCity(l.city)
        onChange(l)
        setState('idle')
      } else {
        setState('failed')
        setEditing(true)
      }
    })
  }, [value, onChange])

  if (editing) {
    return (
      <div className="flex flex-col gap-2">
        <label className="label" htmlFor="city">Your city or neighbourhood</label>
        <div className="flex gap-2">
          <input id="city" className={inputCls} value={typed} autoComplete="address-level2" placeholder="e.g. Bengaluru, India" onChange={(e) => setTyped(e.target.value)} />
          <Button variant="secondary" disabled={!typed.trim()} onClick={() => { local.setCity(typed.trim()); onChange({ city: typed.trim() }); setEditing(false) }}>Save</Button>
        </div>
        {state === 'failed' && <p className="text-sm text-ink-soft">We couldn't detect where you are. Type your city instead. Never your address.</p>}
      </div>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-x-2 border-2 border-dashed border-ink-soft px-3 py-2">
      <span className="label text-ink-soft">Location</span>
      <span className="font-hand text-lg">{state === 'finding' ? 'Finding your city...' : value?.city || 'Not set'}</span>
      <Button variant="text" onClick={() => setEditing(true)}>Change location</Button>
    </div>
  )
}
