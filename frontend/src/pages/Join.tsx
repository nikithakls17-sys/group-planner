import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, fmtDay, fmtTime, KIND_LABEL, local, myTz, planName, type Picks, type Plan } from '../api'
import Calendar from '../components/Calendar'
import FreeTimes, { type Slot } from '../components/FreeTimes'
import LocationLine, { type Loc } from '../components/Location'
import Mascot from '../components/Mascot'
import PicksForm, { CAR, DEFAULT_PICKS, summary } from '../components/PicksForm'
import { Step, StepBar } from '../components/Steps'
import { Avatar, AvatarRow, Button, Chip, ChipGroup, ErrorBox, Field, inputCls, Working } from '../components/ui'
import { colorName, MEMBER_COLORS } from '../config'

const STEPS = ['You', 'Free times', 'Picks']

type Draft = { step: number; reached: number; name: string; color: string; loc: Loc | null; days: string[]; slots: Slot[]; picks: Picks; email: string }

export default function Join() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const [plan, setPlan] = useState<Plan | null>(null)
  const [member, setMember] = useState<string | null>(() => local.memberFor(id))
  const key = `np.join.${id}`
  const [d, setD] = useState<Draft>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) || 'null')
      if (saved) return saved
    } catch { /* ignore */ }
    return { step: 0, reached: 0, name: local.name(), color: '', loc: local.city() ? { city: local.city() } : null, days: [], slots: [], picks: local.lastPicks() ?? DEFAULT_PICKS, email: '' }
  })
  const [claim, setClaim] = useState<string | null>(null)
  const [pickColor, setPickColor] = useState(false)
  const [showPicks, setShowPicks] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [declined, setDeclined] = useState(false)
  const [done, setDone] = useState(false)
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }))

  // nothing typed is ever lost, even if you close the tab
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(d)) } catch { /* private mode */ } }, [d, key])

  const load = useCallback(() => api<Plan>(`/plans/${id}`, { member }).then((p) => {
    setPlan(p)
    setD((x) => {
      const me = p.me
      if (!me) return x
      return {
        ...x,
        name: x.name || me.name,
        color: x.color || me.color,
        loc: x.loc ?? (me.city ? { city: me.city } : null),
        slots: x.slots.length ? x.slots : me.availability ?? [],
        picks: me.picks && Object.keys(me.picks).length && !x.picks.best_day ? { ...DEFAULT_PICKS, ...me.picks } : x.picks,
        email: x.email || me.email || '',
      }
    })
  }).catch((e) => setErr(e.message)), [id, member])

  useEffect(() => { load() }, [load])
  // the planner may still be picking days; check back quietly
  useEffect(() => {
    if (!plan || plan.dates.length) return
    const t = window.setInterval(load, 8000)
    return () => window.clearInterval(t)
  }, [plan, load])

  if (err && !plan) return <div className="pt-12"><ErrorBox message={err} fix="Go home" onFix={() => nav('/')} /></div>
  if (!plan) return <Working lines={['Opening the plan...']} />

  const planner = plan.members.find((m) => m.pub === plan.planner)
  const answered = plan.members.filter((m) => m.status === 'answered')
  const claimable = plan.members.filter((m) => !m.is_planner && m.status === 'invited' && !m.has_answers)
  const what = plan.kind === 'other' ? plan.title : `a ${KIND_LABEL[plan.kind].toLowerCase().replace(' / online', '')}`
  const deadline = plan.deadline ? fmtTime(plan.deadline) : null
  const myColor = d.color || plan.me?.color || MEMBER_COLORS[plan.members.length % MEMBER_COLORS.length].hex
  const planDays = (plan.dates.length ? plan.dates : plan.start_day ? [plan.start_day] : []).slice().sort()
  const days = (d.days.length ? d.days.filter((x) => planDays.includes(x)) : planDays).sort()

  const go = (step: number) => set({ step, reached: Math.max(d.reached, step) })
  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setErr('')
    try { await fn() } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  const save = async (fields: Record<string, unknown>, mid = member) => setPlan(await api<Plan>(`/plans/${id}/me`, { method: 'PATCH', body: fields, member: mid }))

  async function ensureMember(): Promise<string> {
    if (member) return member
    const r = await api<{ member_id: string }>(`/plans/${id}/join`, { body: { name: d.name.trim(), claim, tz: myTz() } })
    local.addPlan({ id, member: r.member_id, title: planName(plan!) })
    setMember(r.member_id)
    return r.member_id
  }

  const bar = <StepBar steps={STEPS} at={d.step} reached={d.reached} onJump={go} canJump={(i) => i === 0 || !!member} />

  if (declined) {
    return (
      <Step question="Thanks for letting them know." primary="Done" onPrimary={() => nav('/')} next="If things change, open the link again.">
        <Mascot mood="sleepy" size={140} />
      </Step>
    )
  }
  if (done) {
    return (
      <Step question="That's it." sub={deadline ? `We'll show everyone the options by ${deadline}.` : "We'll show everyone the options soon."}
        primary="See the plan" onPrimary={() => run(async () => { if (d.email.trim()) await save({ email: d.email.trim() }); localStorage.removeItem(key); nav(`/p/${id}`) })}
        next="Same link any time to change your answers.">
        <Mascot mood="wave" size={140} />
        <Field label="Email for reminders (optional)">
          <input className={inputCls} type="email" autoComplete="email" value={d.email} onChange={(e) => set({ email: e.target.value })} />
        </Field>
      </Step>
    )
  }

  switch (d.step) {
    case 0:
      return (
        <Step bar={bar} onBack={plan.me ? () => nav(`/p/${id}`) : undefined} backLabel="Back to the plan"
          question={<>{planner?.name ?? 'A friend'} is planning {what}</>}
          sub="About a minute. No account, no app to install."
          primary={busy ? 'One sec...' : "I'm in"} primaryDisabled={!d.name.trim() || busy}
          onPrimary={() => run(async () => {
            const mid = await ensureMember()
            local.setName(d.name.trim())
            await save({ name: d.name.trim(), color: myColor, tz: myTz(), city: d.loc?.city ?? '', lat: d.loc?.lat, lon: d.loc?.lon }, mid)
            go(1)
          })}
          secondary={!plan.me || plan.me.status !== 'answered' ? (
            <Button variant="text" disabled={!d.name.trim() || busy}
              onClick={() => run(async () => { const mid = await ensureMember(); await save({ status: 'declined', name: d.name.trim() }, mid); setDeclined(true) })}>
              Can't make it this time
            </Button>
          ) : undefined}
          next={deadline ? `Answers close ${deadline}.` : 'Next: when you are free.'}>
          <div className="flex items-center gap-4 border-2 border-ink bg-spot-mustard p-4">
            <Mascot mood="wave" size={84} />
            <div className="flex flex-col gap-1">
              {planDays.length > 0 && <p className="text-base">Some time on <b>{planDays.map(fmtDay).join(', ')}</b></p>}
              {answered.length > 0 && (
                <div className="flex items-center gap-2"><AvatarRow people={answered} size={28} /><span className="text-sm">{answered.length} in so far</span></div>
              )}
            </div>
          </div>
          {!plan.me && claimable.length > 0 && (
            <Field label={`Are you one of these?`}>
              <ChipGroup label="Your name" options={claimable.map((m) => ({ value: m.pub, label: m.name }))} value={claim ?? ''}
                onChange={(v: string) => { const c = v === claim ? null : v; setClaim(c); const m = claimable.find((x) => x.pub === c); if (m) set({ name: m.name, color: m.color }) }} />
            </Field>
          )}
          <Field label="What should we call you?">
            <input className={inputCls} autoComplete="given-name" value={d.name} onChange={(e) => set({ name: e.target.value })} />
          </Field>
          <button type="button" onClick={() => setPickColor(!pickColor)} className="flex min-h-12 items-center gap-3 self-start" aria-expanded={pickColor}>
            <Avatar name={d.name || '?'} color={myColor} size={48} />
            <span className="font-hand text-xl">You're {colorName(myColor)}</span>
            <span className="text-sm text-ink-soft underline">change</span>
          </button>
          {pickColor && (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Pick your color">
              {MEMBER_COLORS.map((c) => (
                <button key={c.hex} type="button" aria-label={c.name} aria-pressed={c.hex === myColor} onClick={() => { set({ color: c.hex }); setPickColor(false) }}
                  className={`p-1 ${c.hex === myColor ? 'outline-2 outline-ink' : ''}`}>
                  <Avatar name={d.name || '?'} color={c.hex} size={40} />
                </button>
              ))}
            </div>
          )}
          <LocationLine value={d.loc} onChange={(loc) => { set({ loc }); if (member) save({ city: loc.city, lat: loc.lat, lon: loc.lon }).catch(() => {}) }} />
          {err && <ErrorBox message={err} />}
        </Step>
      )
    case 1:
      return (
        <Step bar={bar} onBack={() => go(0)} question="When are you free?"
          sub={planDays.length ? `${planner?.name} picked these days. Times are in your time zone.` : undefined}
          primary="Next" primaryDisabled={!d.slots.length || busy}
          onPrimary={() => run(async () => { await save({ availability: d.slots, tz: myTz() }); go(2) })}
          next="Next: a few quick picks, already filled in.">
          {planDays.length === 0 ? (
            <div className="flex flex-col items-center gap-3 border-2 border-dashed border-ink-soft p-6 text-center">
              <Mascot mood="sleepy" size={100} />
              <p className="font-hand text-lg">{planner?.name} is still picking the days. This page checks by itself; you can also come back later with the same link.</p>
            </div>
          ) : (
            <>
              <Calendar selected={days} allowed={(x) => planDays.includes(x)} label="Days you could do"
                onToggle={(x) => set({ days: days.includes(x) ? days.filter((y) => y !== x) : [...days, x] })} />
              <p className="text-sm text-ink-soft">Untap a day you can't do at all.</p>
              <div className="flex flex-col gap-3 border-2 border-ink bg-spot-sky p-4">
                <FreeTimes key={days.join()} planId={id} member={member} days={days} slots={d.slots} onChange={(slots) => set({ slots })} />
              </div>
            </>
          )}
          {err && <ErrorBox message={err} />}
        </Step>
      )
    default: {
      const plannerSet = plan.decide === 'planner' && !showPicks
      return (
        <Step bar={bar} onBack={() => go(1)} question={plannerSet ? 'Anything we should know?' : 'Quick picks'}
          sub={plannerSet ? undefined : 'Filled in from last time. Most people just tap Done.'}
          primary={busy ? 'Saving...' : 'Done'} primaryDisabled={busy}
          onPrimary={() => run(async () => { local.setLastPicks(d.picks); await save({ picks: d.picks, status: 'answered' }); setDone(true) })}
          next="That's all we need.">
          {days.length > 1 && (
            <Field label="Which day suits you best? (optional)">
              <div className="flex flex-wrap gap-2">
                {days.map((x) => <Chip key={x} on={d.picks.best_day === x} onClick={() => set({ picks: { ...d.picks, best_day: d.picks.best_day === x ? undefined : x } })}>{fmtDay(x)}</Chip>)}
              </div>
            </Field>
          )}
          {plannerSet ? (
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-2 border-2 border-ink bg-spot-green p-4">
                <p className="text-base">{planner?.name}'s thinking: <b>{summary(plan.details ?? {})}</b>.</p>
                <Button variant="text" className="self-start" onClick={() => setShowPicks(true)}>Suggest something else</Button>
              </div>
              <Field label="Do you have a car?">
                <ChipGroup label="Car" options={CAR} value={d.picks.car ?? 'yes'} onChange={(v: string) => set({ picks: { ...d.picks, car: v } })} />
              </Field>
              <Field label="Anything we should know? (optional)" hint="Vegetarian, no alcohol, bringing a kid, accessibility needs">
                <input className={inputCls} value={d.picks.notes ?? ''} onChange={(e) => set({ picks: { ...d.picks, notes: e.target.value } })} />
              </Field>
            </div>
          ) : (
            <PicksForm member value={d.picks} onChange={(picks) => set({ picks })} />
          )}
          {err && <ErrorBox message={err} />}
        </Step>
      )
    }
  }
}
