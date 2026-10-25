import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, fmtDay, fmtRange, fmtTime, local, names, planName, type Member, type Option, type Plan, type Task } from '../api'
import Share, { inviteText } from '../components/Share'
import { Avatar, AvatarRow, Button, Card, ErrorBox, Field, Help, inputCls, Progress, Sheet, useToast, Working } from '../components/ui'

const POLL_MS = 8000

export default function PlanPage() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const member = local.memberFor(id)
  const [plan, setPlan] = useState<Plan | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [menu, setMenu] = useState(false)
  const autoGen = useRef(false)

  const load = useCallback(() => api<Plan>(`/plans/${id}`, { member }).then(setPlan).catch((e) => setErr(e.message)), [id, member])

  useEffect(() => {
    if (!member) {
      nav(`/p/${id}/answer`, { replace: true })
      return
    }
    load()
    const t = window.setInterval(() => { if (!document.hidden) load() }, POLL_MS)
    return () => window.clearInterval(t)
  }, [id, member, load, nav])

  const act = useCallback(async (path: string, body?: unknown, ok?: string) => {
    setBusy(true)
    setErr('')
    try {
      const p = await api<Plan>(`/plans/${id}${path}`, { body: body ?? {}, member })
      setPlan(p)
      if (ok) toast(ok)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }, [id, member, toast])

  // When the answers are in, the app plans by itself; nobody has to press anything
  useEffect(() => {
    if (plan && plan.status === 'answers' && plan.answers_ready && !plan.generating && !autoGen.current && !plan.problem) {
      autoGen.current = true
      act('/generate')
    }
  }, [plan, act])

  if (err && !plan) return <div className="pt-12"><ErrorBox message={err} fix="Try again" onFix={() => { setErr(''); load() }} /></div>
  if (!plan) return <Working lines={['Opening the plan...']} />

  const byPub = Object.fromEntries(plan.members.map((m) => [m.pub, m]))
  const answered = plan.members.filter((m) => m.status === 'answered')
  const waiting = plan.members.filter((m) => m.status === 'invited')
  const invitedCount = plan.members.filter((m) => m.status !== 'declined').length
  const planner = byPub[plan.planner]
  const chosen = plan.options.find((o) => o.id === plan.chosen)
  const generating = busy && plan.status === 'answers' && plan.answers_ready || plan.generating
  const me = plan.me

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-start justify-between gap-3 pt-2">
        <div>
          <h1 className="text-xl font-bold">{planName(plan)}</h1>
          <p className="text-base text-ink-soft">
            {planner?.name}'s plan, {fmtDay(plan.start_day)}{plan.end_day !== plan.start_day ? ` to ${fmtDay(plan.end_day)}` : ''}
          </p>
        </div>
        <Button variant="secondary" onClick={() => setMenu(true)} aria-label="More">More</Button>
      </header>

      <Progress stage={plan.stage} answers={`${answered.length} of ${invitedCount}`} />
      <p className="text-lg font-semibold" aria-live="polite">{status(plan, waiting, answered, generating)}</p>

      {err && <ErrorBox message={err} />}

      {me && me.status !== 'answered' && me.status !== 'declined' && plan.status === 'answers' && (
        <Card className="flex flex-col gap-3">
          <p className="text-base">Add your free times so the app can count you in.</p>
          <Button onClick={() => nav(`/p/${id}/answer`)}>Add my answers</Button>
        </Card>
      )}

      {plan.status === 'answers' && !generating && (
        <AnswersView plan={plan} waiting={waiting} answered={answered} onShare={() => setSharing(true)}
          onClose={() => act('/close-answers', {}, 'Planning with who answered')} onRetry={() => { autoGen.current = false; act('/generate') }} busy={busy} />
      )}

      {generating && (
        <Working lines={[
          `Finding when all ${answered.length} of you are free...`,
          'Checking places near everyone...',
          'Making sure it fits everyone\'s budget...',
          'Making sure it\'s open then...',
          'Checking distances for each person...',
          'Almost there...',
        ]} />
      )}

      {plan.status === 'options' && (
        <OptionsView plan={plan} byPub={byPub} busy={busy}
          onVote={(oid, choice) => act('/vote', { option_id: oid, choice })}
          onLock={(oid) => act('/lock', { option_id: oid }, 'Locked. Tasks are ready.')}
          onMore={() => act('/generate', {}, 'Here are some new ideas')} />
      )}

      {(plan.status === 'locked' || plan.status === 'confirmed') && chosen && (
        <LockedView plan={plan} chosen={chosen} byPub={byPub} busy={busy} act={act} refresh={(p) => { setPlan(p); toast('Address saved') }} />
      )}

      <Sheet open={sharing} onClose={() => setSharing(false)} title="Invite people">
        <Share id={id} message={inviteText(planner?.name ?? 'A friend', `a ${planName(plan).toLowerCase()}`, plan.deadline)} />
      </Sheet>

      <Sheet open={menu} onClose={() => setMenu(false)} title="More">
        <div className="flex flex-col gap-3">
          <Button variant="secondary" onClick={() => { setMenu(false); setSharing(true) }}>Invite people</Button>
          {me && <Button variant="secondary" onClick={() => nav(`/p/${id}/answer`)}>Change my answers</Button>}
          {plan.group_id && <Button variant="secondary" onClick={() => nav(`/g/${plan.group_id}`)}>Open the group</Button>}
          {plan.is_planner && (
            <Button variant="secondary" className="text-danger" onClick={async () => {
              if (!window.confirm('Delete this plan and everyone\'s answers? This cannot be undone.')) return
              try {
                await api(`/plans/${id}`, { method: 'DELETE', member })
                local.removePlan(id)
                nav('/')
              } catch (e) { setErr((e as Error).message) }
            }}>Delete this plan</Button>
          )}
        </div>
      </Sheet>
    </div>
  )
}

