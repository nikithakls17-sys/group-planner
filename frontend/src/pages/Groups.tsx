import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, local, planName, type Group } from '../api'
import { Avatar, Button, Card, ErrorBox, Help, Sheet, useToast, Working } from '../components/ui'

export default function Groups() {
  const nav = useNavigate()
  const [groups, setGroups] = useState<Group[] | null>(null)
  useEffect(() => {
    const mine = local.groups()
    Promise.all(mine.map((g) => api<Group>(`/groups/${g.id}`).catch(() => null))).then((all) => {
      mine.forEach((g, i) => { if (!all[i]) local.removeGroup(g.id) })
      setGroups(all.filter(Boolean) as Group[])
    })
  }, [])
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">Groups</h1>
      {groups === null && <p className="text-base text-ink-soft">Loading...</p>}
      {groups && groups.length === 0 && (
        <div className="flex flex-col gap-3">
          <p className="text-base text-ink-soft">Save a group when you start a plan, and next time you only pick the group.</p>
          <Button onClick={() => nav('/new')}>Plan something</Button>
        </div>
      )}
      {groups?.map((g) => (
        <Link key={g.id} to={`/g/${g.id}`}>
          <Card className="flex items-center justify-between gap-3 hover:ring-2 hover:ring-line">
            <div>
              <h2 className="text-base font-bold">{g.name}</h2>
              <p className="text-sm text-ink-soft">{g.members.length} people, {g.plans.length} plans</p>
            </div>
            <span className="inline-flex -space-x-2">{g.members.slice(0, 5).map((m, i) => <Avatar key={i} name={m.name} color={m.color} size={32} />)}</span>
          </Card>
        </Link>
      ))}
    </div>
  )
}

export function GroupPage() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const [g, setG] = useState<Group | null>(null)
  const [err, setErr] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  useEffect(() => {
    api<Group>(`/groups/${id}`).then(setG).catch((e) => setErr(e.message))
  }, [id])
  if (err) return <div className="pt-12"><ErrorBox message={err} fix="Back to groups" onFix={() => nav('/groups')} /></div>
  if (!g) return <Working lines={['Opening the group...']} />
  const max = Math.max(1, ...g.members.map((m) => m.load))
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">{g.name}</h1>
      <div className="flex flex-col gap-3">
        <Button full onClick={() => nav(`/new?group=${g.id}`)}>Plan something with {g.name}</Button>
        <Button full variant="secondary" onClick={() => nav(`/new?bored=1&group=${g.id}`)}>I'm bored</Button>
      </div>
      <Card className="flex flex-col gap-4">
        <h2 className="text-base font-semibold">
          Planning load
          <Help text="Starting a plan and doing tasks add up here. The app gives the next big job to whoever is lowest." />
        </h2>
        <ul className="flex flex-col gap-3">
          {g.members.map((m, i) => (
            <li key={i} className="flex items-center gap-3">
              <Avatar name={m.name} color={m.color} size={36} />
              <span className="w-24 truncate text-base">{m.name}</span>
              <span className="h-3 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                <span className="block h-full rounded-full bg-accent" style={{ width: `${(m.load / max) * 100}%` }} />
              </span>
              <span className="w-8 text-right text-sm text-ink-soft" aria-label={`${m.name} load ${m.load}`}>{m.load}</span>
            </li>
          ))}
        </ul>
      </Card>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">Plans</h2>
        {g.plans.length === 0 && <p className="text-base text-ink-soft">No plans yet.</p>}
        {g.plans.map((p) => (
          <Link key={p.id} to={local.memberFor(p.id) ? `/p/${p.id}` : `/p/${p.id}/answer`}>
            <Card className="flex items-center justify-between hover:ring-2 hover:ring-line">
              <span className="text-base font-semibold">{planName(p)}</span>
              <span className="text-sm capitalize text-ink-soft">{p.stage}</span>
            </Card>
          </Link>
        ))}
      </section>
      <Button variant="secondary" className="text-danger" onClick={() => setConfirmDelete(true)}>Delete this group and all its data</Button>
      <Sheet open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete everything?">
        <div className="flex flex-col gap-4">
          <p className="text-base">This deletes {g.name}, all {g.plans.length} plans, everyone's answers, votes, tasks and planning history. It cannot be undone.</p>
          <Button className="bg-danger" onClick={async () => {
            try {
              await api(`/groups/${id}`, { method: 'DELETE' })
              local.removeGroup(id)
              g.plans.forEach((p) => local.removePlan(p.id))
              toast('Deleted')
              nav('/groups')
            } catch (e) { setErr((e as Error).message) }
          }}>Delete everything</Button>
        </div>
      </Sheet>
    </div>
  )
}
