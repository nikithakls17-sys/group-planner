import { useNavigate } from 'react-router-dom'
import { Button } from '../components/ui'
import { PlanCard, usePlans } from './Home'

export default function Plans() {
  const nav = useNavigate()
  const plans = usePlans()
  const today = new Date().toISOString().slice(0, 10)
  const upcoming = (plans ?? []).filter((p) => p.end_day >= today)
  const past = (plans ?? []).filter((p) => p.end_day < today)
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">Plans</h1>
      {plans === null && <p className="text-base text-ink-soft">Loading...</p>}
      {plans && plans.length === 0 && (
        <div className="flex flex-col gap-3">
          <p className="text-base text-ink-soft">Plans you start or join show up here.</p>
          <Button onClick={() => nav('/new')}>Plan something</Button>
        </div>
      )}
      {upcoming.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-bold">Coming up</h2>
          {upcoming.map((p) => <PlanCard key={p.id} p={p} />)}
        </section>
      )}
      {past.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-bold">Past</h2>
          {past.map((p) => <PlanCard key={p.id} p={p} />)}
        </section>
      )}
    </div>
  )
}
