import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { addDays, api, daysBetween, fmtDay, KIND_LABEL, local, myTz, nextWeek, parseDay, thisWeekend, ymd, type Group, type Picks } from '../api'
import PicksForm, { DEFAULT_PICKS } from '../components/PicksForm'
import Share, { inviteText } from '../components/Share'
import { Avatar, Button, Chip, ErrorBox, Field, inputCls, Screen, Tile } from '../components/ui'
import { MEMBER_COLORS } from '../config'

type Person = { name: string; email: string }
type Draft = {
  step: number
  kind: string
  kindOther: string
  when: 'weekend' | 'nextweek' | 'pick' | 'soon'
  start: string
  end: string
  me: string
  people: Person[]
  groupId: string | null
  saveGroup: string
  decide: 'everyone' | 'planner'
  details: Picks
  locks: { place: string; day: string; time: string }
  work: 'share' | 'solo'
  deadline: string
}

const KINDS = [
  { value: 'hangout', sub: 'Coffee, a walk, whatever' },
  { value: 'meal', sub: 'Lunch, dinner, brunch' },
  { value: 'date', sub: 'Just the two of you' },
  { value: 'call', sub: 'Games, watch party, catch-up' },
  { value: 'trip', sub: 'A day out or a weekend away' },
  { value: 'other', sub: 'Tell us what' },
]

function range(when: Draft['when'], start: string, end: string) {
  if (when === 'weekend') return thisWeekend()
  if (when === 'nextweek') return nextWeek()
  if (when === 'soon') return { start: ymd(new Date()), end: ymd(addDays(new Date(), 1)) }
  return { start, end }
}

