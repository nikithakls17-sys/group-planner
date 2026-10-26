import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { addDays, api, fmtClock, fmtDay, fmtRange, fmtTime, KIND_LABEL, local, myTz, names, parseDay, planName, ymd, type Member, type Option, type Plan } from '../api'
import Book, { type BookTab } from '../components/Book'
import Calendar from '../components/Calendar'
import { useCalendarStatus } from '../components/FreeTimes'
import MiniMap from '../components/MiniMap'
import LocationLine, { type Loc } from '../components/Location'
import { summary } from '../components/PicksForm'
import Share from '../components/Share'
import TaskBoard from '../components/TaskBoard'
import { Avatar, AvatarRow, Button, Chip, ChipGroup, ErrorBox, Field, Help, inputCls, Note, PageHeading, Progress, SubHeading, Tile, useToast, Working } from '../components/ui'
import { PASTELS, PLAN_TABS, type PlanTab } from '../config'
import { ActivityPage, BudgetPage, PlacePicker, PlacesProblem, PlacesWorking, WherePage } from './FlowPages'
import GoPage from './GoPage'
import MoneyPage from './MoneyPage'
import { APP_TABS } from '../config'

const KINDS = { in_person: ['hangout', 'meal', 'date', 'trip', 'other'], online: ['call', 'games', 'watch', 'other'] }
const KIND_SUB: Record<string, string> = {
  hangout: 'Coffee, a walk, whatever', meal: 'Lunch, dinner, brunch', date: 'Just the two of you',
  call: 'Video or voice, just talk', games: 'Online games together', watch: 'A show or film, in sync',
  trip: 'A day out or a weekend away', other: 'Tell us what',
}
const TIMES = [
  { value: 'morning', label: 'Morning', from: 9, to: 12 },
  { value: 'afternoon', label: 'Afternoon', from: 12, to: 17 },
  { value: 'evening', label: 'Evening', from: 17, to: 22 },
]

/** Free dates + optional time preferences -> slots. Skipped times = any reasonable time that day (8 AM-11 PM). */
function toSlots(dates: string[], times: string[]) {
  const blocks = times.length && !times.includes('any') ? TIMES.filter((t) => times.includes(t.value)) : [{ from: 8, to: 23 }]
  return dates.flatMap((day) => {
    const d = parseDay(day)
    return blocks.map((b) => ({
      start: new Date(d.getFullYear(), d.getMonth(), d.getDate(), b.from).toISOString(),
      end: new Date(d.getFullYear(), d.getMonth(), d.getDate(), b.to).toISOString(),
    }))
  })
}

function fromSlots(slots: { start: string; end: string }[]) {
  const dates = [...new Set(slots.map((s) => ymd(new Date(s.start))))].sort()
  const hours = new Set(slots.map((s) => `${new Date(s.start).getHours()}-${new Date(s.end).getHours()}`))
  const times = TIMES.filter((t) => hours.has(`${t.from}-${t.to}`)).map((t) => t.value)
  return { dates, times }
}

function defaultDeadline(firstDay: string) {
  const soonest = new Date(Date.now() + 3 * 3600_000)
  const latest = new Date(Date.now() + 3 * 86400_000)
  let d = addDays(parseDay(firstDay), -1)
  d.setHours(18, 0, 0, 0)
  if (d < soonest) d = soonest
  if (d > latest) d = latest
  d.setMinutes(0, 0, 0)
  return d.toISOString()
}

