import { useRef, useState } from 'react'
import { fmtTime, type Member, type Task } from '../api'
import { Avatar, Button, Sheet } from './ui'

/** One row per person, in their color. Tasks are boxes: the planner drags them between people (or taps and
 *  picks a person); anyone can tap their own task and ask someone "Can we swap?". */
export default function TaskBoard({ tasks, people, me, isPlanner, busy, onMove, onAsk, onAction }: {
  tasks: Task[]
  people: Member[]
  me?: string
  isPlanner: boolean
  busy?: boolean
  onMove: (taskId: string, toPub: string) => void
  onAsk: (taskId: string, toPub: string) => void
  onAction?: (taskId: string, action: 'done' | 'take' | 'decline' | 'unswap') => void
}) {
  const [picked, setPicked] = useState<Task | null>(null)
  const [drag, setDrag] = useState<{ id: string; x: number; y: number; over: string | null } | null>(null)
  const start = useRef<{ x: number; y: number; id: string } | null>(null)
  const byPub = Object.fromEntries(people.map((p) => [p.pub, p]))

  function rowAt(x: number, y: number) {
    const el = document.elementFromPoint(x, y)?.closest('[data-person]') as HTMLElement | null
    return el?.dataset.person ?? null
  }

  const onDown = (t: Task) => (e: React.PointerEvent) => {
    if (!isPlanner || busy) return
    start.current = { x: e.clientX, y: e.clientY, id: t.id }
  }
  const onMoveP = (e: React.PointerEvent) => {
    const s = start.current
    if (!s) return
    if (!drag && Math.hypot(e.clientX - s.x, e.clientY - s.y) < 8) return // a tap, not a drag
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    setDrag({ id: s.id, x: e.clientX, y: e.clientY, over: rowAt(e.clientX, e.clientY) })
  }
  const onUp = (t: Task) => (e: React.PointerEvent) => {
    const wasDrag = drag
    start.current = null
    setDrag(null)
    if (wasDrag) {
      const to = rowAt(e.clientX, e.clientY)
      if (to && to !== t.assignee) onMove(t.id, to)
      return
    }
    setPicked(t)
  }

  const dragged = drag ? tasks.find((t) => t.id === drag.id) : null
  return (
    <div className="flex flex-col gap-3 select-none" onPointerMove={onMoveP} data-noswipe>
      <div className="border-2 border-ink bg-surface">
        {people.map((p) => {
          const mine = tasks.filter((t) => t.assignee === p.pub)
          const load = mine.reduce((n, t) => n + t.weight, 0)
          return (
            <div key={p.pub} data-person={p.pub}
              className={`flex min-h-20 flex-col gap-2 border-b-2 border-ink p-3 last:border-b-0 ${drag?.over === p.pub ? 'bg-accent-soft' : ''}`}
              style={{ borderLeft: `10px solid ${p.color}` }}>
              <div className="flex items-center gap-2">
                <Avatar name={p.name} color={p.color} size={28} />
                <span className="flex-1 text-base font-semibold">{p.pub === me ? `${p.name} (you)` : p.name}</span>
                <span className="label text-ink-soft" aria-label={`Load ${load}`}>Load {load}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {mine.length === 0 && <span className="font-hand text-base text-ink-soft">{isPlanner ? 'Drop a task here' : 'Nothing yet'}</span>}
                {mine.map((t) => (
                  <button key={t.id} type="button" disabled={busy}
                    onPointerDown={onDown(t)} onPointerUp={onUp(t)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPicked(t) } }}
                    aria-label={`${t.title}, ${p.name}${t.done ? ', done' : ''}${t.swap_open ? ', swap requested' : ''}. Tap for options.`}
                    className={`min-h-12 touch-none border-2 border-ink px-3 py-2 text-left text-sm font-semibold ${drag?.id === t.id ? 'opacity-30' : ''} ${t.done ? 'line-through opacity-60' : ''}`}
                    style={{ background: `color-mix(in srgb, ${p.color} 18%, var(--surface))` }}>
                    {t.title}
                    <span className="block font-hand text-base font-normal">
                      {'*'.repeat(t.weight)}{t.swap_open ? (t.swap_to ? ` asked ${byPub[t.swap_to]?.name ?? ''}` : ' up for swap') : ''}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
      <p className="text-sm text-ink-soft">
        {isPlanner ? 'Drag a task to another person, or tap it for options. ' : 'Tap your task to ask someone to swap. '}
        Stars show how big a job is.
      </p>

      {dragged && drag && (
        <div className="pointer-events-none fixed z-50 border-2 border-ink bg-surface px-3 py-2 text-sm font-semibold shadow-[var(--shadow-card)]"
          style={{ left: drag.x - 40, top: drag.y - 24 }}>
          {dragged.title}
        </div>
      )}

      <Sheet open={!!picked} onClose={() => setPicked(null)} title={picked?.title ?? ''}>
        {picked && (
          <TaskSheet t={picked} owner={byPub[picked.assignee]} people={people} me={me} isPlanner={isPlanner}
            onMove={(to) => { onMove(picked.id, to); setPicked(null) }}
            onAsk={(to) => { onAsk(picked.id, to); setPicked(null) }}
            onAction={onAction ? (a) => { onAction(picked.id, a); setPicked(null) } : undefined} />
        )}
      </Sheet>
    </div>
  )
}

function TaskSheet({ t, owner, people, me, isPlanner, onMove, onAsk, onAction }: {
  t: Task; owner?: Member; people: Member[]; me?: string; isPlanner: boolean
  onMove: (to: string) => void; onAsk: (to: string) => void; onAction?: (a: 'done' | 'take' | 'decline' | 'unswap') => void
}) {
  const others = people.filter((p) => p.pub !== t.assignee && p.status !== 'declined')
  const askedMe = t.swap_open && t.swap_to === me
  return (
    <div className="flex flex-col gap-4">
      <p className="text-base">{owner ? (t.mine ? 'Your task' : `${owner.name}'s task`) : 'Nobody yet'}{t.due ? `, by ${fmtTime(t.due)}` : ''}.</p>
      {askedMe && onAction && (
        <div className="flex flex-col gap-2 border-2 border-ink p-3">
          <p className="font-hand text-lg">{owner?.name} asks: can we swap? Could you take this one?</p>
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => onAction('take')}>Yes, I'll take it</Button>
            <Button variant="secondary" onClick={() => onAction('decline')}>Not this time</Button>
          </div>
        </div>
      )}
      {!t.mine && t.swap_open && !t.swap_to && onAction && <Button onClick={() => onAction('take')}>Take this task</Button>}
      {(t.mine || isPlanner) && t.due && onAction && (
        <Button variant="secondary" onClick={() => onAction('done')}>{t.done ? 'Mark not done' : 'Mark done'}</Button>
      )}
      {isPlanner && others.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="label">Move to</span>
          <div className="flex flex-wrap gap-2">
            {others.map((p) => (
              <button key={p.pub} type="button" onClick={() => onMove(p.pub)} className="inline-flex min-h-12 items-center gap-2 border-2 border-ink bg-surface px-3">
                <Avatar name={p.name} color={p.color} size={28} />{p.name}
              </button>
            ))}
          </div>
        </div>
      )}
      {t.mine && others.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="label">Can we swap? Ask</span>
          <div className="flex flex-wrap gap-2">
            {others.map((p) => (
              <button key={p.pub} type="button" onClick={() => onAsk(p.pub)} className="inline-flex min-h-12 items-center gap-2 border-2 border-ink bg-surface px-3">
                <Avatar name={p.name} color={p.color} size={28} />{p.name}
              </button>
            ))}
          </div>
          {t.swap_open && onAction && <Button variant="text" className="self-start" onClick={() => onAction('unswap')}>Cancel the swap request</Button>}
        </div>
      )}
    </div>
  )
}
