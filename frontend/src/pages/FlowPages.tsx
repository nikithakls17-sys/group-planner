import { useState } from 'react'
import { fmtRange, local, type Member, type Picks, type Plan } from '../api'
import LocationLine from '../components/Location'
import { Avatar, AvatarRow, Button, Chip, ChipGroup, ErrorBox, Field, Help, inputCls, Note, PageHeading, SubHeading, Working } from '../components/ui'
import { PASTELS } from '../config'

export type FlowProps = {
  plan: Plan | null
  me: Member | null
  isPlanner: boolean
  busy: boolean
  run: (fn: () => Promise<unknown>, ok?: string) => Promise<void>
  call: (path: string, body?: unknown, method?: string) => Promise<Plan>
  setTab: (t: string) => void
  color: string
}

type P = Picks & { activities?: string[]; duration?: string; access?: string[]; access_other?: string }

const mine = (me: Member | null): P => ({ ...(local.lastPicks() ?? {}), ...(me?.picks ?? {}) }) as P

/* ---------------- Budget ---------------- */

const BUDGETS = [
  { value: 'free', label: 'Free' },
  { value: 'small', label: 'Under $15' },
  { value: 'medium', label: 'Under $40' },
  { value: 'big', label: 'Flexible' },
  { value: 'custom', label: 'Custom' },
]

export function BudgetPage({ plan, me, isPlanner, busy, run, call, setTab, color }: FlowProps) {
  const [picks, setPicks] = useState<P>(() => ({ budget: 'small', ...mine(me) }))
  const [limit, setLimit] = useState(plan?.budget_limit != null ? String(plan.budget_limit) : '20')
  if (!plan || !me) return null
  const shared = plan.budget_mode === 'shared'
  return (
    <>
      <PageHeading color={color} sub="Per person. Only the lowest budget is shown to the group, never whose it is.">Budget</PageHeading>
      {isPlanner && (
        <div className="grid grid-cols-2 border-2 border-ink" role="radiogroup" aria-label="How to set the budget">
          {(['each', 'shared'] as const).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={(plan.budget_mode ?? 'each') === m} disabled={busy}
              onClick={() => run(() => call('', { budget_mode: m, ...(m === 'shared' ? { budget_limit: Number(limit) || 0 } : {}) }, 'PATCH'))}
              className={`min-h-12 px-2 text-sm font-semibold ${(plan.budget_mode ?? 'each') === m ? 'bg-ink text-bg' : 'bg-surface'}`}>
              {m === 'each' ? 'Everyone sets their own' : 'One limit for everyone'}
            </button>
          ))}
        </div>
      )}
      {shared ? (
        <div className="flex flex-col gap-3 border-2 border-rule bg-surface p-4">
          {isPlanner ? (
            <Field label="Limit per person (dollars)">
              <div className="flex gap-2">
                <input className={inputCls} type="number" inputMode="numeric" min={0} value={limit} onChange={(e) => setLimit(e.target.value)} />
                <Button variant="secondary" disabled={busy} onClick={() => run(() => call('', { budget_limit: Number(limit) || 0 }, 'PATCH'), 'Saved')}>Save</Button>
              </div>
            </Field>
          ) : (
            <p className="text-lg">The group agreed on <b>${plan.budget_limit ?? 0} per person</b>.</p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <SubHeading>Your budget</SubHeading>
          <ChipGroup label="Your budget" options={BUDGETS} value={picks.budget ?? 'small'} onChange={(v: string) => setPicks({ ...picks, budget: v })} />
          {picks.budget === 'custom' && (
            <Field label="Up to how much? (dollars)">
              <input className={inputCls} type="number" inputMode="numeric" min={0} value={picks.budget_custom ?? ''} onChange={(e) => setPicks({ ...picks, budget_custom: e.target.value })} />
            </Field>
          )}
        </div>
      )}
      {plan.lowest_budget != null && <Note>Lowest budget so far: ${plan.lowest_budget} per person.</Note>}
      <Button full disabled={busy} onClick={() => run(async () => { local.setLastPicks(picks); await call('/me', { picks }, 'PATCH'); setTab('activity') }, 'Saved')}>
        Save and next
      </Button>
    </>
  )
}