/** datetime-local value for the default reply deadline: the evening before it starts, but at least 3 hours from now. */
function defaultDeadline(startDay: string) {
  const before = addDays(parseDay(startDay), -1)
  before.setHours(18, 0, 0, 0)
  const soonest = new Date(Date.now() + 3 * 3600_000)
  const max = new Date(Date.now() + 3 * 86400_000)
  let d = before < soonest ? soonest : before
  if (d > max) d = max
  d.setMinutes(0, 0, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fresh(bored: boolean): Draft {
  const w = thisWeekend()
  return {
    step: bored ? 2 : 0,
    kind: 'hangout',
    kindOther: '',
    when: bored ? 'soon' : 'weekend',
    start: w.start,
    end: w.end,
    me: local.name(),
    people: [{ name: '', email: '' }],
    groupId: null,
    saveGroup: '',
    decide: 'everyone',
    details: local.lastPicks() ?? DEFAULT_PICKS,
    locks: { place: '', day: '', time: '' },
    work: 'share',
    deadline: '',
  }
}

export default function NewPlan() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const bored = params.get('bored') === '1'
  const groupParam = params.get('group')
  const [d, setD] = useState<Draft>(() => {
    const saved = local.draft<Draft>()
    return saved && !bored && !groupParam ? saved : fresh(bored)
  })
  const [groups, setGroups] = useState<Group[]>([])
  const [created, setCreated] = useState<{ id: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  // Answers autosave as you go
  useEffect(() => {
    if (!created) local.setDraft(d)
  }, [d, created])

  useEffect(() => {
    Promise.all(local.groups().map((g) => api<Group>(`/groups/${g.id}`).catch(() => null))).then((gs) => {
      const ok = gs.filter(Boolean) as Group[]
      setGroups(ok)
      if (groupParam) {
        const g = ok.find((x) => x.id === groupParam)
        if (g) pickGroup(g)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }))
  const go = (step: number) => set({ step })
  const r = range(d.when, d.start, d.end)
  const days = useMemo(() => daysBetween(r.start, r.end, 31), [r.start, r.end])
  const others = d.people.filter((p) => p.name.trim())

  function pickGroup(g: Group) {
    const me = (local.name() || d.me).trim().toLowerCase()
    setD((x) => ({
      ...x,
      groupId: g.id,
      people: g.members.filter((m) => m.name.trim().toLowerCase() !== me).map((m) => ({ name: m.name, email: m.email })),
      me: x.me || g.members[0]?.name || '',
    }))
  }

  async function create() {
    setBusy(true)
    setErr('')
    try {
      local.setName(d.me.trim())
      if (d.decide === 'planner') local.setLastPicks(d.details)
      const res = await api<{ plan_id: string; member_id: string }>('/plans', {
        body: {
          kind: d.kind,
          kind_other: d.kindOther,
          start_day: r.start,
          end_day: r.end,
          when_label: d.when,
          decide: d.decide,
          details: d.decide === 'planner' ? d.details : null,
          locks: Object.fromEntries(Object.entries(d.locks).filter(([, v]) => v)),
          work: d.work,
          deadline: new Date(d.deadline || defaultDeadline(r.start)).toISOString(),
          planner: { name: d.me.trim() },
          tz: myTz(),
          people: others,
          group_id: d.groupId,
          save_group_as: d.groupId ? '' : d.saveGroup,
        },
      })
      const title = d.kind === 'other' && d.kindOther ? d.kindOther : KIND_LABEL[d.kind]
      local.addPlan({ id: res.plan_id, member: res.member_id, title })
      const p = await api<{ group_id?: string }>(`/plans/${res.plan_id}`, { member: res.member_id })
      if (p.group_id && !d.groupId) local.addGroup({ id: p.group_id, name: d.saveGroup })
      local.clearDraft()
      setCreated({ id: res.plan_id })
      go(8)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const back = (to: number) => () => (to < 0 ? nav('/') : go(to))
  const total = 8
  const stepLabel = (n: number) => `${n + 1} of ${total}`

  switch (d.step) {
    case 0:
      return (
        <Screen question="What are we planning?" step={stepLabel(0)} onBack={back(-1)} primary="Next" onPrimary={() => go(1)}
          primaryDisabled={d.kind === 'other' && !d.kindOther.trim()} next="Next: roughly when.">
          <div className="grid grid-cols-2 gap-3">
            {KINDS.map((k) => (
              <Tile key={k.value} title={KIND_LABEL[k.value]} sub={k.sub} on={d.kind === k.value} onClick={() => set({ kind: k.value })} />
            ))}
          </div>
          {d.kind === 'other' && (
            <Field label="What is it?">
              <input autoFocus className={inputCls} value={d.kindOther} placeholder="Movie night, birthday, study session" onChange={(e) => set({ kindOther: e.target.value })} />
            </Field>
          )}
        </Screen>
      )
    case 1:
      return (
        <Screen question="Roughly when?" step={stepLabel(1)} onBack={back(0)} primary="Next" onPrimary={() => go(2)}
          primaryDisabled={d.when === 'pick' && (!d.start || !d.end || d.end < d.start)}
          next={`Everyone will pick their free times between ${fmtDay(r.start)} and ${fmtDay(r.end)}.`}>
          <div className="flex flex-wrap gap-2">
            <Chip on={d.when === 'soon'} onClick={() => set({ when: 'soon' })}>Today or tomorrow</Chip>
            <Chip on={d.when === 'weekend'} onClick={() => set({ when: 'weekend' })}>This weekend</Chip>
            <Chip on={d.when === 'nextweek'} onClick={() => set({ when: 'nextweek' })}>Next week</Chip>
            <Chip on={d.when === 'pick'} onClick={() => set({ when: 'pick' })}>Pick dates</Chip>
          </div>
          {d.when === 'pick' && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="From">
                <input type="date" className={inputCls} value={d.start} min={ymd(new Date())} onChange={(e) => set({ start: e.target.value, end: d.end < e.target.value ? e.target.value : d.end })} />
              </Field>
              <Field label="To">
                <input type="date" className={inputCls} value={d.end} min={d.start} onChange={(e) => set({ end: e.target.value })} />
              </Field>
            </div>
          )}
        </Screen>
      )
    case 2:
      return (
        <Screen question="Who's coming?" step={stepLabel(2)} onBack={back(bored ? -1 : 1)} primary="Next" onPrimary={() => go(3)}
          primaryDisabled={!d.me.trim()} next="Anyone you don't add can still join from the link.">
          <Field label="Your name">
            <input className={inputCls} value={d.me} autoComplete="given-name" onChange={(e) => set({ me: e.target.value })} />
          </Field>
          {groups.length > 0 && (
            <Field label="Pick a saved group">
              <div className="flex flex-wrap gap-2">
                {groups.map((g) => (
                  <Chip key={g.id} on={d.groupId === g.id} onClick={() => (d.groupId === g.id ? set({ groupId: null, people: [{ name: '', email: '' }] }) : pickGroup(g))}>
                    {g.name}
                  </Chip>
                ))}
              </div>
            </Field>
          )}
          <div className="flex flex-col gap-3">
            <span className="text-base font-semibold">Friends</span>
            {d.people.map((p, i) => (
              <div key={i} className="flex items-center gap-2">
                <Avatar name={p.name || '?'} color={MEMBER_COLORS[(i + 1) % MEMBER_COLORS.length].hex} size={40} />
                <input aria-label={`Friend ${i + 1} name`} className={inputCls} placeholder="Name" value={p.name}
                  onChange={(e) => set({ people: d.people.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                <input aria-label={`Friend ${i + 1} email (optional)`} className={`${inputCls} max-sm:hidden`} placeholder="Email (optional)" type="email" value={p.email}
                  onChange={(e) => set({ people: d.people.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)) })} />
                {d.people.length > 1 && (
                  <Button variant="text" aria-label={`Remove ${p.name || 'friend'}`} onClick={() => set({ people: d.people.filter((_, j) => j !== i) })}>Remove</Button>
                )}
              </div>
            ))}
            <Button variant="secondary" onClick={() => set({ people: [...d.people, { name: '', email: '' }] })}>Add someone</Button>
          </div>
          {!d.groupId && others.length > 0 && (
            <Field label="Save as a group for next time? (optional)">
              <input className={inputCls} placeholder="College friends, Family" value={d.saveGroup} onChange={(e) => set({ saveGroup: e.target.value })} />
            </Field>
          )}
        </Screen>
      )
    case 3:
      return (
        <Screen question="Who decides the details?" step={stepLabel(3)} onBack={back(2)} primary="Next" onPrimary={() => go(d.decide === 'planner' ? 4 : 5)}
          next={d.decide === 'everyone' ? 'Everyone picks their budget, distance and mood. The app finds what fits all of you.' : 'You set budget, place and mood now. Friends only say when they are free.'}>
          <div className="flex flex-col gap-3">
            <Tile title="Let everyone add ideas" sub="Recommended. The app finds what fits everyone." on={d.decide === 'everyone'} onClick={() => set({ decide: 'everyone' })} />
            <Tile title="I'll set the details" sub="Friends only give their free times." on={d.decide === 'planner'} onClick={() => set({ decide: 'planner' })} />
          </div>
        </Screen>
      )
    case 4:
      return (
        <Screen question="The details" sub="Every choice has a no-preference option." step={stepLabel(4)} onBack={back(3)} primary="Next" onPrimary={() => go(5)}
          next="Next: anything already decided.">
          <PicksForm value={d.details} onChange={(details) => set({ details })} />
        </Screen>
      )
    case 5:
      return (
        <Screen question="Already know anything?" sub="Optional. Skip if nothing is decided." step={stepLabel(5)} onBack={back(d.decide === 'planner' ? 4 : 3)}
          primary={d.locks.place || d.locks.day || d.locks.time ? 'Next' : 'Skip'} onPrimary={() => go(6)}
          next="Every option we suggest will stick to what you lock here.">
          <Field label="Place">
            <input className={inputCls} placeholder="e.g. Cubbon Park" value={d.locks.place} onChange={(e) => set({ locks: { ...d.locks, place: e.target.value } })} />
          </Field>
          <Field label="Day">
            <div className="flex flex-wrap gap-2">
              <Chip on={!d.locks.day} onClick={() => set({ locks: { ...d.locks, day: '' } })}>Any day</Chip>
              {days.map((day) => (
                <Chip key={day} on={d.locks.day === day} onClick={() => set({ locks: { ...d.locks, day } })}>{fmtDay(day)}</Chip>
              ))}
            </div>
          </Field>
          <Field label="Start time">
            <input type="time" className={inputCls} value={d.locks.time} onChange={(e) => set({ locks: { ...d.locks, time: e.target.value } })} />
          </Field>
        </Screen>
      )
    case 6:
      return (
        <Screen question="Want help with the work?" step={stepLabel(6)} onBack={back(5)} primary="Next" onPrimary={() => go(7)}
          next={d.work === 'share' ? 'Jobs like booking and snacks go to whoever has done the least planning lately.' : 'All the jobs go to you.'}>
          <div className="flex flex-col gap-3">
            <Tile title="Share the work" sub="Recommended. Jobs are split fairly." on={d.work === 'share'} onClick={() => set({ work: 'share' })} />
            <Tile title="I'll handle it all" sub="You get every job." on={d.work === 'solo'} onClick={() => set({ work: 'solo' })} />
          </div>
        </Screen>
      )
    case 7: {
      const dl = d.deadline || defaultDeadline(r.start)
      return (
        <Screen question="Answer by" sub="After this, the app plans with whoever answered." step={stepLabel(7)} onBack={back(6)}
          primary={busy ? 'Creating...' : 'Create the invite'} primaryDisabled={busy} onPrimary={create}
          next="Next: you send one link to the group.">
          <Field label="Reply deadline">
            <input type="datetime-local" className={inputCls} value={dl} onChange={(e) => set({ deadline: e.target.value })} />
          </Field>
          {err && <ErrorBox message={err} fix="Try again" onFix={create} />}
        </Screen>
      )
    }
    default: {
      if (!created) return null
      const what = d.kind === 'other' && d.kindOther ? d.kindOther : `a ${KIND_LABEL[d.kind].toLowerCase().replace(' / online', '')}`
      return (
        <Screen question="Send the invite" sub="Paste it in your group chat, or send it any way you like." back={false}
          secondary={<Button variant="secondary" full onClick={() => nav(`/p/${created.id}/answer`)}>Next: add your own free times</Button>}
          next="When friends answer, you'll see them on the plan page.">
          <Share id={created.id} message={inviteText(d.me.trim(), what, new Date(d.deadline || defaultDeadline(r.start)).toISOString())} />
        </Screen>
      )
    }
  }
}