function status(plan: Plan, waiting: Member[], answered: Member[], generating: boolean) {
  const dl = plan.deadline ? fmtTime(plan.deadline) : ''
  switch (plan.stage) {
    case 'answers':
      if (generating) return 'Everyone has answered. Finding options now.'
      if (plan.problem === 'no_time') return 'There is no time that works for enough people yet.'
      if (plan.problem === 'no_places') return 'We could not find anything that fits yet.'
      if (plan.problem === 'none_passed') return 'None of the ideas passed our checks.'
      if (!waiting.length) return answered.length < 2 ? 'Waiting for at least one more person to answer.' : 'Everyone has answered.'
      return `Waiting on ${names(waiting.map((m) => m.name))}.${dl ? ` Answers close ${dl}.` : ''}`
    case 'options':
      return 'Tap the ones you would go to. It locks when more than half say I\'m in.'
    case 'vote': {
      const voted = new Set(Object.values(plan.votes).flatMap((v) => [...v.in, ...v.maybe, ...v.cant]))
      const left = answered.filter((m) => !voted.has(m.pub))
      return left.length ? `${voted.size} of ${answered.length} have voted. Waiting on ${names(left.map((m) => m.name))}.` : 'Everyone has voted.'
    }
    case 'tasks': {
      if (plan.dropout && !plan.dropout.decided) return `${names(plan.dropout.names)} can't make it anymore.`
      const left = answered.filter((m) => m.confirm !== 'yes' && m.confirm !== 'no')
      return left.length ? `It's picked. Waiting on ${names(left.map((m) => m.name))} to confirm.` : 'Everyone is in.'
    }
    case 'confirmed':
      return "It's happening. See you there."
    default:
      return ''
  }
}

function AnswersView({ plan, waiting, answered, onShare, onClose, onRetry, busy }: {
  plan: Plan; waiting: Member[]; answered: Member[]; onShare: () => void; onClose: () => void; onRetry: () => void; busy: boolean
}) {
  const declined = plan.members.filter((m) => m.status === 'declined')
  return (
    <div className="flex flex-col gap-4">
      {plan.problem && (
        <ErrorBox
          message={{
            no_time: 'Nobody\'s free times overlap enough. Ask people to add more times, or pick new dates.',
            no_places: 'We could not find places that fit. Try a wider distance or online.',
            none_passed: 'Every idea broke a rule (budget, distance or time), so we did not show them.',
          }[plan.problem] ?? 'Something got stuck.'}
          fix="Try again" onFix={onRetry} />
      )}
      <Card className="flex flex-col gap-4">
        <h2 className="text-base font-semibold">Who's answered</h2>
        <PeopleList people={answered} note="Answered" />
        {waiting.length > 0 && <PeopleList people={waiting} note="Not yet" dim />}
        {declined.length > 0 && <PeopleList people={declined} note="Can't make it" dim />}
      </Card>
      <div className="flex flex-col gap-2">
        <Button variant="secondary" full onClick={onShare}>Invite more people</Button>
        {plan.is_planner && waiting.length > 0 && answered.length >= 1 && (
          <Button variant="text" onClick={onClose} disabled={busy}>Don't wait, plan with who's answered</Button>
        )}
      </div>
      <p className="text-sm text-ink-soft">When the answers are in, the app finds times and options by itself.</p>
    </div>
  )
}