/* ---------------- Activity ---------------- */

const ACTIVITIES = [
  { value: 'cafe', label: 'Cafe' }, { value: 'food', label: 'Food' }, { value: 'park', label: 'Park' },
  { value: 'movie', label: 'Movie' }, { value: 'bowling', label: 'Bowling' }, { value: 'games', label: 'Board games' },
  { value: 'museum', label: 'Museum' }, { value: 'karaoke', label: 'Karaoke' }, { value: 'shopping', label: 'Shopping' },
  { value: 'hike', label: 'Hike' }, { value: 'dessert', label: 'Dessert' },
]
const ONLINE_ACTIVITIES = [
  { value: 'games', label: 'Online games' }, { value: 'movie', label: 'Watch party' }, { value: 'quiz', label: 'Quiz night' },
  { value: 'cook', label: 'Cook-along' }, { value: 'chat', label: 'Just chat' },
]

export function ActivityPage({ plan, me, busy, run, call, setTab, color }: FlowProps) {
  const [picks, setPicks] = useState<P>(() => ({ activities: [], ...mine(me) }))
  const [custom, setCustom] = useState('')
  if (!plan || !me) return null
  const list = plan.mode === 'online' ? ONLINE_ACTIVITIES : ACTIVITIES
  const acts = picks.activities ?? []
  const byPub = Object.fromEntries(plan.members.map((m) => [m.pub, m]))
  const tally = plan.tallies?.activities ?? []
  const top = tally[0]?.pubs.length ?? 0
  const label = (v: string) => [...ACTIVITIES, ...ONLINE_ACTIVITIES].find((a) => a.value === v)?.label ?? v
  const extra = acts.filter((a) => !list.some((x) => x.value === a))
  return (
    <>
      <PageHeading color={color} sub="Pick any. Add your own. Everyone sees what the group picked.">What kind of activity?</PageHeading>
      <ChipGroup label="Activities" multi options={[...list, ...extra.map((a) => ({ value: a, label: a }))]} value={acts}
        onChange={(v: string[]) => setPicks({ ...picks, activities: v })} />
      <div className="flex gap-2">
        <input className={inputCls} placeholder="Something else? e.g. pottery, arcade" aria-label="Add an activity" value={custom} maxLength={40}
          onChange={(e) => setCustom(e.target.value)} />
        <Button variant="secondary" disabled={!custom.trim()} onClick={() => { setPicks({ ...picks, activities: [...new Set([...acts, custom.trim().toLowerCase()])] }); setCustom('') }}>Add</Button>
      </div>
      <Button full disabled={busy || !acts.length} onClick={() => run(async () => { local.setLastPicks(picks); await call('/me', { picks }, 'PATCH'); setTab('where') }, 'Saved')}>
        Save and next
      </Button>
      {tally.length > 0 && (
        <div className="flex flex-col gap-2">
          <SubHeading>What the group picked</SubHeading>
          <ul className="flex flex-col">
            {tally.map((a) => (
              <li key={a.name} className="flex min-h-12 items-center gap-3 border-b border-rule">
                <span className="w-32 font-semibold capitalize">{label(a.name)}</span>
                <span className="flex-1"><AvatarRow size={26} people={a.pubs.map((p) => byPub[p]).filter(Boolean)} /></span>
                {a.pubs.length === top && top > 0 && <span className="bg-accent px-2 py-0.5 text-sm font-bold text-accent-ink">Majority</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}

/* ---------------- Where: starting point, how far, how long ---------------- */

const DISTANCE = [
  { value: 'walk', label: 'Walking distance' }, { value: 'short', label: 'Short drive' },
  { value: 'hour', label: 'Up to 1 hour' }, { value: 'any', label: "Doesn't matter" },
]
const DURATION = [
  { value: '1h', label: 'About an hour' }, { value: '2h', label: '2 hours' }, { value: 'half', label: 'Half a day' }, { value: 'full', label: 'All day' },
]
const ACCESS = [
  { value: 'step_free', label: 'Step-free / wheelchair access' }, { value: 'restroom', label: 'Accessible restroom' },
  { value: 'seating', label: 'Seating available' }, { value: 'quiet', label: 'Quiet place' },
  { value: 'parking', label: 'Close parking' }, { value: 'other', label: 'Other' },
]

export function WherePage({ plan, me, busy, run, call, setTab, color }: FlowProps) {
  const [picks, setPicks] = useState<P>(() => ({ distance: 'short', duration: '2h', car: 'yes', access: [], ...mine(me) }))
  if (!plan || !me) return null
  const online = plan.mode === 'online'
  const set = (patch: Partial<P>) => setPicks({ ...picks, ...patch })
  return (
    <>
      <PageHeading color={color} sub={online ? 'Just how long.' : 'Where you start from, how far you would go and how long.'}>
        {online ? 'How long?' : 'Where and how long'}
      </PageHeading>
      {!online && (
        <>
          <Field label="Starting from">
            <LocationLine value={me.city ? { city: me.city } : null} onChange={(l) => run(() => call('/me', { city: l.city, lat: l.lat, lon: l.lon }, 'PATCH'), 'Location saved')} />
          </Field>
          <Field label="How far would you go?">
            <ChipGroup label="How far" options={DISTANCE} value={picks.distance ?? 'short'} onChange={(v: string) => set({ distance: v })} />
          </Field>
        </>
      )}
      <Field label="How long do you want to spend?">
        <ChipGroup label="How long" options={DURATION} value={picks.duration ?? '2h'} onChange={(v: string) => set({ duration: v })} />
      </Field>
      {!online && (
        <>
          <Field label="Do you have a car?">
            <ChipGroup label="Car" options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: 'ride', label: 'Can get a ride' }]}
              value={picks.car ?? 'yes'} onChange={(v: string) => set({ car: v })} />
          </Field>
          <Field label="Could you host at your place?">
            <ChipGroup label="Host" options={[{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }]} value={picks.can_host ? 'yes' : 'no'}
              onChange={(v: string) => set({ can_host: v === 'yes' })} />
          </Field>
          <div className="flex flex-col gap-3 border-2 border-rule bg-surface p-4">
            <span className="text-base font-semibold">Anything that would make a place easier for you? (optional)</span>
            <p className="text-sm text-ink-soft">Private. Nobody sees who asked; places just say they were checked for everyone's access needs. Remembered for next time.</p>
            <ChipGroup label="Access needs" multi options={ACCESS} value={picks.access ?? []} onChange={(v: string[]) => set({ access: v })} />
            {(picks.access ?? []).includes('other') && (
              <input className={inputCls} aria-label="Other access need" maxLength={80} value={picks.access_other ?? ''} onChange={(e) => set({ access_other: e.target.value })} />
            )}
          </div>
        </>
      )}
      <Button full disabled={busy} onClick={() => run(async () => { local.setLastPicks(picks); await call('/me', { picks }, 'PATCH'); setTab('places') }, 'Saved')}>
        Save and next
      </Button>
    </>
  )
}

/* ---------------- Places: pick up to 2, the majority wins ---------------- */

export function PlacePicker({ plan, me, isPlanner, busy, run, call }: FlowProps) {
  const myPub = me?.pub ?? ''
  const votes = plan?.place_votes ?? {}
  const [sel, setSel] = useState<string[]>(() => Object.entries(votes).filter(([, pubs]) => pubs.includes(myPub)).map(([id]) => id))
  if (!plan) return null
  const byPub = Object.fromEntries(plan.members.map((m) => [m.pub, m]))
  const toggle = (id: string) => setSel(sel.includes(id) ? sel.filter((x) => x !== id) : sel.length < 2 ? [...sel, id] : [sel[1], id])
  return (
    <div className="flex flex-col gap-6">
      <p className="text-base">Pick up to 2. The place most people pick wins.</p>
      {plan.places.map((p, i) => {
        const on = sel.includes(p.id)
        const tilt = [-1.4, 1.1, -0.7, 1.5, -1.1, 0.8][i % 6]
        const tint = PASTELS[(i + 3) % PASTELS.length].hex
        const where = p.kind === 'online' ? 'Online' : p.kind === 'home' ? `At ${p.host}'s home` : p.address
        return (
          <article key={p.id} className={`border-[6px] p-4 shadow-[var(--sticker-shadow)] ${on ? 'border-ink' : 'border-white'}`}
            style={{ transform: `rotate(${tilt}deg)`, background: `color-mix(in srgb, ${tint} 35%, var(--surface))` }}>
            <div className="flex flex-col gap-3" style={{ transform: `rotate(${-tilt}deg)` }}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-xl font-bold">{p.title}</h3>
                  {p.activity && <span className="text-sm capitalize text-ink-soft">{p.activity}{p.rating ? `, ${p.rating} stars` : ''}</span>}
                </div>
                {p.checked && <span className="inline-flex shrink-0 items-center bg-ok-soft px-2 py-1 text-sm font-semibold text-ok">Checked<Help text="Checked against everyone's budget, distance, opening hours and access needs." /></span>}
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-base">
                <dt className="text-ink-soft">When</dt><dd className="font-bold">{fmtRange(p.start, p.end)}</dd>
                <dt className="text-ink-soft">Where</dt><dd>{where}</dd>
                <dt className="text-ink-soft">Cost</dt><dd className="font-bold">{typeof p.cost_per_person === 'number' ? (p.cost_per_person ? `About $${p.cost_per_person} each` : 'Free') : 'Not sure'}</dd>
              </dl>
              {p.kind !== 'online' && <p className="text-sm">{p.access === 'unconfirmed' ? 'Access not confirmed, call ahead.' : "Checked for everyone's access needs."}</p>}
              {p.distances && Object.keys(p.distances).length > 0 && (
                <div className="flex flex-wrap gap-3" aria-label="Distance for each person">
                  {Object.entries(p.distances).map(([pub, km]) => byPub[pub] && (
                    <span key={pub} className="inline-flex items-center gap-1.5 text-sm"><Avatar name={byPub[pub].name} color={byPub[pub].color} size={24} />{km < 1 ? '<1 km' : `${Math.round(km)} km`}</span>
                  ))}
                </div>
              )}
              {p.why && <Note>{p.why}</Note>}
              <div className="flex flex-wrap items-center gap-3">
                <Chip on={on} onClick={() => toggle(p.id)}>{on ? 'Picked' : 'Pick this'}</Chip>
                {(votes[p.id] ?? []).length > 0 && <AvatarRow size={26} people={(votes[p.id] ?? []).map((x) => byPub[x]).filter(Boolean)} />}
                {isPlanner && <Button variant="text" disabled={busy} onClick={() => run(() => call('/fix', { place_id: p.id }), 'Plan fixed')}>Fix this one</Button>}
              </div>
            </div>
          </article>
        )
      })}
      <Button full disabled={busy || !sel.length} onClick={() => run(() => call('/place-vote', { ids: sel }), 'Your picks are in')}>
        {sel.length ? `Send my ${sel.length === 1 ? 'pick' : '2 picks'}` : 'Pick 1 or 2 places'}
      </Button>
      <Button variant="secondary" disabled={busy} onClick={() => run(() => call('/places'), 'Fresh list')}>Find other places</Button>
    </div>
  )
}

export function PlacesProblem({ problem, onRetry }: { problem: string; onRetry: () => void }) {
  const msg: Record<string, string> = {
    no_time: "Nobody's free dates overlap yet. Ask people to add more dates.",
    no_places: 'Nothing nearby fits these activities. Try another activity or a wider distance.',
    no_location: 'We need at least one starting point. Add yours on the Where page.',
    none_passed: 'Every place broke a rule (budget, distance, opening hours or access), so none are shown.',
  }
  return <ErrorBox message={msg[problem] ?? 'Something got stuck.'} fix="Try again" onFix={onRetry} />
}

export function PlacesWorking({ n }: { n: number }) {
  return <Working lines={[`Finding when all ${n} of you are free...`, 'Searching places for your activities...', "Checking everyone's budget and distance...", "Making sure they're open then...", "Checking everyone's access needs...", 'Almost there...']} />
}
