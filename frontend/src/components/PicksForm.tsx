import type { Picks } from '../api'
import { ChipGroup, Field, inputCls } from './ui'

export const WHERE = [
  { value: 'home', label: "At someone's home" },
  { value: 'out', label: 'Out somewhere' },
  { value: 'online', label: 'Online' },
  { value: 'anywhere', label: 'Anywhere' },
]
export const DISTANCE = [
  { value: 'walk', label: 'Walking distance' },
  { value: 'short', label: 'Short drive' },
  { value: 'hour', label: 'Up to 1 hour' },
  { value: 'any', label: "Doesn't matter" },
]
export const BUDGET = [
  { value: 'free', label: 'Free' },
  { value: 'small', label: 'Small (under $15)' },
  { value: 'medium', label: 'Medium (under $40)' },
  { value: 'big', label: 'Big (flexible)' },
  { value: 'custom', label: 'Custom amount' },
  { value: 'nopref', label: 'No preference' },
]
export const MOODS = [
  { value: 'chill', label: 'Chill' },
  { value: 'active', label: 'Active' },
  { value: 'food', label: 'Food' },
  { value: 'outdoors', label: 'Outdoors' },
  { value: 'games', label: 'Games' },
  { value: 'new', label: 'Something new' },
  { value: 'nopref', label: 'No preference' },
]
export const CAR = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'ride', label: 'Can get a ride' },
]

export const DEFAULT_PICKS: Picks = { where: 'anywhere', distance: 'short', budget: 'small', moods: ['nopref'], ideas: '', car: 'yes', notes: '' }

const label = (list: { value: string; label: string }[], v?: string) => list.find((x) => x.value === v)?.label ?? ''

export function summary(p: Picks) {
  const bits = [
    (p.moods ?? []).filter((m) => m !== 'nopref').map((m) => label(MOODS, m).toLowerCase()).join(', '),
    p.budget === 'custom' ? `under $${p.budget_custom}` : p.budget && p.budget !== 'nopref' ? label(BUDGET, p.budget).toLowerCase() : '',
    p.where && p.where !== 'anywhere' ? label(WHERE, p.where).toLowerCase() : '',
    p.distance && p.distance !== 'any' ? label(DISTANCE, p.distance).toLowerCase() : '',
  ]
  return bits.filter(Boolean).join(', ') || 'anything goes'
}

/** The details: shared by the planner ("I'll set the details") and each member's quick picks. */
export default function PicksForm({ value, onChange, member }: { value: Picks; onChange: (p: Picks) => void; member?: boolean }) {
  const set = (k: keyof Picks) => (v: unknown) => onChange({ ...value, [k]: v })
  const inPerson = value.where !== 'online'
  return (
    <div className="flex flex-col gap-6">
      <Field label="Where">
        <ChipGroup label="Where" options={WHERE} value={value.where ?? 'anywhere'} onChange={set('where')} />
      </Field>
      {inPerson && (
        <Field label="How far would you go?">
          <ChipGroup label="How far" options={[...DISTANCE.slice(0, 3), { value: 'any', label: "Doesn't matter" }]} value={value.distance ?? 'short'} onChange={set('distance')} />
        </Field>
      )}
      <Field label="Budget per person">
        <ChipGroup label="Budget" options={BUDGET} value={value.budget ?? 'small'} onChange={set('budget')} />
      </Field>
      {value.budget === 'custom' && (
        <Field label="Up to how much? (dollars per person)">
          <input className={inputCls} type="number" inputMode="numeric" min={0} value={value.budget_custom ?? ''} onChange={(e) => set('budget_custom')(e.target.value)} />
        </Field>
      )}
      <Field label="Mood (pick any)">
        <ChipGroup label="Mood" multi options={MOODS} value={value.moods ?? ['nopref']} onChange={set('moods')} />
      </Field>
      {member && inPerson && (
        <Field label="Do you have a car?">
          <ChipGroup label="Car" options={CAR} value={value.car ?? 'yes'} onChange={set('car')} />
        </Field>
      )}
      {member && (value.where === 'home' || value.where === 'anywhere') && (
        <Field label="Could you host at your place?">
          <ChipGroup
            label="Host"
            options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]}
            value={value.can_host ? 'yes' : 'no'}
            onChange={(v: string) => set('can_host')(v === 'yes')}
          />
        </Field>
      )}
      <Field label="Anything you'd love to do? (optional)">
        <input className={inputCls} value={value.ideas ?? ''} placeholder="Try the new ramen place, bowling, a sunset walk" onChange={(e) => set('ideas')(e.target.value)} />
      </Field>
      {member && (
        <Field label="Anything we should know? (optional)" hint="Vegetarian, no alcohol, bringing a kid, accessibility needs">
          <input className={inputCls} value={value.notes ?? ''} onChange={(e) => set('notes')(e.target.value)} />
        </Field>
      )}
    </div>
  )
}
