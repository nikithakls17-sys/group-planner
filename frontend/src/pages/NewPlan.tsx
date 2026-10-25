import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { addDays, api, fmtDay, KIND_LABEL, local, myTz, parseDay, thisWeekend, type Group, type Picks, type Plan } from '../api'
import Calendar from '../components/Calendar'
import FreeTimes, { type Slot } from '../components/FreeTimes'
import LocationLine, { type Loc } from '../components/Location'
import PicksForm, { DEFAULT_PICKS } from '../components/PicksForm'
import Share from '../components/Share'
import { Step, StepBar } from '../components/Steps'
import TaskBoard from '../components/TaskBoard'
import { Avatar, Button, Chip, ErrorBox, Field, inputCls, Tile } from '../components/ui'
import { MEMBER_COLORS } from '../config'

const STEPS = ['Who', 'What', 'When', 'Details', 'Tasks and deadline']
const KINDS = [
  { value: 'hangout', sub: 'Coffee, a walk, whatever', spot: 'bg-spot-green' },
  { value: 'meal', sub: 'Lunch, dinner, brunch', spot: 'bg-spot-tomato' },
  { value: 'date', sub: 'Just the two of you', spot: 'bg-spot-pink' },
  { value: 'call', sub: 'Games, watch party, catch-up', spot: 'bg-spot-sky' },
  { value: 'trip', sub: 'A day out or a weekend away', spot: 'bg-spot-mustard' },
  { value: 'other', sub: 'Tell us what', spot: 'bg-surface' },
]

type Flow = {
  planId: string | null
  member: string | null
  step: number
  reached: number
  me: string
  loc: Loc | null
  groupName: string
  groupId: string | null
  people: string[]
  kind: string
  kindOther: string
  dates: string[]
  slots: Slot[]
  decide: 'everyone' | 'planner'
  picks: Picks
  bestDay: string
  startTime: string
  endTime: string
  work: 'share' | 'solo'
  deadline: string
  sent: boolean
}

const fresh = (): Flow => ({
  planId: null, member: null, step: 0, reached: 0, me: local.name(), loc: local.city() ? { city: local.city() } : null,
  groupName: '', groupId: null, people: [''], kind: 'hangout', kindOther: '', dates: [], slots: [], decide: 'everyone',
  picks: local.lastPicks() ?? DEFAULT_PICKS, bestDay: '', startTime: '', endTime: '', work: 'share', deadline: '', sent: false,
})

