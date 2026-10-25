import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, local, planName, type Plan } from '../api'
import { Button, Note, PageHeading, Sheet, useToast } from '../components/ui'
import { PASTELS } from '../config'
import { PlanCard, usePlans } from './Home'

/** All your plans: start a new one, open, edit or delete the ones you have. */
export default function Plans() {
  const nav = useNavigate()
  const toast = useToast()
  const loaded = usePlans()
  const [removed, setRemoved] = useState<string[]>([])
  const [confirm, setConfirm] = useState<Plan | null>(null)
  const [err, setErr] = useState('')
  const plans = (loaded ?? []).filter((p) => !removed.includes(p.id))
  const today = new Date().toISOString().slice(0, 10)
  const upcoming = plans.filter((p) => !p.end_day || p.end_day >= today)
  const past = plans.filter((p) => p.end_day && p.end_day < today)

  async function remove(p: Plan) {
    setErr('')
    try {
      if (p.is_planner) await api(`/plans/${p.id}`, { method: 'DELETE', member: local.memberFor(p.id) })
      local.removePlan(p.id)
      setRemoved((r) => [...r, p.id])
      toast(p.is_planner ? 'Plan deleted for everyone' : 'Removed from your list')
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setConfirm(null)
    }
  }

  const row = (p: Plan, i: number) => (
    <li key={p.id} className="flex flex-col gap-2">
      <PlanCard p={p} i={i} />
      <div className="flex gap-2">
        {p.is_planner && <Button variant="secondary" onClick={() => nav(`/p/${p.id}?tab=what`)}>Edit</Button>}
        <Button variant="secondary" onClick={() => setConfirm(p)}>{p.is_planner ? 'Delete' : 'Leave'}</Button>
      </div>
    </li>
  )

  return (
    <>
      <PageHeading color={PASTELS[1].deep}>Plans</PageHeading>
      <Button full onClick={() => nav('/new')}>New plan</Button>
      {loaded === null && <Note>Looking for your plans...</Note>}
      {loaded && plans.length === 0 && <p className="text-base text-ink-soft">Plans you start or join show up here.</p>}
      {upcoming.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-bold">Coming up</h2>
          <ul className="flex flex-col gap-5">{upcoming.map(row)}</ul>
        </section>
      )}
      {past.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-bold">Past</h2>
          <ul className="flex flex-col gap-5">{past.map(row)}</ul>
        </section>
      )}
      {err && <p role="alert" className="text-danger">{err}</p>}
      <Sheet open={!!confirm} onClose={() => setConfirm(null)} title={confirm?.is_planner ? 'Delete this plan?' : 'Leave this plan?'}>
        {confirm && (
          <div className="flex flex-col gap-4">
            <p className="text-base">
              {confirm.is_planner
                ? `This deletes ${planName(confirm).toLowerCase()} for everyone: answers, votes, tasks and all. It cannot be undone.`
                : `This takes ${planName(confirm).toLowerCase()} off your list on this device. You can open the link again any time.`}
            </p>
            <Button onClick={() => remove(confirm)}>{confirm.is_planner ? 'Delete for everyone' : 'Leave'}</Button>
          </div>
        )}
      </Sheet>
    </>
  )
}
