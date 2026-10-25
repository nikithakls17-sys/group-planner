import { useState, type ReactNode } from 'react'
import { addDays, parseDay, ymd } from '../api'

const WEEK = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

/** A real month calendar. Tap dates to pick them. `allowed` limits which dates can be tapped. */
export default function Calendar({ selected, onToggle, allowed, mark, label = 'Pick dates' }: {
  selected: string[]
  onToggle: (day: string) => void
  allowed?: (day: string) => boolean
  mark?: (day: string) => ReactNode
  label?: string
}) {
  const today = ymd(new Date())
  const first = selected.length ? parseDay([...selected].sort()[0]) : new Date()
  const [month, setMonth] = useState(new Date(first.getFullYear(), first.getMonth(), 1))
  const start = addDays(month, -((month.getDay() + 6) % 7)) // back to Monday
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i))
  const rows = cells.slice(35).every((d) => d.getMonth() !== month.getMonth()) ? cells.slice(0, 35) : cells
  const title = month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  const shift = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1))
  const canBack = new Date(month.getFullYear(), month.getMonth(), 1) > new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  return (
    <div className="border-2 border-ink bg-surface" role="group" aria-label={label}>
      <div className="flex items-center justify-between border-b-2 border-ink">
        <button type="button" onClick={() => shift(-1)} disabled={!canBack} aria-label="Previous month" className="min-h-12 min-w-12 text-lg font-bold disabled:opacity-30">
          {'<'}
        </button>
        <span className="display text-lg">{title}</span>
        <button type="button" onClick={() => shift(1)} aria-label="Next month" className="min-h-12 min-w-12 text-lg font-bold">
          {'>'}
        </button>
      </div>
      <div className="grid grid-cols-7">
        {WEEK.map((w) => (
          <span key={w} className="label py-2 text-center text-ink-soft">{w}</span>
        ))}
        {rows.map((d) => {
          const day = ymd(d)
          const inMonth = d.getMonth() === month.getMonth()
          const past = day < today
          const ok = !past && (allowed ? allowed(day) : true)
          const on = selected.includes(day)
          return (
            <button
              key={day}
              type="button"
              disabled={!ok}
              aria-pressed={on}
              aria-label={d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
              onClick={() => onToggle(day)}
              className={`relative flex min-h-12 flex-col items-center justify-center border-t border-rule text-base ${
                on ? 'bg-accent font-bold text-accent-ink' : ok ? 'hover:bg-muted' : 'text-ink-soft/40'
              } ${inMonth ? '' : 'opacity-50'} ${day === today && !on ? 'underline decoration-2 underline-offset-4' : ''}`}
            >
              {d.getDate()}
              {mark && <span className="absolute bottom-0.5 flex gap-0.5">{mark(day)}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
