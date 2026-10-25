import { useEffect, useState } from 'react'
import { api, fmtClock, fmtDay, fmtTime, myTz, parseDay } from '../api'
import { Button, Chip, ErrorBox, Field, inputCls } from './ui'

export const BLOCKS = [
  { key: 'morning', label: 'Morning', from: 9, to: 12 },
  { key: 'afternoon', label: 'Afternoon', from: 12, to: 17 },
  { key: 'evening', label: 'Evening', from: 17, to: 21 },
  { key: 'late', label: 'Late', from: 21, to: 23 },
]

export type Slot = { start: string; end: string }

export function cellsToSlots(cells: string[]): Slot[] {
  return cells.map((c) => {
    const [day, key] = c.split('|')
    const b = BLOCKS.find((x) => x.key === key)!
    const d = parseDay(day)
    return {
      start: new Date(d.getFullYear(), d.getMonth(), d.getDate(), b.from).toISOString(),
      end: new Date(d.getFullYear(), d.getMonth(), d.getDate(), b.to).toISOString(),
    }
  })
}

/** Turn saved slots back into taps on the grid, so going back never loses anything. */
export function slotsToCells(slots: Slot[], days: string[]): string[] {
  const out: string[] = []
  for (const day of days) {
    for (const b of BLOCKS) {
      const [cs] = cellsToSlots([`${day}|${b.key}`])
      if (slots.some((s) => s.start <= cs.start && s.end >= cs.end)) out.push(`${day}|${b.key}`)
    }
  }
  return out
}

export function useCalendarStatus() {
  const [ready, setReady] = useState<boolean | null>(null)
  useEffect(() => {
    api<{ calendar?: boolean }>('/health').then((h) => setReady(!!h.calendar)).catch(() => setReady(false))
  }, [])
  return ready
}

/** "When are you free?": tap parts of each picked date, or type it, or connect Google Calendar. Asked once. */
export default function FreeTimes({ planId, member, days, slots, onChange }: {
  planId: string
  member: string | null
  days: string[]
  slots: Slot[]
  onChange: (slots: Slot[], how: 'tap' | 'type' | 'google', text?: string) => void
}) {
  const [mode, setMode] = useState<'tap' | 'type'>('tap')
  const [cells, setCells] = useState<string[]>(() => slotsToCells(slots, days))
  const [text, setText] = useState('')
  const [typed, setTyped] = useState<Slot[]>([])
  const [reading, setReading] = useState(false)
  const [err, setErr] = useState('')
  const calendar = useCalendarStatus()

  const setGrid = (next: string[]) => {
    setCells(next)
    onChange(cellsToSlots(next), 'tap')
  }
  const toggle = (k: string) => setGrid(cells.includes(k) ? cells.filter((c) => c !== k) : [...cells, k])
  const allDay = (day: string) => {
    const keys = BLOCKS.map((b) => `${day}|${b.key}`)
    const full = keys.every((k) => cells.includes(k))
    setGrid(full ? cells.filter((c) => !keys.includes(c)) : [...new Set([...cells, ...keys])])
  }

  async function read() {
    setReading(true)
    setErr('')
    try {
      const r = await api<{ slots: Slot[] }>(`/plans/${planId}/parse-availability`, { body: { text, tz: myTz() }, member })
      setTyped(r.slots)
      onChange(r.slots, 'type', text)
      if (!r.slots.length) setErr("We couldn't find any of the picked dates in that. Try 'Saturday after 2'.")
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setReading(false)
    }
  }

  if (!days.length) return <p className="font-hand text-lg text-ink-soft">Pick at least one date on the calendar first.</p>

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 border-2 border-ink" role="tablist" aria-label="How to add your free times">
        {(['tap', 'type'] as const).map((m) => (
          <button key={m} role="tab" aria-selected={mode === m} type="button" onClick={() => setMode(m)}
            className={`min-h-12 text-base font-semibold ${mode === m ? 'bg-ink text-surface' : 'bg-surface'}`}>
            {m === 'tap' ? 'Tap times' : 'Type it'}
          </button>
        ))}
      </div>

      {mode === 'tap' ? (
        <ul className="flex flex-col">
          {days.map((day) => (
            <li key={day} className="flex flex-col gap-2 border-b border-rule py-3 first:pt-0">
              <div className="flex items-center justify-between">
                <span className="text-base font-semibold">{fmtDay(day)}</span>
                <Button variant="text" onClick={() => allDay(day)}>
                  {BLOCKS.every((b) => cells.includes(`${day}|${b.key}`)) ? 'Clear' : 'All day'}
                </Button>
              </div>
              <div className="grid grid-cols-4 gap-1">
                {BLOCKS.map((b) => {
                  const k = `${day}|${b.key}`
                  return (
                    <Chip key={k} on={cells.includes(k)} onClick={() => toggle(k)} aria-label={`${fmtDay(day)} ${b.label}`}>
                      <span className="block text-sm leading-tight">{b.label}</span>
                    </Chip>
                  )
                })}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-col gap-3">
          <Field label="When are you free?">
            <textarea className={`${inputCls} min-h-24 py-3`} value={text} placeholder="Free after 6 on Saturday, all day Sunday"
              onChange={(e) => setText(e.target.value)} />
          </Field>
          <Button variant="secondary" disabled={!text.trim() || reading} onClick={read}>
            {reading ? 'Reading...' : typed.length ? 'Read it again' : 'Read it'}
          </Button>
          {typed.length > 0 && (
            <Field label="Is this right? Tap a time to remove it.">
              <div className="flex flex-wrap gap-2">
                {typed.map((s, i) => (
                  <Chip key={i} on onClick={() => { const next = typed.filter((_, j) => j !== i); setTyped(next); onChange(next, 'type', text) }}>
                    {fmtTime(s.start)} to {fmtClock(s.end)}
                  </Chip>
                ))}
              </div>
            </Field>
          )}
        </div>
      )}

      <Button variant="secondary" disabled={!calendar}
        onClick={() => { window.location.href = `/api/calendar/connect?plan=${encodeURIComponent(planId)}&m=${encodeURIComponent(member ?? '')}&back=${encodeURIComponent(window.location.pathname)}` }}>
        Connect Google Calendar
      </Button>
      <p className="text-sm text-ink-soft">
        {calendar ? 'Reads free/busy only, never what your events are.' : 'Google Calendar connect is being set up. Tap or type for now.'}
      </p>
      {err && <ErrorBox message={err} />}
    </div>
  )
}
