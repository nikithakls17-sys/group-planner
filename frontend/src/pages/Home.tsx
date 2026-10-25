import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, fmtDay, local, planName, type Plan } from '../api'
import Mascot, { IllustrationSlot } from '../components/Mascot'
import { AvatarRow, Button, Progress } from '../components/ui'
import { APP_NAME } from '../config'

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

const SPOTS = ['bg-spot-green', 'bg-spot-sky', 'bg-spot-pink', 'bg-spot-mustard', 'bg-spot-tomato']

export function PlanCard({ p, i = 0 }: { p: Plan; i?: number }) {
  const answered = p.members.filter((m) => m.status === 'answered')
  const chosen = p.options.find((o) => o.id === p.chosen)
  const days = p.dates.length ? p.dates : [p.start_day].filter(Boolean)
  return (
    <Link to={p.status === 'draft' && p.is_planner ? `/new?plan=${p.id}` : `/p/${p.id}`} className="block">
      <div className={`flex flex-col gap-3 border-2 border-ink p-4 hover:shadow-[var(--shadow-card)] ${SPOTS[i % SPOTS.length]}`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="display text-xl">{chosen ? chosen.title : planName(p)}</h3>
            <p className="font-hand text-base">
              {p.status === 'draft' ? 'Still planning' : days.length ? days.slice(0, 3).map(fmtDay).join(', ') + (days.length > 3 ? '...' : '') : ''}
            </p>
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
  const plans = usePlans()
  const today = new Date().toISOString().slice(0, 10)
  const upcoming = (plans ?? []).filter((p) => !p.end_day || p.end_day >= today)
  return (
    <div className="flex flex-col gap-8 pt-4">
      <header className="flex flex-col gap-3">
        <span className="label md:hidden">{APP_NAME}</span>
        <h1 className="display text-[length:var(--text-poster)] leading-[var(--text-poster--line-height)]">
          Nobody has to be <span className="text-accent">the planner.</span>
        </h1>
        <p className="font-hand text-xl">One link. Everyone answers once. The app does the rest.</p>
      </header>

      {/* Space for Niki's hero illustration. Replace the slot with <img src="/illustrations/hero.png"> when it arrives. */}
      <div className="relative">
        <IllustrationSlot name="hero" ratio="4 / 3" note="Group chat chaos, one sleepy planner" />
        <Mascot mood="wave" size={96} className="absolute -bottom-6 -right-2" />
      </div>

      <div className="flex flex-col gap-3">
        <Button full onClick={() => nav('/new')}>Plan something</Button>
        <button type="button" onClick={() => nav('/new?bored=1')}
          className="flex min-h-16 items-center justify-between border-2 border-ink bg-spot-tomato px-4 text-left active:translate-x-[2px] active:translate-y-[2px]">
          <span className="display text-xl">I'm bored</span>
          <span className="font-hand text-base">find something for today or tomorrow</span>
        </button>
      </div>

      <section className="flex flex-col gap-3" aria-label="Your plans">
        <div className="flex items-baseline justify-between border-b-2 border-ink pb-1">
          <h2 className="display text-xl">Your plans</h2>
          <span className="label text-ink-soft">{upcoming.length || ''}</span>
        </div>
        {plans === null && <p className="font-hand text-lg text-ink-soft">Looking for your plans...</p>}
        {plans && upcoming.length === 0 && (
          <div className="flex items-center gap-4">
            <Mascot mood="sleepy" size={80} />
            <p className="text-base">Nothing planned yet. Tap <b>Plan something</b> and send one link to your group.</p>
          </div>
        )}
        {upcoming.map((p, i) => <PlanCard key={p.id} p={p} i={i} />)}
      </section>

      {/* Second illustration space, for the "how it works" strip */}
      <IllustrationSlot name="how it works" ratio="3 / 1" note="Link, answer, vote, done" />
    </div>
  )
}
