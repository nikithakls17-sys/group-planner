import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, daysBetween, fmtClock, fmtDay, fmtTime, KIND_LABEL, local, myTz, parseDay, planName, type Picks, type Plan } from '../api'
import PicksForm, { CAR, DEFAULT_PICKS, summary } from '../components/PicksForm'
import { Avatar, AvatarRow, Button, Card, ChipGroup, ErrorBox, Field, inputCls, Screen, Tile, Working } from '../components/ui'
import { colorName, MEMBER_COLORS } from '../config'

const BLOCKS = [
  { key: 'morning', label: 'Morning', from: 9, to: 12 },
  { key: 'afternoon', label: 'Afternoon', from: 12, to: 17 },
  { key: 'evening', label: 'Evening', from: 17, to: 21 },
  { key: 'late', label: 'Late', from: 21, to: 23 },
]

function gridToSlots(cells: string[]) {
  return cells.map((c) => {
    const [day, key] = c.split('|')
    const b = BLOCKS.find((x) => x.key === key)!
    const d = parseDay(day)
    const s = new Date(d.getFullYear(), d.getMonth(), d.getDate(), b.from)
    const e = new Date(d.getFullYear(), d.getMonth(), d.getDate(), b.to)
    return { start: s.toISOString(), end: e.toISOString() }
  })
}

type Step = 'invite' | 'decline' | 'declined' | 'name' | 'city' | 'when' | 'picks' | 'done'