function PeopleList({ people, note, dim }: { people: Member[]; note: string; dim?: boolean }) {
  return (
    <ul className="flex flex-col gap-2">
      {people.map((m) => (
        <li key={m.pub} className="flex items-center gap-3">
          <Avatar name={m.name} color={m.color} dim={dim} />
          <span className="flex-1 text-base">{m.name}{m.is_planner ? ' (planner)' : ''}</span>
          <span className="text-sm text-ink-soft">{note}</span>
        </li>
      ))}
    </ul>
  )
}

function OptionCard({ o, plan, byPub, children }: { o: Option; plan: Plan; byPub: Record<string, Member>; children?: React.ReactNode }) {
  const where = o.kind === 'online' ? 'Online' : o.kind === 'home' ? `At ${o.host}'s home` : o.place
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-lg font-bold">{o.title}</h3>
        {o.checked && (
          <span className="inline-flex shrink-0 items-center rounded-full bg-ok-soft px-3 py-1 text-sm font-semibold text-ok">
            Checked
            <Help text="We checked times, budgets, distance and opening hours for everyone." />
          </span>
        )}
      </div>
      <p className="text-base">{o.what}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-base">
        <dt className="text-ink-soft">When</dt><dd className="font-semibold">{fmtRange(o.start, o.end)}</dd>
        <dt className="text-ink-soft">Where</dt>
        <dd>{where}{o.address && o.kind !== 'home' ? <span className="block text-sm text-ink-soft">{o.address}</span> : null}</dd>
        <dt className="text-ink-soft">Cost</dt><dd className="font-semibold">{o.cost_per_person ? `About $${o.cost_per_person} each` : 'Free'}</dd>
        {o.weather && (<><dt className="text-ink-soft">Weather</dt><dd>{o.weather}</dd></>)}
      </dl>
      {o.distances && Object.keys(o.distances).length > 0 && (
        <div className="flex flex-wrap gap-3" aria-label="Distance for each person">
          {Object.entries(o.distances).map(([pub, km]) => byPub[pub] && (
            <span key={pub} className="inline-flex items-center gap-2 text-sm">
              <Avatar name={byPub[pub].name} color={byPub[pub].color} size={28} />{km < 1 ? 'under 1 km' : `${Math.round(km)} km`}
            </span>
          ))}
        </div>
      )}
      {o.kind === 'online' && o.how && o.how.length > 0 && (
        <details className="text-base">
          <summary className="min-h-12 cursor-pointer content-center font-semibold">How it works</summary>
          <ol className="list-decimal pl-6">{o.how.map((h, i) => <li key={i}>{h}</li>)}</ol>
          {o.link && <a className="text-accent underline" href={o.link} target="_blank" rel="noreferrer">{o.link.replace('https://', '')}</a>}
        </details>
      )}
      {o.why && <p className="text-sm text-ink-soft">{o.why}</p>}
      {plan && children}
    </Card>
  )
}