export default function PlanBook() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const [plan, setPlan] = useState<Plan | null>(null)
  const [member, setMember] = useState<string | null>(() => (id ? local.memberFor(id) : null))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const autoGen = useRef(false)

  const raw = params.get('tab')
  const tab = ((raw === 'plans' ? 'places' : raw) as PlanTab) || (id ? (member ? 'places' : 'who') : 'what')
  const setTab = useCallback((t: string) => setParams((p) => { p.set('tab', t); return p }, { replace: false }), [setParams])
  useEffect(() => setErr(''), [tab]) // an old error doesn't follow you to other pages

  const load = useCallback(async () => {
    if (!id) return
    try { setPlan(await api<Plan>(`/plans/${id}`, { member })) } catch (e) { setErr((e as Error).message) }
  }, [id, member])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (!id) return
    const t = window.setInterval(() => { if (!document.hidden) load() }, 8000)
    return () => window.clearInterval(t)
  }, [id, load])

  const run = useCallback(async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true)
    setErr('')
    try { await fn(); if (ok) toast(ok) } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }, [toast])
  const call = useCallback(async (path: string, body?: unknown, method?: string) => {
    const p = await api<Plan>(`/plans/${id}${path}`, { body: body ?? {}, member, method })
    setPlan(p)
    return p
  }, [id, member])

  // When the answers are in, the app plans by itself
  useEffect(() => {
    if (plan && member && plan.status === 'answers' && plan.answers_ready && !plan.generating && !autoGen.current && !plan.problem) {
      autoGen.current = true
      run(() => call('/places'))
    }
  }, [plan, member, run, call])

  const me = plan?.me ?? null
  const isPlanner = !id || !!plan?.is_planner
  const locked = plan?.status === 'locked' || plan?.status === 'confirmed'
  const AFTER = ['wear', 'rides', 'map', 'money']
  const tabs: BookTab[] = PLAN_TABS
    .filter((t) => (AFTER.includes(t.key) ? locked : true))
    .filter((t) => !(plan?.mode === 'online' && (t.key === 'rides' || t.key === 'map')))
    .map((t) => ({ key: t.key, label: t.key === 'dates' ? 'Dates' : t.label, color: t.color, disabled: !id ? t.key !== 'what' : !me && t.key !== 'who' && t.key !== 'what' }))
  const tabColor = (PLAN_TABS.find((t) => t.key === tab) ?? PLAN_TABS[0]).color.deep
  const order = tabs.filter((t) => !t.disabled).map((t) => t.key)
  const nextTab = order[order.indexOf(tab) + 1]
  const prevTab = order[order.indexOf(tab) - 1]

  // swipe between pages on phones
  const touch = useRef<{ x: number; y: number } | null>(null)
  const onTouchStart = (e: React.TouchEvent) => {
    if ((e.target as HTMLElement).closest('[data-noswipe], input, textarea, select')) return
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = touch.current
    touch.current = null
    if (!s) return
    const dx = e.changedTouches[0].clientX - s.x
    if (Math.abs(dx) < 70 || Math.abs(e.changedTouches[0].clientY - s.y) > 50) return
    if (dx < 0 && nextTab) setTab(nextTab)
    if (dx > 0 && prevTab) setTab(prevTab)
  }

  if (err && id && !plan) return <div className="mx-auto max-w-md p-6"><ErrorBox message={err} fix="Go home" onFix={() => nav('/')} /></div>
  if (id && !plan) return <div className="paper mx-auto mt-10 max-w-md p-6"><Working lines={['Opening the book...']} /></div>

  const nav2 = (
    <div className="flex items-center justify-between gap-3 border-t-2 border-rule pt-4">
      {prevTab ? <Button variant="secondary" onClick={() => setTab(prevTab)}>Back</Button> : <Button variant="secondary" onClick={() => nav('/')}>Home</Button>}
      {nextTab && <Button onClick={() => setTab(nextTab)}>Next: {tabs.find((t) => t.key === nextTab)?.label}</Button>}
    </div>
  )

  const pageProps = { plan, me, member, isPlanner, busy, run, call, setTab, color: tabColor, setPlan, setMember }
  let left: React.ReactNode
  switch (tab) {
    case 'who': left = <WhoPage {...pageProps} />; break
    case 'dates': left = <DatesPage {...pageProps} />; break
    case 'budget': left = <BudgetPage {...pageProps} />; break
    case 'activity': left = <ActivityPage {...pageProps} />; break
    case 'where': left = <WherePage {...pageProps} />; break
    case 'places': left = <PlansPage {...pageProps} />; break
    case 'tasks': left = <TasksPage {...pageProps} />; break
    case 'wear': case 'rides': case 'map':
      left = plan ? <GoPage plan={plan} member={member} call={call} run={run} busy={busy} color={tabColor} section={tab} /> : null; break
    case 'money': left = plan ? <MoneyPage plan={plan} member={member} call={call} run={run} busy={busy} color={tabColor} /> : null; break
    default: left = <WhatPage {...pageProps} />
  }

  return (
    <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <Book
        tabs={tabs}
        active={tab}
        onTab={setTab}
        menu={APP_TABS}
        onMenu={(k) => nav(k)}
        headLeft={<button type="button" onClick={() => nav('/')} className="underline underline-offset-4">Nobody Plans</button>}
        headRight={plan ? planName(plan) : 'New plan'}
        left={<>{left}{err && <ErrorBox message={err} />}{nav2}</>}
        right={<Summary plan={plan} />}
      />
    </div>
  )
}

type PageProps = {
  plan: Plan | null
  me: Member | null
  member: string | null
  isPlanner: boolean
  busy: boolean
  run: (fn: () => Promise<unknown>, ok?: string) => Promise<void>
  call: (path: string, body?: unknown, method?: string) => Promise<Plan>
  setTab: (t: string) => void
  color: string
  setPlan: (p: Plan) => void
  setMember: (m: string) => void
}

/* ---------------- What ---------------- */

function WhatPage({ plan, isPlanner, busy, run, call, setTab, color }: PageProps) {
  const nav = useNavigate()
  const [name, setName] = useState(local.name())
  const [mode, setMode] = useState<'in_person' | 'online'>(plan?.mode ?? (plan && ['call', 'games', 'watch'].includes(plan.kind) ? 'online' : 'in_person'))
  const [kind, setKind] = useState(plan?.kind ?? (mode === 'online' ? 'call' : 'hangout'))
  const [other, setOther] = useState(plan?.kind_other ?? '')
  const planner = plan?.members.find((m) => m.pub === plan.planner)

  async function choose(k: string) {
    setKind(k)
    if (k === 'other' && !other.trim()) return
    if (!plan) {
      if (!name.trim()) return
      local.setName(name.trim())
      const res = await api<{ plan_id: string; member_id: string }>('/plans', {
        body: { draft: true, tz: myTz(), planner: { name: name.trim() }, kind: k, kind_other: k === 'other' ? other : '', save_group_as: `${name.trim()}'s group` },
      })
      await api(`/plans/${res.plan_id}`, { method: 'PATCH', member: res.member_id, body: { mode } })
      local.addPlan({ id: res.plan_id, member: res.member_id, title: KIND_LABEL[k] })
      const p = await api<Plan>(`/plans/${res.plan_id}`, { member: res.member_id })
      if (p.group_id) local.addGroup({ id: p.group_id, name: `${name.trim()}'s group` })
      if (local.city()) await api(`/plans/${res.plan_id}/me`, { method: 'PATCH', member: res.member_id, body: { city: local.city(), tz: myTz() } })
      nav(`/p/${res.plan_id}?tab=who`, { replace: true })
      window.location.reload()
      return
    }
    await call('', { kind: k, kind_other: k === 'other' ? other : '', mode }, 'PATCH')
    setTab('who')
  }

  // online and in person have different kinds of plan; switching keeps "something else", otherwise picks the first
  function switchMode(m: 'in_person' | 'online') {
    if (m === mode) return
    const k = KINDS[m].includes(kind) ? kind : KINDS[m][0]
    setMode(m)
    setKind(k)
    if (plan) run(() => call('', { mode: m, kind: k, kind_other: k === 'other' ? other : '' }, 'PATCH'))
  }

  if (plan && !isPlanner) {
    return (
      <>
        <PageHeading color={color}>What</PageHeading>
        <p className="text-lg"><b>{planner?.name}</b> is planning <b>{planName(plan).toLowerCase()}</b>.</p>
      </>
    )
  }
  return (
    <>
      <PageHeading color={color} sub="In person or online, then tap what it is.">What are we planning?</PageHeading>
      <div className="grid grid-cols-2 border-2 border-ink" role="radiogroup" aria-label="In person or online">
        {(['in_person', 'online'] as const).map((m) => (
          <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => switchMode(m)}
            className={`min-h-14 text-base font-bold ${mode === m ? 'bg-ink text-bg' : 'bg-surface'}`}>
            {m === 'in_person' ? 'Meet in person' : 'Online'}
          </button>
        ))}
      </div>
      {!plan && (
        <Field label="Your name">
          <input className={inputCls} value={name} autoComplete="given-name" onChange={(e) => setName(e.target.value)} />
        </Field>
      )}
      <div className="grid grid-cols-2 gap-3">
        {KINDS[mode].map((k, i) => (
          <Tile key={k} title={KIND_LABEL[k]} sub={KIND_SUB[k]} on={kind === k} tint={PASTELS[i].hex} disabled={busy || (!plan && !name.trim())}
            onClick={() => run(() => choose(k))} />
        ))}
      </div>
      {kind === 'other' && (
        <div className="flex gap-2">
          <input className={inputCls} aria-label="What is it?" placeholder="Movie night, birthday, study session" value={other} onChange={(e) => setOther(e.target.value)} />
          <Button disabled={!other.trim() || busy} onClick={() => run(() => choose('other'))}>Save</Button>
        </div>
      )}
      {!plan && !name.trim() && <Note>Type your name first, then tap.</Note>}
    </>
  )
}

