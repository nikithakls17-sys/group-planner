import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, fmtDay, local, planName, type Plan } from '../api'
import { IllustrationSlot } from '../components/Illustration'
import { AvatarRow, Button, Note, PageHeading, Progress } from '../components/ui'
import { PASTELS } from '../config'

export function usePlans() {
  const [plans, setPlans] = useState<Plan[] | null>(null)
  useEffect(() => {
    const mine = local.plans()
    Promise.all(mine.map((p) => api<Plan>(`/plans/${p.id}`, { member: p.member }).catch(() => null))).then((all) => {
      mine.forEach((p, i) => { if (!all[i]) local.removePlan(p.id) }) // deleted on the server
      setPlans(all.filter(Boolean) as Plan[])
    })
  }, [])
  return plans
}

export function PlanCard({ p, i = 0 }: { p: Plan; i?: number }) {
  const answered = p.members.filter((m) => m.status === 'answered')
  const chosen = p.options.find((o) => o.id === p.chosen)
  const days = p.dates.length ? p.dates : [p.start_day].filter(Boolean)
  return (
    <Link to={`/p/${p.id}`} className="block">
      <div className="flex flex-col gap-3 border-2 border-rule p-4 hover:border-ink" style={{ background: `color-mix(in srgb, ${PASTELS[i % PASTELS.length].hex} 40%, var(--surface))` }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold">{chosen ? chosen.title : planName(p)}</h3>
            <p className="text-sm text-ink-soft">{p.status === 'draft' ? 'Still planning' : days.slice(0, 3).map(fmtDay).join(', ')}</p>
          </div>
          <AvatarRow people={answered} size={28} />
        </div>
        <Progress stage={p.stage} />
      </div>
    </Link>
  )
}

export default function Home() {
  const nav = useNavigate()
  return (
    <>
      <PageHeading color={PASTELS[0].deep} sub="Every group chat has one person who does all the planning. Not anymore.">Nobody plans</PageHeading>
      {/* Space for the hero illustration. Swap for <img src="/illustrations/hero.png" alt="..."> when it arrives. */}
      <IllustrationSlot name="hero" ratio="4 / 3" note="the group chat, a sleepy planner" />
      <div className="flex flex-col gap-3">
        <Button full onClick={() => nav('/new')}>Plan something</Button>
        <Button full variant="secondary" onClick={() => nav('/new?bored=1')}>I'm bored</Button>
      </div>
      <Note>One link. Everyone answers once. The app does the rest.</Note>
    </>
  )
}

/** Right page of Home: your plans. */
export function HomeRight() {
  const plans = usePlans()
  const today = new Date().toISOString().slice(0, 10)
  const upcoming = (plans ?? []).filter((p) => !p.end_day || p.end_day >= today)
  return (
    <>
      <h2 className="text-lg font-bold">Your plans</h2>
      {plans === null && <Note>Looking for your plans...</Note>}
      {plans && upcoming.length === 0 && <p className="text-base text-ink-soft">Nothing planned yet. Tap Plan something and send one link to your group.</p>}
      {upcoming.map((p, i) => <PlanCard key={p.id} p={p} i={i} />)}
      {/* Second illustration space */}
      <IllustrationSlot name="how it works" ratio="3 / 1" note="link, answer, vote, done" />
    </>
  )
}