function OptionsView({ plan, byPub, busy, onVote, onLock, onMore }: {
  plan: Plan; byPub: Record<string, Member>; busy: boolean
  onVote: (oid: string, choice: string) => void; onLock: (oid: string) => void; onMore: () => void
}) {
  const mine = plan.me?.pub
  return (
    <div className="flex flex-col gap-4">
      {plan.options.map((o) => {
        const t = plan.votes[o.id] ?? { in: [], maybe: [], cant: [] }
        const my = t.in.includes(mine ?? '') ? 'in' : t.maybe.includes(mine ?? '') ? 'maybe' : t.cant.includes(mine ?? '') ? 'cant' : null
        return (
          <OptionCard key={o.id} o={o} plan={plan} byPub={byPub}>
            <div className="grid grid-cols-3 gap-2" role="group" aria-label={`Vote on ${o.title}`}>
              {([['in', "I'm in"], ['maybe', 'Maybe'], ['cant', "Can't"]] as const).map(([c, label]) => (
                <button key={c} type="button" disabled={busy} aria-pressed={my === c} onClick={() => onVote(o.id, c)}
                  className={`min-h-12 rounded-[var(--radius-card)] border-2 text-base font-semibold ${my === c ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface'}`}>
                  {label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm text-ink-soft">
              {t.in.length > 0 && <span className="inline-flex items-center gap-2"><AvatarRow size={28} people={t.in.map((p) => byPub[p]).filter(Boolean)} /> in</span>}
              {t.maybe.length > 0 && <span className="inline-flex items-center gap-2"><AvatarRow size={28} people={t.maybe.map((p) => byPub[p]).filter(Boolean)} /> maybe</span>}
              {t.cant.length > 0 && <span className="inline-flex items-center gap-2"><AvatarRow size={28} people={t.cant.map((p) => byPub[p]).filter(Boolean)} /> can't</span>}
            </div>
            {plan.is_planner && <Button variant="text" className="self-start" disabled={busy} onClick={() => onLock(o.id)}>Lock this one</Button>}
          </OptionCard>
        )
      })}
      <Button variant="secondary" disabled={busy} onClick={onMore}>{busy ? 'Thinking...' : 'Show me other ideas'}</Button>
      {plan.problem === 'no_more' && <p className="text-sm text-ink-soft">No other ideas passed our checks, so we kept these.</p>}
    </div>
  )
}

function LockedView({ plan, chosen, byPub, busy, act, refresh }: {
  plan: Plan; chosen: Option; byPub: Record<string, Member>; busy: boolean; act: (path: string, body?: unknown, ok?: string) => void
  refresh: (p: Plan) => void
}) {
  const me = plan.me
  const confirmed = plan.status === 'confirmed'
  const iAmHost = chosen.kind === 'home' && chosen.host_pub === me?.pub
  const [addr, setAddr] = useState(me?.host_address ?? '')
  const directions = chosen.kind === 'place' || chosen.kind === 'event'
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${chosen.place ?? ''} ${chosen.address ?? ''}`)}`
    : chosen.kind === 'home' && plan.host_address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(plan.host_address)}` : null
  return (
    <div className="flex flex-col gap-4">
      {me && me.status === 'answered' && !me.confirm && (
        <Card className="flex flex-col gap-3 border-2 border-accent">
          <p className="text-lg font-semibold">This is happening: {chosen.title}. Still in?</p>
          <div className="grid grid-cols-2 gap-2">
            <Button disabled={busy} onClick={() => act('/confirm', { choice: 'yes' }, "You're confirmed")}>Confirm</Button>
            <Button variant="secondary" disabled={busy} onClick={() => act('/confirm', { choice: 'no' }, 'Got it. We let the group know.')}>Can't anymore</Button>
          </div>
        </Card>
      )}
      {plan.is_planner && plan.dropout && !plan.dropout.decided && (
        <Card className="flex flex-col gap-3">
          <p className="text-base">{names(plan.dropout.names)} can't make it. Go ahead with {plan.members.filter((m) => m.status === 'answered' && m.confirm !== 'no').length}, or find a new time?</p>
          <div className="grid grid-cols-2 gap-2">
            <Button disabled={busy} onClick={() => act('/dropout', { decision: 'go_ahead' })}>Go ahead</Button>
            <Button variant="secondary" disabled={busy} onClick={() => act('/dropout', { decision: 'new_time' }, 'Asking everyone for new times')}>Find a new time</Button>
          </div>
        </Card>
      )}

      {confirmed && <p className="font-hand text-2xl">{chosen.title}</p>}
      <OptionCard o={chosen} plan={plan} byPub={byPub}>
        {chosen.kind === 'home' && (
          plan.host_address ? <p className="text-base"><span className="text-ink-soft">Address: </span><b>{plan.host_address}</b></p>
            : <p className="text-sm text-ink-soft">{me?.confirm === 'yes' ? `${chosen.host} hasn't added the address yet.` : 'The address shows here once you confirm.'}</p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <a className="inline-flex min-h-12 items-center justify-center rounded-[var(--radius-card)] bg-accent px-4 text-base font-semibold text-accent-ink"
            href={`/api/plans/${plan.id}/invite.ics?m=${encodeURIComponent(me?.id ?? '')}`}>Add to calendar</a>
          {directions ? (
            <a className="inline-flex min-h-12 items-center justify-center rounded-[var(--radius-card)] border-2 border-line bg-surface px-4 text-base font-semibold" href={directions} target="_blank" rel="noreferrer">Directions</a>
          ) : chosen.link ? (
            <a className="inline-flex min-h-12 items-center justify-center rounded-[var(--radius-card)] border-2 border-line bg-surface px-4 text-base font-semibold" href={chosen.link} target="_blank" rel="noreferrer">Open link</a>
          ) : null}
        </div>
      </OptionCard>

      {iAmHost && (
        <Card className="flex flex-col gap-3">
          <Field label="Your address" hint="Only people who confirmed will see it.">
            <input className={inputCls} value={addr} autoComplete="street-address" onChange={(e) => setAddr(e.target.value)} />
          </Field>
          <Button variant="secondary" disabled={busy || !addr.trim()} onClick={async () => {
            refresh(await api<Plan>(`/plans/${plan.id}/me`, { method: 'PATCH', body: { host_address: addr.trim() }, member: me?.id }))
          }}>Save address</Button>
        </Card>
      )}

      <Card className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Tasks{plan.work === 'share' && <Help text="Jobs go to whoever has done the least planning lately. Swap if one doesn't suit you." />}</h2>
        <ul className="flex flex-col gap-3">
          {plan.tasks.map((t) => <TaskRow key={t.id} t={t} owner={byPub[t.assignee]} busy={busy} plan={plan} act={act} />)}
        </ul>
        <p className="text-sm text-ink-soft">The app never books or pays for anything. Booking is a task with a link.</p>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Who's going</h2>
        <ul className="flex flex-col gap-2">
          {plan.members.filter((m) => m.status === 'answered').map((m) => (
            <li key={m.pub} className="flex items-center gap-3">
              <Avatar name={m.name} color={m.color} dim={m.confirm === 'no'} />
              <span className="flex-1">{m.name}</span>
              <span className="text-sm text-ink-soft">{m.confirm === 'yes' ? 'Confirmed' : m.confirm === 'no' ? "Can't make it" : 'Not confirmed yet'}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}

function TaskRow({ t, owner, busy, plan, act }: { t: Task; owner?: Member; busy: boolean; plan: Plan; act: (path: string, body?: unknown, ok?: string) => void }) {
  const canTick = t.mine || plan.is_planner
  return (
    <li className="flex flex-col gap-2 border-b border-line pb-3 last:border-0 last:pb-0">
      <div className="flex items-center gap-3">
        <button type="button" disabled={!canTick || busy} aria-pressed={t.done} aria-label={`Mark ${t.title} done`}
          onClick={() => act(`/tasks/${t.id}/done`)}
          className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 ${t.done ? 'border-ok bg-ok text-white' : 'border-line bg-surface'}`}>
          {t.done && <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12l5 5 9-10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
        </button>
        <div className="flex-1">
          <p className={`text-base font-semibold ${t.done ? 'text-ink-soft line-through' : ''}`}>{t.title}</p>
          <p className="text-sm text-ink-soft">{owner ? (t.mine ? 'You' : owner.name) : 'Nobody yet'}, by {fmtTime(t.due)}</p>
        </div>
        {owner && <Avatar name={owner.name} color={owner.color} size={32} />}
      </div>
      {!t.done && (
        <div className="flex flex-wrap gap-2 pl-15">
          {t.mine && !t.swap_open && <Button variant="text" disabled={busy} onClick={() => act(`/tasks/${t.id}/swap`, {}, 'Offered to the group')}>Swap</Button>}
          {t.mine && t.swap_open && (
            <>
              <span className="content-center text-sm text-ink-soft">Offered to the group.</span>
              <Button variant="text" disabled={busy} onClick={() => act(`/tasks/${t.id}/reassign`, {}, 'The app handed it to someone else')}>Let the app reassign it</Button>
            </>
          )}
          {!t.mine && t.swap_open && plan.me?.status === 'answered' && (
            <Button variant="secondary" disabled={busy} onClick={() => act(`/tasks/${t.id}/take`, {}, 'It\'s yours now')}>Take this task</Button>
          )}
        </div>
      )}
    </li>
  )
}
