import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { local } from '../api'
import { Avatar, Button, ChipGroup, Field, inputCls, Sheet, useToast } from '../components/ui'
import { APP_NAME, MEMBER_COLORS } from '../config'

export type Settings = { theme: 'system' | 'light' | 'dark'; size: 'normal' | 'large'; motion: 'normal' | 'reduce'; color: string }

export function readSettings(): Settings {
  try {
    return { theme: 'system', size: 'normal', motion: 'normal', color: MEMBER_COLORS[2].hex, ...JSON.parse(localStorage.getItem('np.settings') || '{}') }
  } catch {
    return { theme: 'system', size: 'normal', motion: 'normal', color: MEMBER_COLORS[2].hex }
  }
}

export function applySettings(s: Settings) {
  const d = document.documentElement
  if (s.theme === 'system') delete d.dataset.theme
  else d.dataset.theme = s.theme
  d.dataset.size = s.size
  d.dataset.motion = s.motion
}

export default function SettingsPage() {
  const toast = useToast()
  const [s, setS] = useState<Settings>(readSettings)
  const [name, setName] = useState(local.name())
  const [wipe, setWipe] = useState(false)
  useEffect(() => {
    applySettings(s)
    try { localStorage.setItem('np.settings', JSON.stringify(s)) } catch { /* private mode */ }
  }, [s])
  const set = (patch: Partial<Settings>) => setS((x) => ({ ...x, ...patch }))
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      <section className="flex flex-col gap-5 border-2 border-rule bg-surface p-4">
        <Field label="Theme">
          <ChipGroup label="Theme" options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, { value: 'system', label: 'Match my phone' }]}
            value={s.theme} onChange={(v: string) => set({ theme: v as Settings['theme'] })} />
        </Field>
        <Field label="Text size">
          <ChipGroup label="Text size" options={[{ value: 'normal', label: 'Normal' }, { value: 'large', label: 'Large' }]}
            value={s.size} onChange={(v: string) => set({ size: v as Settings['size'] })} />
        </Field>
        <Field label="Motion">
          <ChipGroup label="Motion" options={[{ value: 'normal', label: 'Normal' }, { value: 'reduce', label: 'Reduce motion' }]}
            value={s.motion} onChange={(v: string) => set({ motion: v as Settings['motion'] })} />
        </Field>
      </section>

      <section className="flex flex-col gap-5 border-2 border-rule bg-surface p-4">
        <Field label="Your name" hint="Filled in for you on new plans and invites.">
          <div className="flex gap-2">
            <input className={inputCls} value={name} autoComplete="given-name" onChange={(e) => setName(e.target.value)} />
            <Button variant="secondary" onClick={() => { local.setName(name.trim()); toast('Saved') }}>Save</Button>
          </div>
        </Field>
        <Field label="Your usual color" hint="Used for new plans. You can change it on any plan from its More menu.">
          <div className="flex flex-wrap gap-2">
            {MEMBER_COLORS.map((c) => (
              <button key={c.hex} type="button" aria-label={c.name} aria-pressed={s.color === c.hex} onClick={() => set({ color: c.hex })}
                className={`p-1 ${s.color === c.hex ? 'outline-2 outline-ink' : ''}`}>
                <Avatar name={name || '?'} color={c.hex} size={40} />
              </button>
            ))}
          </div>
        </Field>
      </section>

      <section className="flex flex-col gap-3 border-2 border-rule bg-surface p-4">
        <span className="label">Your data</span>
        <p className="text-base">No account. Your plans and groups are remembered in this browser only. City-level location, never your address; calendar free/busy only.</p>
        <Button variant="secondary" onClick={() => setWipe(true)}>Forget everything on this device</Button>
      </section>

      <Link to="/about" className="flex items-center justify-between border-2 border-rule bg-surface p-4">
        <span className="text-xl font-bold">About {APP_NAME}</span>
      </Link>

      <Sheet open={wipe} onClose={() => setWipe(false)} title="Forget everything?">
        <div className="flex flex-col gap-4">
          <p className="text-base">This removes your name, settings and the list of your plans and groups from this browser. Plans themselves stay for your friends; delete a plan or group from its page to remove it for everyone.</p>
          <Button onClick={() => { try { localStorage.clear() } catch { /* ignore */ } window.location.href = '/' }}>Forget everything</Button>
        </div>
      </Sheet>
    </div>
  )
}