/* ---------------- Who ---------------- */

function WhoPage({ plan, me, member, isPlanner, busy, run, call, color, setMember, setTab }: PageProps) {
  const [name, setName] = useState(me?.name ?? local.name())
  const [claim, setClaim] = useState<string | null>(null)
  const [pick, setPick] = useState(me?.color ?? '')
  const [loc, setLoc] = useState<Loc | null>(me?.city ? { city: me.city } : local.city() ? { city: local.city() } : null)
  const [add, setAdd] = useState('')
  if (!plan) return null
  const planner = plan.members.find((m) => m.pub === plan.planner)
  const claimable = plan.members.filter((m) => !m.is_planner && m.status === 'invited' && !m.has_answers)
  const color0 = pick || me?.color || PASTELS[plan.members.length % PASTELS.length].hex

  async function join(decline = false) {
    const r = await api<{ member_id: string }>(`/plans/${plan!.id}/join`, { body: { name: name.trim(), claim, tz: myTz() } })
    local.addPlan({ id: plan!.id, member: r.member_id, title: planName(plan!) })
    local.setName(name.trim())
    await api(`/plans/${plan!.id}/me`, { method: 'PATCH', member: r.member_id, body: decline ? { status: 'declined' } : { color: color0, tz: myTz(), city: loc?.city ?? '', lat: loc?.lat, lon: loc?.lon } })
    setMember(r.member_id)
    if (!decline) setTab('dates')
  }

  return (
    <>
      <PageHeading color={color}>Who</PageHeading>
      {!me && (
        <div className="flex flex-col gap-4 border-2 border-ink bg-surface p-4">
          <SubHeading>{planner?.name} is planning {planName(plan).toLowerCase()}. Join in?</SubHeading>
          <p className="text-sm text-ink-soft">About a minute. No account, no app to install.</p>
          {claimable.length > 0 && (
            <Field label="Are you one of these?">
              <ChipGroup label="Your name" options={claimable.map((m) => ({ value: m.pub, label: m.name }))} value={claim ?? ''}
                onChange={(v: string) => { const c = v === claim ? null : v; setClaim(c); const m = claimable.find((x) => x.pub === c); if (m) { setName(m.name); setPick(m.color) } }} />
            </Field>
          )}
          <Field label="Your name"><input className={inputCls} value={name} autoComplete="given-name" onChange={(e) => setName(e.target.value)} /></Field>
          <ColorPicker value={color0} name={name} onChange={setPick} />
          <LocationLine value={loc} onChange={setLoc} />
          <Button disabled={!name.trim() || busy} onClick={() => run(() => join())}>I'm in</Button>
          <Button variant="text" disabled={!name.trim() || busy} onClick={() => run(() => join(true), 'Thanks for letting them know')}>Can't make it this time</Button>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <SubHeading>Group link</SubHeading>
        <Share id={plan.id} message={`${planner?.name ?? 'A friend'} is planning ${planName(plan).toLowerCase()}. Open this link to plan with me:`} />
      </div>

      <div className="flex flex-col gap-2">
        <SubHeading>In the group</SubHeading>
        <ul className="flex flex-col">
          {plan.members.map((m) => (
            <li key={m.pub} className="flex min-h-12 items-center gap-3 border-b border-rule py-1">
              <Avatar name={m.name} color={m.color} dim={m.status === 'declined'} />
              <span className="flex-1">{m.name}{m.is_planner ? ' (planner)' : ''}{m.pub === me?.pub ? ' (you)' : ''}</span>
              <span className="text-sm text-ink-soft">{m.status === 'answered' ? 'Answered' : m.status === 'declined' ? "Can't make it" : 'Not yet'}</span>
              {isPlanner && !m.is_planner && (
                <Button variant="text" aria-label={`Remove ${m.name}`} disabled={busy} onClick={() => run(() => call(`/people/${m.pub}`, undefined, 'DELETE'))}>Remove</Button>
              )}
            </li>
          ))}
        </ul>
        {isPlanner && (
          <div className="flex gap-2">
            <input className={inputCls} placeholder="Add a name" aria-label="Add a name" value={add} onChange={(e) => setAdd(e.target.value)} />
            <Button variant="secondary" disabled={!add.trim() || busy} onClick={() => run(async () => { await call('/people', [{ name: add.trim() }]); setAdd('') })}>Add</Button>
          </div>
        )}
      </div>

      {me && (
        <div className="flex flex-col gap-3">
          <SubHeading>You</SubHeading>
          <ColorPicker value={me.color} name={me.name} onChange={(c) => run(() => call('/me', { color: c }, 'PATCH'))} />
          <LocationLine value={me.city ? { city: me.city } : null} onChange={(l) => run(() => call('/me', { city: l.city, lat: l.lat, lon: l.lon }, 'PATCH'))} />
        </div>
      )}
      {member && null}
    </>
  )
}

export function ColorPicker({ value, name, onChange }: { value: string; name: string; onChange: (hex: string) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-base font-semibold">Your color</span>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Your color">
        {PASTELS.map((c) => (
          <button key={c.hex} type="button" role="radio" aria-checked={value === c.hex} aria-label={c.name} onClick={() => onChange(c.hex)}
            className={`p-0.5 ${value === c.hex ? 'outline-3 outline-ink' : ''}`}>
            <Avatar name={name || '?'} color={c.hex} size={36} />
          </button>
        ))}
      </div>
    </div>
  )
}

/* ---------------- Dates: When are you free? ---------------- */

function DatesPage({ plan, me, isPlanner, busy, run, call, color, setTab }: PageProps) {
  const initial = fromSlots(me?.availability ?? [])
  const [dates, setDates] = useState<string[]>(initial.dates)
  const [times, setTimes] = useState<string[]>(initial.times)
  const [askTimes, setAskTimes] = useState(false)
  const calendar = useCalendarStatus()
  const [params, setParams] = useSearchParams()
  const calFailed = params.get('cal') === 'fail'
  // free times found from Google Calendar or from typing, checked here before saving
  const [found, setFound] = useState<{ start: string; end: string }[] | null>(me?.cal_slots?.length ? me.cal_slots : null)
  const [foundFrom, setFoundFrom] = useState<'google' | 'type'>('google')
  const [typing, setTyping] = useState(calFailed)
  const [text, setText] = useState('')
  const [reading, setReading] = useState(false)
  const [readErr, setReadErr] = useState('')
  useEffect(() => {
    if (me?.cal_slots?.length) { setFound(me.cal_slots); setFoundFrom('google') }
  }, [me?.cal_slots])
  useEffect(() => {
    if (params.get('cal') === 'ok' && me && !me.cal_slots?.length) setTyping(true)
  }, [params, me])
  if (!plan || !me) return null
  const planDays = plan.dates.length ? plan.dates : []
  const allowed = isPlanner || !planDays.length ? undefined : (d: string) => planDays.includes(d)

  async function saveFound() {
    const slots = found ?? []
    const ds = [...new Set(slots.map((s) => ymd(new Date(s.start))))].sort()
    if (isPlanner) await call('', { dates: ds, send: true, deadline: plan!.deadline ?? defaultDeadline(ds[0]) }, 'PATCH')
    await call('/me', { availability: slots, tz: myTz(), status: 'answered', ...(foundFrom === 'type' ? { avail_text: text } : {}) }, 'PATCH')
    setFound(null)
    if (params.get('cal')) { params.delete('cal'); setParams(params, { replace: true }) }
    setTab('budget')
  }

  async function readText() {
    setReading(true)
    setReadErr('')
    try {
      const r = await api<{ slots: { start: string; end: string }[] }>(`/plans/${plan!.id}/parse-availability`, { body: { text, tz: myTz() }, member: me!.id ?? null })
      if (r.slots.length) { setFound(r.slots); setFoundFrom('type') } else setReadErr("We couldn't find dates in that. Try 'Saturday after 2' or tap your dates below.")
    } catch (e) {
      setReadErr((e as Error).message)
    } finally {
      setReading(false)
    }
  }

  if (found) {
    const byDay = new Map<string, { start: string; end: string }[]>()
    for (const s of found) byDay.set(ymd(new Date(s.start)), [...(byDay.get(ymd(new Date(s.start))) ?? []), s])
    return (
      <>
        <PageHeading color={color} sub={foundFrom === 'google' ? 'From your Google Calendar, free/busy only. Tap a time to remove it.' : 'From what you typed. Tap a time to remove it.'}>
          When are you free?
        </PageHeading>
        {found.length === 0 && <Note>Nothing left. Try again or pick dates instead.</Note>}
        <ul className="flex flex-col">
          {[...byDay.entries()].sort().map(([day, list]) => (
            <li key={day} className="flex flex-col gap-2 border-b border-rule py-3 first:pt-0">
              <span className="text-base font-semibold">{fmtDay(day)}</span>
              <div className="flex flex-wrap gap-2">
                {list.map((s) => (
                  <Chip key={s.start} on onClick={() => setFound(found.filter((x) => x !== s))}>{fmtTime(s.start)} to {fmtClock(s.end)}</Chip>
                ))}
              </div>
            </li>
          ))}
        </ul>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => { setFound(null); if (foundFrom === 'google') run(() => call('/me', { cal_slots: [] }, 'PATCH')) }}>Pick dates instead</Button>
          <Button disabled={busy || !found.length} onClick={() => run(saveFound, 'Saved')}>Looks right</Button>
        </div>
      </>
    )
  }

  async function save() {
    const slots = toSlots(dates, times)
    if (isPlanner) {
      // the planner's free dates are the dates friends choose from
      await call('', { dates, send: true, deadline: plan!.deadline ?? defaultDeadline([...dates].sort()[0]) }, 'PATCH')
    }
    await call('/me', { availability: slots, tz: myTz(), status: 'answered' }, 'PATCH')
    setTab('budget')
  }

  return (
    <>
      <PageHeading color={color} sub={isPlanner ? 'Friends pick from the days you choose here.' : planDays.length ? `${plan.members.find((m) => m.pub === plan.planner)?.name} picked these days.` : undefined}>
        When are you free?
      </PageHeading>
      <div className="flex flex-col gap-2 border-2 border-ink bg-surface p-4">
        <span className="label">Recommended</span>
        <Button disabled={!calendar}
          onClick={() => { window.location.href = `/api/calendar/connect?plan=${encodeURIComponent(plan.id)}&m=${encodeURIComponent(me.id ?? '')}&back=${encodeURIComponent(location.pathname + '?tab=dates')}` }}>
          Connect Google Calendar
        </Button>
        <p className="text-sm text-ink-soft">{calendar ? 'Fills in your free dates and times from free/busy only, never what your events are. You check them before saving.' : 'Google Calendar is being set up. Pick your dates below for now.'}</p>
      </div>
      {calFailed && <Note>We couldn't read your Google Calendar this time. No problem: type when you're free, or tap your dates below.</Note>}
      {typing ? (
        <div className="flex flex-col gap-2">
          <Field label="Type when you're free">
            <textarea className={`${inputCls} min-h-24 py-3`} value={text} placeholder="Free after 6 on Saturday, all day Sunday" onChange={(e) => setText(e.target.value)} />
          </Field>
          <Button variant="secondary" disabled={!text.trim() || reading} onClick={readText}>{reading ? 'Reading...' : 'Read it'}</Button>
          {readErr && <ErrorBox message={readErr} />}
        </div>
      ) : (
        <Button variant="text" className="self-start" onClick={() => setTyping(true)}>Or type it</Button>
      )}
      {!askTimes ? (
        <>
          <SubHeading>Or pick your free dates</SubHeading>
          <Calendar selected={dates} allowed={allowed} onToggle={(d) => setDates(dates.includes(d) ? dates.filter((x) => x !== d) : [...dates, d])} />
          <Button full disabled={!dates.length} onClick={() => setAskTimes(true)}>Next</Button>
          {!dates.length && <Note>Dates are needed. Times are optional.</Note>}
        </>
      ) : (
        <>
          <SubHeading>Any time preferences?</SubHeading>
          <p className="text-sm text-ink-soft">Optional. Skip means any time on {dates.length === 1 ? fmtDay(dates[0]) : 'those dates'}.</p>
          <ChipGroup label="Time preferences" multi options={[...TIMES.map((t) => ({ value: t.value, label: t.label })), { value: 'any', label: 'Any time' }]}
            value={times} onChange={(v: string[]) => setTimes(v.includes('any') && !times.includes('any') ? ['any'] : v.filter((x) => x !== 'any'))} />
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" disabled={busy} onClick={() => { setTimes([]); run(async () => { await call('/me', { availability: toSlots(dates, []), tz: myTz(), status: 'answered' }, 'PATCH'); if (isPlanner) await call('', { dates, send: true, deadline: plan.deadline ?? defaultDeadline([...dates].sort()[0]) }, 'PATCH'); setTab('budget') }, 'Saved') }}>Skip</Button>
            <Button disabled={busy} onClick={() => run(save, 'Saved')}>Save</Button>
          </div>
          <Button variant="text" className="self-start" onClick={() => setAskTimes(false)}>Change dates</Button>
        </>
      )}
    </>
  )
}

/* ---------------- Plans: answers, options as stickers, vote, the stamped plan ---------------- */

function PlansPage({ plan, me, isPlanner, busy, run, call, color, setTab }: PageProps) {
  if (!plan) return null
  const byPub = Object.fromEntries(plan.members.map((m) => [m.pub, m]))
  const answered = plan.members.filter((m) => m.status === 'answered')
  const waiting = plan.members.filter((m) => m.status === 'invited')
  const chosen = plan.options.find((o) => o.id === plan.chosen)
  const generating = plan.generating || (busy && plan.status === 'answers' && plan.answers_ready && !plan.places.length)
  const status = statusLine(plan, waiting, answered, generating)
  return (
    <>
      <PageHeading color={color}>Places</PageHeading>
      <Progress stage={plan.stage} answers={`${answered.length} of ${plan.members.filter((m) => m.status !== 'declined').length}`} />
      <p className="text-lg font-semibold" aria-live="polite">{status}</p>

      {me && me.status !== 'answered' && me.status !== 'declined' && plan.status !== 'locked' && plan.status !== 'confirmed' && (
        <Button onClick={() => setTab('dates')}>Add when you're free</Button>
      )}

      {(plan.status === 'answers' || plan.status === 'draft') && !generating && (
        <div className="flex flex-col gap-3">
          {plan.problem && <PlacesProblem problem={plan.problem} onRetry={() => run(() => call('/places'))} />}
          {isPlanner && plan.deadline && (
            <Field label="Answers close">
              <input type="datetime-local" className={inputCls} defaultValue={toLocalInput(plan.deadline)}
                onBlur={(e) => e.target.value && run(() => call('', { deadline: new Date(e.target.value).toISOString() }, 'PATCH'), 'Deadline saved')} />
            </Field>
          )}
          {isPlanner && waiting.length > 0 && <NudgeButton plan={plan} waiting={waiting} me={me} />}
          {isPlanner && waiting.length > 0 && answered.length >= 1 && (
            <Button variant="secondary" disabled={busy} onClick={() => run(() => call('/close-answers'))}>Don't wait, plan with who's answered</Button>
          )}
          <Note>When the answers are in, places appear here by themselves.</Note>
        </div>
      )}

      {generating && <PlacesWorking n={answered.length} />}

      {plan.status === 'places' && !generating && (
        <PlacePicker plan={plan} me={me} isPlanner={isPlanner} busy={busy} run={run} call={call} setTab={setTab} color={color} />
      )}

      {plan.status === 'options' && (
        <div className="flex flex-col gap-6">
          {plan.options.map((o, i) => {
            const t = plan.votes[o.id] ?? { in: [], maybe: [], cant: [] }
            const mine = me?.pub ?? ''
            const my = t.in.includes(mine) ? 'in' : t.maybe.includes(mine) ? 'maybe' : t.cant.includes(mine) ? 'cant' : null
            return (
              <Sticker key={o.id} o={o} i={i} byPub={byPub}>
                <div className="grid grid-cols-3 gap-2" role="group" aria-label={`Vote on ${o.title}`}>
                  {([['in', "I'm in"], ['maybe', 'Maybe'], ['cant', "Can't"]] as const).map(([c, label]) => (
                    <button key={c} type="button" disabled={busy} aria-pressed={my === c} onClick={() => run(() => call('/vote', { option_id: o.id, choice: c }))}
                      className={`min-h-12 border-2 text-base font-semibold ${my === c ? 'border-ink bg-ink text-bg' : 'border-rule bg-surface'}`}>{label}</button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm text-ink-soft">
                  {(['in', 'maybe', 'cant'] as const).map((k) => t[k].length > 0 && (
                    <span key={k} className="inline-flex items-center gap-2"><AvatarRow size={26} people={t[k].map((p) => byPub[p]).filter(Boolean)} />{k === 'cant' ? "can't" : k}</span>
                  ))}
                </div>
                {isPlanner && <Button variant="text" className="self-start" disabled={busy} onClick={() => run(() => call('/lock', { option_id: o.id }), 'Locked')}>Lock this one</Button>}
              </Sticker>
            )
          })}
          <Button variant="secondary" disabled={busy} onClick={() => run(() => call('/generate'), 'New ideas')}>Show me other ideas</Button>
        </div>
      )}

      {chosen && (plan.status === 'locked' || plan.status === 'confirmed') && (
        <Stamped plan={plan} chosen={chosen} byPub={byPub} busy={busy} run={run} call={call} setTab={setTab} />
      )}
    </>
  )
}

function toLocalInput(iso: string) {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

function statusLine(plan: Plan, waiting: Member[], answered: Member[], generating: boolean) {
  const dl = plan.deadline ? fmtTime(plan.deadline) : ''
  if (plan.status === 'draft') return 'Pick your free dates so friends can answer.'
  switch (plan.stage) {
    case 'answers':
      if (generating) return 'Everyone has answered. Finding options now.'
      if (!waiting.length) return answered.length < 2 ? 'Waiting for at least one more person.' : 'Everyone has answered.'
      return `Waiting on ${names(waiting.map((m) => m.name))}.${dl ? ` Answers close ${dl}.` : ''}`
    case 'options': return plan.status === 'places' ? 'Pick up to 2 places. The one most people pick wins.' : "Tap the ones you'd go to. It locks when more than half say I'm in."
    case 'vote': {
      const voted = new Set(Object.values(plan.votes).flatMap((v) => [...v.in, ...v.maybe, ...v.cant]))
      const left = answered.filter((m) => !voted.has(m.pub))
      if (plan.status === 'places') {
        const pv = new Set(Object.values(plan.place_votes).flat())
        const notYet = answered.filter((m) => !pv.has(m.pub))
        return notYet.length ? `Waiting on ${names(notYet.map((m) => m.name))} to pick.` : 'Everyone has picked.'
      }
      return left.length ? `Waiting on ${names(left.map((m) => m.name))} to vote.` : 'Everyone has voted.'
    }
    case 'tasks': {
      if (plan.dropout && !plan.dropout.decided) return `${names(plan.dropout.names)} can't make it anymore.`
      const left = answered.filter((m) => !m.confirm)
      return left.length ? `It's picked. Waiting on ${names(left.map((m) => m.name))} to confirm.` : 'Everyone is in.'
    }
    case 'confirmed': return "It's happening."
    default: return ''
  }
}

/** A plan option drawn as a sticker: white border, slight tilt. Stickers only live here and on the stamped plan. */
function Sticker({ o, i, byPub, children }: { o: Option; i: number; byPub: Record<string, Member>; children?: React.ReactNode }) {
  const tilt = [-1.6, 1.2, -0.8][i % 3]
  const tint = PASTELS[(i * 2 + 4) % PASTELS.length].hex
  const where = o.kind === 'online' ? 'Online' : o.kind === 'home' ? `At ${o.host}'s home` : o.place
  return (
    <article className="border-[6px] border-white p-4 shadow-[var(--sticker-shadow)] outline-2 outline-ink/10" style={{ transform: `rotate(${tilt}deg)`, background: `color-mix(in srgb, ${tint} 35%, var(--surface))` }}>
      <div className="flex flex-col gap-3" style={{ transform: `rotate(${-tilt}deg)` }}>
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-xl font-bold">{o.title}</h3>
          {o.checked && <span className="inline-flex shrink-0 items-center bg-ok-soft px-2 py-1 text-sm font-semibold text-ok">Checked<Help text="We checked times, budgets, distance, opening hours and everyone's access needs." /></span>}
        </div>
        <p className="text-base">{o.what}</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-base">
          <dt className="text-ink-soft">When</dt><dd className="font-bold">{fmtRange(o.start, o.end)}</dd>
          <dt className="text-ink-soft">Where</dt><dd>{where}{o.address && o.kind !== 'home' && <span className="block text-sm text-ink-soft">{o.address}</span>}</dd>
          <dt className="text-ink-soft">Cost</dt><dd className="font-bold">{o.cost_per_person ? `About $${o.cost_per_person} each` : 'Free'}</dd>
          {o.weather && <><dt className="text-ink-soft">Weather</dt><dd>{o.weather}</dd></>}
        </dl>
        {o.kind !== 'online' && o.lat != null && o.lon != null && <MiniMap lat={o.lat} lon={o.lon} title={o.title} people={Object.values(byPub).filter((m) => m.status === 'answered')} />}
        {o.kind !== 'online' && <p className="text-sm">{(o as Option & { access?: string }).access === 'unconfirmed' ? 'Access not confirmed, call ahead.' : "Checked for everyone's access needs."}</p>}
        {o.distances && Object.keys(o.distances).length > 0 && (
          <div className="flex flex-wrap gap-3" aria-label="Distance for each person">
            {Object.entries(o.distances).map(([pub, km]) => byPub[pub] && (
              <span key={pub} className="inline-flex items-center gap-1.5 text-sm"><Avatar name={byPub[pub].name} color={byPub[pub].color} size={24} />{km < 1 ? '<1 km' : `${Math.round(km)} km`}</span>
            ))}
          </div>
        )}
        {o.kind === 'online' && o.how && o.how.length > 0 && (
          <details><summary className="min-h-12 cursor-pointer content-center font-semibold">How it works</summary>
            <ol className="list-decimal pl-6">{o.how.map((h, j) => <li key={j}>{h}</li>)}</ol></details>
        )}
        {o.why && <Note>{o.why}</Note>}
        {children}
      </div>
    </article>
  )
}

function Stamped({ plan, chosen, byPub, busy, run, call, setTab }: { plan: Plan; chosen: Option; byPub: Record<string, Member>; busy: boolean; run: PageProps['run']; call: PageProps['call']; setTab: (t: string) => void }) {
  const me = plan.me
  const confirmed = plan.status === 'confirmed'
  const [when, setWhen] = useState(toLocalInput(chosen.start))
  const directions = chosen.kind === 'place' || chosen.kind === 'event'
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${chosen.place ?? ''} ${chosen.address ?? ''}`)}` : null
  return (
    <div className="flex flex-col gap-5">
      {me && me.status === 'answered' && !me.confirm && (
        <div className="flex flex-col gap-3 border-2 border-ink bg-surface p-4">
          <p className="text-lg font-bold">Yay, plan fixed: {chosen.title}, {fmtRange(chosen.start, chosen.end)}. Still in?</p>
          <div className="grid grid-cols-2 gap-2">
            <Button disabled={busy} onClick={() => run(() => call('/confirm', { choice: 'yes' }), "You're confirmed")}>Confirm</Button>
            <Button variant="secondary" disabled={busy} onClick={() => run(() => call('/confirm', { choice: 'no' }), 'We let the group know')}>Can't anymore</Button>
          </div>
        </div>
      )}
      {plan.is_planner && plan.dropout && !plan.dropout.decided && (
        <div className="flex flex-col gap-3 border-2 border-ink bg-surface p-4">
          <p>{names(plan.dropout.names)} can't make it. Go ahead without them, or find a new time?</p>
          <div className="grid grid-cols-2 gap-2">
            <Button disabled={busy} onClick={() => run(() => call('/dropout', { decision: 'go_ahead' }))}>Go ahead</Button>
            <Button variant="secondary" disabled={busy} onClick={() => run(() => call('/dropout', { decision: 'new_time' }))}>New time</Button>
          </div>
        </div>
      )}
      <div className="relative pt-6">
        <Sticker o={chosen} i={0} byPub={byPub} />
        <span className="stamp absolute -top-1 right-4 border-4 border-accent px-3 py-1 text-xl font-black uppercase tracking-wider text-accent" style={{ background: 'color-mix(in srgb, var(--surface) 70%, transparent)' }}>
          {confirmed ? 'Confirmed' : 'Picked'}
        </span>
      </div>
      {plan.effort && <EffortSaved e={plan.effort} />}
      {chosen.kind === 'home' && <p className="text-base">{plan.host_address ? <>Address: <b>{plan.host_address}</b></> : me?.confirm === 'yes' ? `${chosen.host} hasn't added the address yet.` : 'The address shows here once you confirm.'}</p>}
      <div className="grid grid-cols-2 gap-2">
        <a className="inline-flex min-h-12 items-center justify-center bg-accent px-4 font-semibold text-accent-ink" href={`/api/plans/${plan.id}/invite.ics?m=${encodeURIComponent(me?.id ?? '')}`}>Add to calendar</a>
        {directions ? <a className="inline-flex min-h-12 items-center justify-center border-2 border-ink px-4 font-semibold" href={directions} target="_blank" rel="noreferrer">Directions</a>
          : chosen.link ? <a className="inline-flex min-h-12 items-center justify-center border-2 border-ink px-4 font-semibold" href={chosen.link} target="_blank" rel="noreferrer">Open link</a> : null}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={() => setTab('rides')}>How are we getting there?</Button>
        <Button variant="secondary" onClick={() => setTab('wear')}>What are we wearing?</Button>
      </div>
      {plan.is_planner && (
        <details className="border-2 border-rule bg-surface p-4">
          <summary className="min-h-12 cursor-pointer content-center font-semibold">Edit the time</summary>
          <div className="flex flex-col gap-3 pt-2">
            <input type="datetime-local" className={inputCls} value={when} onChange={(e) => setWhen(e.target.value)} />
            <Button disabled={busy} onClick={() => run(() => call('/chosen', { start: new Date(when).toISOString() }, 'PATCH'), 'Moved. Everyone will confirm again.')}>Move it</Button>
          </div>
        </details>
      )}
    </div>
  )
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** "Effort saved", from real numbers on this plan. */
/** One tap: opens the planner's own email app with a ready message to everyone who hasn't answered. */
function NudgeButton({ plan, waiting, me }: { plan: Plan; waiting: Member[]; me: Member | null }) {
  const to = waiting.map((m) => m.email).filter(Boolean).join(',')
  const link = `${location.origin}/p/${plan.id}?tab=who`
  const title = planName(plan)
  const dl = plan.deadline ? `

Answers close ${fmtTime(plan.deadline)}.` : ''
  const body = `Hi ${names(waiting.map((m) => m.name))}!

We're planning ${title} and just need your answers. It takes about a minute: when you're free, your budget and what you'd like to do.

${link}${dl}

Thanks!
${me?.name ?? ''}`
  const href = `mailto:${to}?subject=${encodeURIComponent(`Quick answer for ${title}?`)}&body=${encodeURIComponent(body)}`
  return (
    <a href={href} className="inline-flex min-h-12 items-center justify-center border-2 border-ink bg-surface px-4 font-semibold">
      Nudge {waiting.length === 1 ? waiting[0].name : `${waiting.length} people`}
    </a>
  )
}

function EffortSaved({ e }: { e: NonNullable<Plan['effort']> }) {
  return (
    <div className="flex flex-col gap-1 border-2 border-dashed border-accent bg-accent-soft p-4">
      <span className="label">Effort saved</span>
      <p className="text-base">
        <b>{plural(e.people, 'person', 'people')}</b> answered <b>{plural(e.questions, 'question')}</b> between them
        {e.people ? ` (about ${Math.round(e.questions / e.people)} each)` : ''},{' '}
        <b>{plural(e.places_checked, 'place')}</b> checked, <b>{plural(e.tasks, 'task')}</b> split across {plural(e.task_people, 'person', 'people')}.
      </p>
      <p className="font-hand text-xl">Nobody had to be the planner.</p>
    </div>
  )
}

/* ---------------- Tasks ---------------- */

function TasksPage({ plan, isPlanner, busy, run, call, color }: PageProps) {
  if (!plan) return null
  const people = plan.members.filter((m) => m.status !== 'declined')
  return (
    <>
      <PageHeading color={color} sub="Jobs go to whoever has done the least planning lately.">Tasks</PageHeading>
      {isPlanner && (
        <div className="grid grid-cols-2 border-2 border-ink" role="radiogroup" aria-label="Who does the work">
          {(['share', 'solo'] as const).map((w) => (
            <button key={w} type="button" role="radio" aria-checked={plan.work === w} disabled={busy}
              onClick={() => run(async () => { await call('', { work: w }, 'PATCH'); if (!plan.chosen) await call('/plan-tasks') })}
              className={`min-h-12 text-sm font-semibold ${plan.work === w ? 'bg-ink text-bg' : 'bg-surface'}`}>
              {w === 'share' ? 'Share the work' : "I'll handle it all"}
            </button>
          ))}
        </div>
      )}
      {plan.tasks.length === 0 ? (
        isPlanner ? <Button disabled={busy} onClick={() => run(() => call('/plan-tasks'))}>Make the task list</Button> : <Note>The planner hasn't made the task list yet.</Note>
      ) : (
        <TaskBoard tasks={plan.tasks} people={people} me={plan.me?.pub} isPlanner={isPlanner} busy={busy}
          onMove={(tid, to) => run(() => call(`/task-move/${tid}`, { to }))}
          onAsk={(tid, to) => run(() => call(`/task-ask/${tid}`, { to }), 'Asked')}
          onAction={(tid, a) => run(() => call(`/tasks/${tid}/${a}`))} />
      )}
      <Note>The app never books or pays for anything. Booking is a task.</Note>
    </>
  )
}

/* ---------------- Right page: live summary ---------------- */

function Summary({ plan }: { plan: Plan | null }) {
  const days = useMemo(() => {
    if (!plan) return []
    const all = plan.dates.length ? plan.dates : []
    return all.map((d) => ({ d, free: plan.members.filter((m) => m.free_days?.includes(d)) })).sort((a, b) => b.free.length - a.free.length || a.d.localeCompare(b.d))
  }, [plan])
  if (!plan) {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-bold">How this works</h2>
        <ol className="flex flex-col gap-3 text-base">
          {['Tap what you are planning.', 'Share one link with the group.', 'Everyone taps the days they are free.', 'The app suggests 3 plans that fit everyone.', 'Vote, split the jobs, go.'].map((t, i) => (
            <li key={i} className="flex gap-3 border-b border-rule pb-2"><span className="font-bold">{i + 1}.</span>{t}</li>
          ))}
        </ol>
        <Note>Nobody has to be the planner.</Note>
      </div>
    )
  }
  const answered = plan.members.filter((m) => m.status === 'answered')
  const chosen = plan.options.find((o) => o.id === plan.chosen)
  return (
    <div className="flex flex-col gap-6">
      <div>
        <span className="label">The plan so far</span>
        <p className="text-xl font-bold">{chosen ? chosen.title : planName(plan)}</p>
        {chosen ? <p className="text-base">{fmtRange(chosen.start, chosen.end)}{chosen.place ? `, ${chosen.place}` : ''}</p>
          : plan.decide === 'planner' && plan.details ? <p className="text-base">{summary(plan.details)}</p> : null}
      </div>
      <div className="flex flex-col gap-2">
        <span className="label">Who has answered ({answered.length} of {plan.members.filter((m) => m.status !== 'declined').length})</span>
        <div className="flex flex-wrap gap-2">
          {plan.members.map((m) => <span key={m.pub} className="inline-flex items-center gap-1.5 text-sm"><Avatar name={m.name} color={m.color} size={28} dim={m.status !== 'answered'} />{m.name}</span>)}
        </div>
      </div>
      {days.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="label">Matched dates</span>
          <ul className="flex flex-col">
            {days.map(({ d, free }, i) => (
              <li key={d} className={`flex min-h-10 items-center gap-3 border-b border-rule ${i === 0 && free.length ? 'font-bold' : ''}`}>
                <span className="w-28">{fmtDay(d)}</span>
                <span className="flex flex-1 flex-wrap gap-1">{free.map((m) => <Avatar key={m.pub} name={m.name} color={m.color} size={24} />)}</span>
                <span className="text-sm text-ink-soft">{free.length} free</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {plan.tasks.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="label">Jobs</span>
          <ul className="flex flex-col gap-1 text-base">
            {plan.tasks.map((t) => {
              const who = plan.members.find((m) => m.pub === t.assignee)
              return <li key={t.id} className="flex items-center gap-2"><span aria-hidden="true" className={`inline-block h-4 w-4 border-2 border-ink ${t.done ? 'bg-ink' : ''}`} /><span className={t.done ? 'line-through' : ''}>{t.title}</span><span className="text-sm text-ink-soft">{who?.name}</span></li>
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