const pad = (n: number) => String(n).padStart(2, '0')
const toLocalInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`

/** Default reply deadline: the evening before the first date, at least 3 hours and at most 3 days from now. */
function defaultDeadline(firstDay?: string) {
  const soonest = new Date(Date.now() + 3 * 3600_000)
  const latest = new Date(Date.now() + 3 * 86400_000)
  let d = firstDay ? addDays(parseDay(firstDay), -1) : latest
  d.setHours(18, 0, 0, 0)
  if (d < soonest) d = soonest
  if (d > latest) d = latest
  return toLocalInput(d)
}

export default function NewPlan() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const editId = params.get('plan')
  const groupParam = params.get('group')
  const bored = params.get('bored') === '1'
  const [f, setF] = useState<Flow>(() => {
    const saved = local.draft<Flow>()
    if (!editId && !groupParam && !bored && saved && !saved.sent) return { ...fresh(), ...saved }
    return fresh()
  })
  const [plan, setPlan] = useState<Plan | null>(null)
  const [groups, setGroups] = useState<Group[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (patch: Partial<Flow>) => setF((x) => ({ ...x, ...patch }))

  // nothing typed is lost: every change is kept in this browser until the invite is sent
  useEffect(() => { if (!editId) local.setDraft(f) }, [f, editId])

  // Editing an existing plan: load what's already there
  useEffect(() => {
    if (!editId) return
    const member = local.memberFor(editId)
    api<Plan>(`/plans/${editId}`, { member }).then((p) => {
      setPlan(p)
      setF({
        ...fresh(), planId: p.id, member, step: 2, reached: 4, me: p.me?.name ?? '', loc: p.me?.city ? { city: p.me.city } : null,
        kind: p.kind, kindOther: p.kind_other ?? '', dates: p.dates.length ? p.dates : [p.start_day], slots: p.me?.availability ?? [],
        decide: p.decide, picks: { ...DEFAULT_PICKS, ...(p.decide === 'planner' ? p.details : p.me?.picks) }, bestDay: p.me?.picks?.best_day ?? '',
        startTime: p.locks.time ?? '', endTime: p.locks.end_time ?? '', work: p.work,
        deadline: p.deadline ? toLocalInput(new Date(p.deadline)) : '', groupId: p.group_id ?? null, people: [''],
      })
    }).catch((e) => setErr(e.message))
  }, [editId])

  useEffect(() => {
    Promise.all(local.groups().map((g) => api<Group>(`/groups/${g.id}`).catch(() => null))).then((gs) => {
      const ok = gs.filter(Boolean) as Group[]
      setGroups(ok)
      const g = ok.find((x) => x.id === groupParam)
      if (g) setF((x) => ({ ...x, groupId: g.id, groupName: g.name, people: g.members.map((m) => m.name).filter((n) => n.toLowerCase() !== x.me.trim().toLowerCase()) }))
    })
  }, [groupParam])

  const refresh = useCallback(async (id = f.planId, member = f.member) => {
    if (!id) return
    setPlan(await api<Plan>(`/plans/${id}`, { member }))
  }, [f.planId, f.member])

  useEffect(() => { if (f.planId && !plan) refresh().catch(() => set({ ...fresh() })) }, [f.planId, plan, refresh])

  // friends who join from the link show up while you're still planning
  useEffect(() => {
    if (!f.planId) return
    const t = window.setInterval(() => { if (!document.hidden) refresh().catch(() => {}) }, 10000)
    return () => window.clearInterval(t)
  }, [f.planId, refresh])

  const go = (step: number) => set({ step, reached: Math.max(f.reached, step) })
  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setErr('')
    try { await fn() } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  const patchPlan = async (body: Record<string, unknown>) => setPlan(await api<Plan>(`/plans/${f.planId}`, { method: 'PATCH', body, member: f.member }))
  const patchMe = async (body: Record<string, unknown>) => setPlan(await api<Plan>(`/plans/${f.planId}/me`, { method: 'PATCH', body, member: f.member }))

  // once the plan exists, any step can be opened from the bar (everything has a sensible default)
  const bar = <StepBar steps={STEPS} at={f.step} reached={f.reached} onJump={go} canJump={(i) => i === 0 || !!f.planId} />
  const back = (to: number) => () => (to < 0 ? nav(editId ? `/p/${editId}` : '/') : go(to))
  const names = f.people.map((p) => p.trim()).filter(Boolean)
  const members = plan?.members ?? []

  async function createLink() {
    local.setName(f.me.trim())
    const res = await api<{ plan_id: string; member_id: string }>('/plans', {
      body: {
        draft: true, tz: myTz(), planner: { name: f.me.trim() }, people: names.map((name) => ({ name })),
        group_id: f.groupId, save_group_as: f.groupId ? '' : (f.groupName.trim() || `${f.me.trim()}'s group`),
        kind: f.kind,
      },
    })
    local.addPlan({ id: res.plan_id, member: res.member_id, title: 'New plan' })
    await api(`/plans/${res.plan_id}/me`, { method: 'PATCH', member: res.member_id, body: { name: f.me.trim(), tz: myTz(), city: f.loc?.city ?? '', lat: f.loc?.lat, lon: f.loc?.lon } })
    const p = await api<Plan>(`/plans/${res.plan_id}`, { member: res.member_id })
    if (p.group_id && !f.groupId) local.addGroup({ id: p.group_id, name: f.groupName.trim() || `${f.me.trim()}'s group` })
    setPlan(p)
    set({ planId: res.plan_id, member: res.member_id, groupId: p.group_id ?? null })
  }

  if (err && editId && !plan) return <div className="pt-12"><ErrorBox message={err} fix="Back" onFix={() => nav('/')} /></div>

  switch (f.step) {
    case 0:
      return (
        <Step bar={bar} onBack={back(-1)} backLabel={editId ? 'Back to the plan' : 'Home'} question="Who are we planning with?"
          sub="Make the group link first, so friends can join while you plan."
          primary={f.planId ? 'Next' : busy ? 'Making the link...' : 'Create the group link'}
          primaryDisabled={!f.me.trim() || busy}
          onPrimary={() => run(async () => {
            if (!f.planId) return createLink()
            if (names.length) setPlan(await api<Plan>(`/plans/${f.planId}/people`, { body: names.map((name) => ({ name })), member: f.member }))
            await api(`/plans/${f.planId}/me`, { method: 'PATCH', member: f.member, body: { name: f.me.trim(), city: f.loc?.city ?? '', lat: f.loc?.lat, lon: f.loc?.lon } })
            set({ people: [''] })
            go(bored ? 2 : 1)
          })}
          next={f.planId ? 'Next: what you are planning.' : 'You can add more people later. Anyone with the link can join.'}>
          <Field label="Your name">
            <input className={inputCls} value={f.me} autoComplete="given-name" onChange={(e) => set({ me: e.target.value })} />
          </Field>
          <LocationLine value={f.loc} onChange={(loc) => set({ loc })} />
          {groups.length > 0 && !f.planId && (
            <Field label="Or pick a saved group">
              <div className="flex flex-wrap gap-2">
                {groups.map((g) => (
                  <Chip key={g.id} on={f.groupId === g.id} onClick={() => f.groupId === g.id ? set({ groupId: null, groupName: '', people: [''] })
                    : set({ groupId: g.id, groupName: g.name, people: g.members.map((m) => m.name).filter((n) => n.toLowerCase() !== f.me.trim().toLowerCase()) })}>
                    {g.name}
                  </Chip>
                ))}
              </div>
            </Field>
          )}
          {!f.groupId && !f.planId && (
            <Field label="Group name (optional)">
              <input className={inputCls} placeholder="Flatmates, College gang, Family" value={f.groupName} onChange={(e) => set({ groupName: e.target.value })} />
            </Field>
          )}
          {members.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="label">In the group</span>
              <div className="flex flex-wrap gap-2">
                {members.map((m) => (
                  <span key={m.pub} className="inline-flex items-center gap-2 border-2 border-ink bg-surface px-2 py-1">
                    <Avatar name={m.name} color={m.color} size={28} />{m.name}{m.has_answers || m.status === 'answered' ? '' : m.is_planner ? ' (you)' : ''}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <span className="label">Add people (optional)</span>
            {f.people.map((p, i) => (
              <div key={i} className="flex items-center gap-2">
                <Avatar name={p || '?'} color={MEMBER_COLORS[(members.length + i + (members.length ? 0 : 1)) % MEMBER_COLORS.length].hex} size={40} />
                <input aria-label={`Person ${i + 1}`} className={inputCls} placeholder="Name" value={p}
                  onChange={(e) => set({ people: f.people.map((x, j) => (j === i ? e.target.value : x)) })} />
                {f.people.length > 1 && <Button variant="text" onClick={() => set({ people: f.people.filter((_, j) => j !== i) })}>Remove</Button>}
              </div>
            ))}
            <Button variant="secondary" onClick={() => set({ people: [...f.people, ''] })}>Add someone</Button>
          </div>
          {f.planId && (
            <div className="flex flex-col gap-3 border-2 border-ink bg-spot-mustard p-4">
              <span className="display text-xl">Your group link</span>
              <Share id={f.planId} message="Open this link to plan with me:" />
            </div>
          )}
          {err && <ErrorBox message={err} />}
        </Step>
      )
    case 1:
      return (
        <Step bar={bar} onBack={back(0)} question="What are we planning?" sub="Tap one."
          primary="Next" primaryDisabled={(f.kind === 'other' && !f.kindOther.trim()) || busy}
          onPrimary={() => run(async () => { await patchPlan({ kind: f.kind, kind_other: f.kind === 'other' ? f.kindOther : '' }); go(2) })}
          next="Tapping one also moves you on. Next: when.">
          <div className="grid grid-cols-2 gap-3">
            {KINDS.map((k) => (
              <button key={k.value} type="button" aria-pressed={f.kind === k.value} disabled={busy}
                onClick={() => {
                  set({ kind: k.value })
                  if (k.value !== 'other') run(async () => { await patchPlan({ kind: k.value, kind_other: '' }); go(2) })
                }}
                className={`flex min-h-24 flex-col items-start justify-end gap-1 border-2 border-ink p-3 text-left ${k.spot} ${f.kind === k.value ? 'shadow-[var(--shadow-card)] outline-2 outline-ink' : ''}`}>
                <span className="display text-xl">{KIND_LABEL[k.value]}</span>
                <span className="text-sm">{k.sub}</span>
              </button>
            ))}
          </div>
          {f.kind === 'other' && (
            <Field label="What is it?">
              <input autoFocus className={inputCls} value={f.kindOther} placeholder="Movie night, birthday, study session" onChange={(e) => set({ kindOther: e.target.value })} />
            </Field>
          )}
          {err && <ErrorBox message={err} />}
        </Step>
      )
    case 2: {
      const w = thisWeekend()
      const weekend = [w.start, w.end].filter((d, i, a) => a.indexOf(d) === i)
      const onWeekend = weekend.every((d) => f.dates.includes(d)) && f.dates.length === weekend.length
      const dates = [...f.dates].sort()
      return (
        <Step bar={bar} onBack={back(1)} question="When?" sub="Tap the days that could work. Then tap when you're free."
          primary="Next" primaryDisabled={!f.dates.length || !f.slots.length || busy}
          onPrimary={() => run(async () => { await patchPlan({ dates }); await patchMe({ availability: f.slots, tz: myTz() }); go(3) })}
          next={f.dates.length && !f.slots.length ? 'Now tap when you are free on those days.' : 'Friends only pick from these days. Nobody is asked twice.'}>
          <div className="flex flex-wrap gap-2">
            <Chip on={onWeekend} onClick={() => set({ dates: onWeekend ? [] : weekend })}>This weekend</Chip>
            {f.dates.length > 0 && <Chip onClick={() => set({ dates: [], slots: [] })}>Clear dates</Chip>}
          </div>
          <Calendar selected={f.dates} onToggle={(d) => set({ dates: f.dates.includes(d) ? f.dates.filter((x) => x !== d) : [...f.dates, d] })} />
          {dates.length > 0 && (
            <div className="flex flex-col gap-3 border-2 border-ink bg-spot-sky p-4">
              <span className="display text-xl">When are you free?</span>
              {f.planId && <FreeTimes key={dates.join()} planId={f.planId} member={f.member} days={dates} slots={f.slots} onChange={(slots) => set({ slots })} />}
            </div>
          )}
          {err && <ErrorBox message={err} />}
        </Step>
      )
    }
    case 3: {
      const dates = (plan?.dates.length ? plan.dates : f.dates).slice().sort()
      const answered = members.filter((m) => m.free_days?.length)
      return (
        <Step bar={bar} onBack={back(2)} question="Who decides the details?"
          primary="Next" primaryDisabled={busy}
          onPrimary={() => run(async () => {
            local.setLastPicks(f.picks)
            await patchPlan({ decide: f.decide, details: f.decide === 'planner' ? f.picks : null,
              locks: { ...(plan?.locks ?? {}), day: undefined, time: f.startTime || undefined, end_time: f.startTime && f.endTime ? f.endTime : undefined } })
            await patchMe({ picks: { ...f.picks, best_day: f.bestDay || undefined } })
            go(4)
          })}
          next="Next: who does what, and when answers close.">
          <div className="flex flex-col gap-3">
            <Tile title="Let everyone add ideas" sub="Recommended. Everyone picks; the app finds what fits all of you." on={f.decide === 'everyone'} onClick={() => set({ decide: 'everyone' })} />
            <Tile title="I'll set the details" sub="Friends only say when they're free." on={f.decide === 'planner'} onClick={() => set({ decide: 'planner' })} />
          </div>
          <div className="flex flex-col gap-4 border-2 border-ink bg-surface p-4">
            <span className="display text-xl">{f.decide === 'planner' ? 'The details' : 'Your picks'}</span>
            <PicksForm member value={f.picks} onChange={(picks) => set({ picks })} />
          </div>
          <div className="flex flex-col gap-3 border-2 border-ink bg-spot-green p-4">
            <span className="display text-xl">Which day suits you best?</span>
            <div className="border-2 border-ink bg-surface">
              {dates.map((d) => (
                <div key={d} className="flex items-center gap-3 border-b border-rule px-3 py-2 last:border-0">
                  <span className="w-28 text-base font-semibold">{fmtDay(d)}</span>
                  <span className="flex flex-1 flex-wrap gap-1" aria-label={`Free on ${fmtDay(d)}`}>
                    {answered.filter((m) => m.free_days?.includes(d)).map((m) => <Avatar key={m.pub} name={m.name} color={m.color} size={28} />)}
                  </span>
                  <Chip on={f.bestDay === d} onClick={() => set({ bestDay: f.bestDay === d ? '' : d })}>Best</Chip>
                </div>
              ))}
            </div>
            <p className="text-sm">Faces show who's free that day. Friends pick their best day too, and the app goes with the favourite.</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Start (optional)"><input type="time" className={inputCls} value={f.startTime} onChange={(e) => set({ startTime: e.target.value })} /></Field>
              <Field label="End (optional)"><input type="time" className={inputCls} value={f.endTime} disabled={!f.startTime} onChange={(e) => set({ endTime: e.target.value })} /></Field>
            </div>
          </div>
          {err && <ErrorBox message={err} />}
        </Step>
      )
    }
    case 4: {
      const dl = f.deadline || defaultDeadline([...f.dates].sort()[0])
      const people = members.filter((m) => m.status !== 'declined')
      return (
        <Step bar={bar} onBack={back(3)} question="Share the work" sub="Jobs go to whoever has done the least planning lately. Drag to rearrange."
          primary={editId && plan?.status !== 'draft' ? 'Save changes' : busy ? 'Sending...' : 'Send the invite'} primaryDisabled={busy}
          onPrimary={() => run(async () => {
            await patchPlan({ deadline: new Date(dl).toISOString(), work: f.work, send: true })
            await patchMe({ status: 'answered' })
            local.addPlan({ id: f.planId!, member: f.member!, title: f.kind === 'other' ? f.kindOther : KIND_LABEL[f.kind] })
            if (editId) return nav(`/p/${editId}`)
            local.clearDraft()
            set({ sent: true, step: 5 })
          })}
          next="After the deadline, the app plans with whoever answered.">
          <div className="grid grid-cols-2 border-2 border-ink" role="radiogroup" aria-label="Who does the work">
            {(['share', 'solo'] as const).map((w) => (
              <button key={w} type="button" role="radio" aria-checked={f.work === w} disabled={busy}
                onClick={() => { set({ work: w }); run(async () => { await patchPlan({ work: w }); setPlan(await api<Plan>(`/plans/${f.planId}/plan-tasks`, { body: {}, member: f.member })) }) }}
                className={`min-h-12 text-base font-semibold ${f.work === w ? 'bg-ink text-surface' : 'bg-surface'}`}>
                {w === 'share' ? 'Share the work' : "I'll handle it all"}
              </button>
            ))}
          </div>
          {plan && plan.tasks.length === 0 && (
            <Button variant="secondary" disabled={busy} onClick={() => run(async () => { setPlan(await api<Plan>(`/plans/${f.planId}/plan-tasks`, { body: {}, member: f.member })) })}>
              Make the task list
            </Button>
          )}
          {plan && plan.tasks.length > 0 && (
            <TaskBoard tasks={plan.tasks} people={people} me={plan.me?.pub} isPlanner busy={busy}
              onMove={(tid, to) => run(async () => setPlan(await api<Plan>(`/plans/${f.planId}/task-move/${tid}`, { body: { to }, member: f.member })))}
              onAsk={(tid, to) => run(async () => setPlan(await api<Plan>(`/plans/${f.planId}/task-ask/${tid}`, { body: { to }, member: f.member })))} />
          )}
          <Field label="Answer by">
            <input type="datetime-local" className={inputCls} value={dl} onChange={(e) => set({ deadline: e.target.value })} />
          </Field>
          {err && <ErrorBox message={err} />}
        </Step>
      )
    }
    default:
      return (
        <Step question="Send the invite" sub="Paste it in your group chat, or send it any way you like."
          primary="Go to the plan" onPrimary={() => nav(`/p/${f.planId}`)}
          next="You'll see friends' answers on the plan page.">
          {f.planId && (
            <div className="border-2 border-ink bg-spot-mustard p-4">
              <Share id={f.planId} message={`${f.me.trim()} is planning ${f.kind === 'other' ? f.kindOther : `a ${KIND_LABEL[f.kind].toLowerCase().replace(' / online', '')}`}. Open this link to plan with me:`} />
            </div>
          )}
        </Step>
      )
  }
}