export default function Join() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const [plan, setPlan] = useState<Plan | null>(null)
  const [member, setMember] = useState<string | null>(() => local.memberFor(id))
  const [step, setStep] = useState<Step>(member ? 'when' : 'invite')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const [name, setName] = useState(local.name())
  const [claim, setClaim] = useState<string | null>(null)
  const [color, setColor] = useState('')
  const [pickColor, setPickColor] = useState(false)
  const [city, setCity] = useState(local.city())
  const [method, setMethod] = useState<'type' | 'tap' | null>(null)
  const [text, setText] = useState('')
  const [slots, setSlots] = useState<{ start: string; end: string }[]>([])
  const [cells, setCells] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(`np.grid.${id}`) || '[]') } catch { return [] }
  })
  const [standing, setStanding] = useState(local.standing())
  const [picks, setPicks] = useState<Picks>(local.lastPicks() ?? DEFAULT_PICKS)
  const [showPicks, setShowPicks] = useState(false)
  const [email, setEmail] = useState('')
  const [reading, setReading] = useState(false)

  useEffect(() => {
    api<Plan>(`/plans/${id}`, { member }).then((p) => {
      setPlan(p)
      if (p.me) {
        setName(p.me.name)
        setColor(p.me.color)
        if (p.me.city) setCity(p.me.city)
        if (p.me.availability?.length) setSlots(p.me.availability)
        if (p.me.avail_text) setText(p.me.avail_text)
        if (p.me.picks && Object.keys(p.me.picks).length) setPicks({ ...DEFAULT_PICKS, ...p.me.picks })
        if (p.me.email) setEmail(p.me.email)
        // Someone coming back to edit: start at the top of their answers; a new planner starts at "where are you"
        setStep(p.me.city ? (p.me.status === 'answered' ? 'name' : 'when') : 'city')
      }
    }).catch((e) => setErr(e.message))
  }, [id, member])

  useEffect(() => {
    try { localStorage.setItem(`np.grid.${id}`, JSON.stringify(cells)) } catch { /* private mode */ }
  }, [cells, id])

  const days = useMemo(() => (plan ? daysBetween(plan.start_day, plan.end_day, 14) : []), [plan])

  if (err && !plan) return <div className="pt-12"><ErrorBox message={err} fix="Go home" onFix={() => nav('/')} /></div>
  if (!plan) return <Working lines={['Opening the plan...']} />

  const planner = plan.members.find((m) => m.pub === plan.planner)
  const answered = plan.members.filter((m) => m.status === 'answered')
  const claimable = plan.members.filter((m) => !m.is_planner && m.status === 'invited' && !m.has_answers)
  const what = plan.kind === 'other' ? plan.title : `a ${KIND_LABEL[plan.kind].toLowerCase().replace(' / online', '')}`
  const deadline = plan.deadline ? fmtTime(plan.deadline) : 'soon'
  const myColor = color || plan.me?.color || MEMBER_COLORS[plan.members.length % MEMBER_COLORS.length].hex

  async function save(fields: Record<string, unknown>, mid = member) {
    const p = await api<Plan>(`/plans/${id}/me`, { method: 'PATCH', body: fields, member: mid })
    setPlan(p)
    return p
  }

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setErr('')
    try { await fn() } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  async function ensureMember(): Promise<string> {
    if (member) return member
    const r = await api<{ member_id: string }>(`/plans/${id}/join`, { body: { name: name.trim(), claim, tz: myTz() } })
    local.addPlan({ id, member: r.member_id, title: planName(plan!) })
    setMember(r.member_id)
    return r.member_id
  }

  switch (step) {
    case 'invite':
      return (
        <Screen back={false} question={<>{planner?.name ?? 'A friend'} is planning {what}.</>} sub="It takes about a minute. No account, no app to install."
          primary="I'm in" onPrimary={() => setStep('name')}
          secondary={<Button variant="secondary" full onClick={() => setStep('decline')}>Can't make it this time</Button>}
          next={`Answers close ${deadline}.`}>
          <Card className="flex flex-col gap-3">
            <p className="text-base">Between <b>{fmtDay(plan.start_day)}</b> and <b>{fmtDay(plan.end_day)}</b></p>
            {answered.length > 0 && (
              <div className="flex items-center gap-3">
                <AvatarRow people={answered} />
                <span className="text-sm text-ink-soft">{answered.length} already answered</span>
              </div>
            )}
          </Card>
        </Screen>
      )
    case 'decline':
      return (
        <Screen question="No problem. What's your name?" sub={`So ${planner?.name ?? 'the planner'} knows.`} onBack={() => setStep('invite')}
          primary="Let them know" primaryDisabled={!name.trim() || busy}
          onPrimary={() => run(async () => { const mid = await ensureMember(); await save({ status: 'declined' }, mid); setStep('declined') })}
          next="You won't get any more messages about this plan.">
          <input className={inputCls} aria-label="Your name" value={name} onChange={(e) => setName(e.target.value)} />
          {err && <ErrorBox message={err} />}
        </Screen>
      )
    case 'declined':
      return (
        <Screen back={false} question="Thanks for letting them know." primary="Done" onPrimary={() => nav('/')} next="If things change, open the link again." />
      )
    case 'name':
      return (
        <Screen question="What should we call you?" onBack={() => (plan.me ? nav(`/p/${id}`) : setStep('invite'))} step="1 of 4"
          primary="Next" primaryDisabled={!name.trim() || busy}
          onPrimary={() => run(async () => {
            const mid = await ensureMember()
            local.setName(name.trim())
            await save({ name: name.trim(), color: myColor, tz: myTz() }, mid)
            setStep('city')
          })}
          next="Next: where you are, so nobody has to travel too far.">
          {!plan.me && claimable.length > 0 && (
            <Field label={`${planner?.name ?? 'The planner'} added these names. Are you one of them?`}>
              <ChipGroup label="Your name" options={claimable.map((m) => ({ value: m.pub, label: m.name }))} value={claim ?? ''}
                onChange={(v: string) => { setClaim(v === claim ? null : v); const m = claimable.find((x) => x.pub === v); if (m) { setName(m.name); setColor(m.color) } }} />
            </Field>
          )}
          <input className={inputCls} aria-label="Your name" autoComplete="given-name" value={name} onChange={(e) => setName(e.target.value)} />
          <button type="button" onClick={() => setPickColor(!pickColor)} className="flex min-h-12 items-center gap-3 self-start rounded-[var(--radius-card)] pr-4">
            <Avatar name={name || '?'} color={myColor} size={48} />
            <span className="font-hand text-xl">You're {colorName(myColor)}</span>
            <span className="text-sm text-ink-soft">Tap to change</span>
          </button>
          {pickColor && (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Pick your color">
              {MEMBER_COLORS.map((c) => (
                <button key={c.hex} type="button" aria-label={c.name} aria-pressed={c.hex === myColor} onClick={() => { setColor(c.hex); setPickColor(false) }}
                  className={`rounded-full p-1 ${c.hex === myColor ? 'ring-2 ring-accent' : ''}`}>
                  <Avatar name={name || '?'} color={c.hex} size={40} />
                </button>
              ))}
            </div>
          )}
          {err && <ErrorBox message={err} />}
        </Screen>
      )
    case 'city':
      return (
        <Screen question="Where are you?" sub="Just your city or neighbourhood. Never your address." onBack={() => setStep('name')} step="2 of 4"
          primary="Next" primaryDisabled={!city.trim() || busy}
          onPrimary={() => run(async () => { local.setCity(city.trim()); await save({ city: city.trim(), tz: myTz() }); setStep('when') })}
          next={`Your time zone: ${myTz().replace('_', ' ')}. Next: when you're free.`}>
          <input className={inputCls} aria-label="City or neighbourhood" autoComplete="address-level2" placeholder="e.g. Bengaluru, India" value={city} onChange={(e) => setCity(e.target.value)} />
          {err && <ErrorBox message={err} />}
        </Screen>
      )
    case 'when': {
      const gridSlots = gridToSlots(cells)
      const finalSlots = method === 'tap' ? gridSlots : slots
      return (
        <Screen question="When are you free?" sub={`Between ${fmtDay(plan.start_day)} and ${fmtDay(plan.end_day)}. Times are in your time zone.`}
          onBack={() => (method ? setMethod(null) : setStep('city'))} step="3 of 4"
          primary={method ? 'Next' : undefined} primaryDisabled={!finalSlots.length || busy}
          onPrimary={() => run(async () => {
            local.setStanding(standing)
            await save({ availability: finalSlots, avail_text: method === 'type' ? text : '', standing })
            setStep('picks')
          })}
          next={method ? 'Next: a few quick picks.' : 'Pick whichever is quickest for you.'}>
          {!method && (
            <div className="flex flex-col gap-3">
              <Tile title="Type it" sub='Like "free after 6 on weekdays, all Saturday"' onClick={() => setMethod('type')} />
              <Tile title="Tap times" sub="Tap the parts of each day you're free" onClick={() => setMethod('tap')} />
              {slots.length > 0 && <Tile title="Keep my answer" sub={`${slots.length} time slots saved`} onClick={() => setMethod('type')} />}
            </div>
          )}
          {method === 'type' && (
            <div className="flex flex-col gap-4">
              <Field label="When are you free?">
                <textarea className={`${inputCls} min-h-24 py-3`} value={text} placeholder="Free after 6 on weekdays, all Saturday, Sunday morning" onChange={(e) => setText(e.target.value)} />
              </Field>
              <Button variant="secondary" disabled={!text.trim() || reading}
                onClick={() => run(async () => {
                  setReading(true)
                  try {
                    const r = await api<{ slots: { start: string; end: string }[] }>(`/plans/${id}/parse-availability`, { body: { text, tz: myTz() }, member })
                    setSlots(r.slots)
                    if (!r.slots.length) setErr("We couldn't find any times in that. Try something like 'Saturday after 2'.")
                  } finally { setReading(false) }
                })}>
                {reading ? 'Reading...' : slots.length ? 'Read it again' : 'Read it'}
              </Button>
              {slots.length > 0 && (
                <Field label="Is this right? Tap a time to remove it.">
                  <div className="flex flex-wrap gap-2">
                    {slots.map((s, i) => (
                      <button key={i} type="button" className="min-h-12 rounded-full border-2 border-accent bg-accent-soft px-4 text-base"
                        aria-label={`Remove ${fmtTime(s.start)}`} onClick={() => setSlots(slots.filter((_, j) => j !== i))}>
                        {fmtTime(s.start)} to {fmtClock(s.end)}
                      </button>
                    ))}
                  </div>
                </Field>
              )}
              <Button variant="text" onClick={() => setMethod('tap')}>Tap times instead</Button>
            </div>
          )}
          {method === 'tap' && (
            <div className="overflow-x-auto">
              <table className="w-full border-separate border-spacing-1">
                <thead>
                  <tr>
                    <th className="sr-only">Day</th>
                    {BLOCKS.map((b) => <th key={b.key} className="text-sm font-semibold text-ink-soft">{b.label}<span className="block font-normal">{b.from > 12 ? b.from - 12 : b.from}-{b.to > 12 ? b.to - 12 : b.to}</span></th>)}
                  </tr>
                </thead>
                <tbody>
                  {days.map((day) => (
                    <tr key={day}>
                      <th scope="row" className="whitespace-nowrap pr-2 text-left text-sm font-semibold">{fmtDay(day)}</th>
                      {BLOCKS.map((b) => {
                        const k = `${day}|${b.key}`
                        const on = cells.includes(k)
                        return (
                          <td key={b.key}>
                            <button type="button" aria-pressed={on} aria-label={`${fmtDay(day)} ${b.label}`}
                              onClick={() => setCells(on ? cells.filter((c) => c !== k) : [...cells, k])}
                              className={`h-12 w-full min-w-12 rounded-xl border-2 ${on ? 'border-accent bg-accent' : 'border-line bg-surface'}`} />
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <Button variant="text" onClick={() => setMethod('type')}>Type it instead</Button>
            </div>
          )}
          {method && (
            <Field label="I'm usually free... (optional)" hint="Saved for future plans and the I'm bored button.">
              <input className={inputCls} value={standing} placeholder="Weekday evenings, Sunday afternoons" onChange={(e) => setStanding(e.target.value)} />
            </Field>
          )}
          {err && <ErrorBox message={err} />}
        </Screen>
      )
    }
    case 'picks': {
      const plannerSet = plan.decide === 'planner' && !showPicks
      return (
        <Screen question={plannerSet ? 'Anything we should know?' : 'Quick picks'} sub={plannerSet ? undefined : 'Most people just tap Next.'}
          onBack={() => setStep('when')} step="4 of 4" primary="Done" primaryDisabled={busy}
          onPrimary={() => run(async () => {
            local.setLastPicks(picks)
            await save({ picks, status: 'answered' })
            setStep('done')
          })}
          next="That's all we need.">
          {plannerSet ? (
            <div className="flex flex-col gap-6">
              <Card className="flex flex-col gap-3">
                <p className="text-base">{planner?.name}'s thinking: <b>{summary(plan.details ?? {})}</b>.</p>
                <Button variant="text" className="self-start" onClick={() => setShowPicks(true)}>Suggest something else</Button>
              </Card>
              <Field label="Do you have a car?">
                <ChipGroup label="Car" options={CAR} value={picks.car ?? 'yes'} onChange={(v: string) => setPicks({ ...picks, car: v })} />
              </Field>
              <Field label="Anything we should know? (optional)" hint="Vegetarian, no alcohol, bringing a kid, accessibility needs">
                <input className={inputCls} value={picks.notes ?? ''} onChange={(e) => setPicks({ ...picks, notes: e.target.value })} />
              </Field>
            </div>
          ) : (
            <PicksForm member value={picks} onChange={setPicks} />
          )}
          {err && <ErrorBox message={err} />}
        </Screen>
      )
    }
    case 'done':
      return (
        <Screen back={false} question={<span className="font-hand text-2xl">That's it.</span>} sub={`We'll show everyone the options by ${deadline}.`}
          primary="See the plan" onPrimary={() => run(async () => { if (email.trim()) await save({ email: email.trim() }); nav(`/p/${id}`) })}
          next="You can come back with the same link any time to change your answers.">
          <Field label="Email for reminders (optional)">
            <input className={inputCls} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <p className="text-sm text-ink-soft">Tip: add this page to your home screen from your browser's share menu to find it again.</p>
          {err && <ErrorBox message={err} />}
        </Screen>
      )
  }
}

