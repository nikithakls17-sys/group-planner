import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, fmtDay, local, planName, type Plan } from '../api'
import { AvatarRow, Button, Card, Progress } from '../components/ui'
import { APP_NAME } from '../config'

export function usePlans() {
  const [plans, setPlans] = useState<Plan[] | null>(null)
  useEffect(() => {
    const mine = local.plans()
    Promise.all(mine.map((p) => api<Plan>(`/plans/${p.id}`, { member: p.member }).catch(() => null))).then((all) => {
      // drop plans that were deleted on the server
      mine.forEach((p, i) => { if (!all[i]) local.removePlan(p.id) })
      setPlans(all.filter(Boolean) as Plan[])
    })
  }, [])
  return plans
}

export function PlanCard({ p }: { p: Plan }) {
  const answered = p.members.filter((m) => m.status === 'answered')
  const chosen = p.options.find((o) => o.id === p.chosen)
  return (
    <Link to={`/p/${p.id}`} className="block">
      <Card className="flex flex-col gap-3 hover:ring-2 hover:ring-line">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold">{chosen ? chosen.title : planName(p)}</h3>
            <p className="text-sm text-ink-soft">{fmtDay(p.start_day)}{p.end_day !== p.start_day ? ` to ${fmtDay(p.end_day)}` : ''}</p>
          </div>
          <AvatarRow people={answered} size={28} />
        </div>
        <Progress stage={p.stage} />
      </Card>
    </Link>
  )
}

export default function Home() {
  const nav = useNavigate()
  const plans = usePlans()
  const upcoming = (plans ?? []).filter((p) => p.end_day >= new Date().toISOString().slice(0, 10))
  return (
    <div className="flex flex-col gap-8 pt-6">
      <header className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-ink-soft md:hidden">{APP_NAME}</span>
        <h1 className="font-hand text-2xl leading-tight">Plan anything with your group. Nobody has to be the planner.</h1>
      </header>
      <div className="flex flex-col gap-3">
        <Button full onClick={() => nav('/new')}>Plan something</Button>
        <Button full variant="secondary" onClick={() => nav('/new?bored=1')}>I'm bored</Button>
        <p className="text-sm text-ink-soft">One link, everyone answers once, the app finds the time, the place and who does what.</p>
      </div>
      <section className="flex flex-col gap-3" aria-label="Upcoming plans">
        <h2 className="text-lg font-bold">Your plans</h2>
        {plans === null && <p className="text-base text-ink-soft">Loading your plans...</p>}
        {plans && upcoming.length === 0 && (
          <p className="text-base text-ink-soft">Nothing planned yet. Tap Plan something and send one link to your group.</p>
        )}
        {upcoming.map((p) => <PlanCard key={p.id} p={p} />)}
      </section>
    </div>
  )
}
