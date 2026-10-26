// Server calls + the little bit we keep in this browser (no accounts: your plans and groups live here).

export type Member = {
  pub: string
  name: string
  color: string
  status: 'invited' | 'answered' | 'declined'
  tz?: string
  city?: string
  confirm?: 'yes' | 'no' | null
  is_planner?: boolean
  has_answers?: boolean
  free_days?: string[]
  /** city-level [lat, lon], rounded to about 10 km */
  spot?: [number, number] | null
  id?: string
  email?: string
  availability?: { start: string; end: string }[]
  cal_slots?: { start: string; end: string }[] | null
  avail_text?: string
  standing?: string
  picks?: Picks
  host_address?: string
}

export type Picks = {
  where?: string
  distance?: string
  budget?: string
  budget_custom?: number | string
  moods?: string[]
  ideas?: string
  car?: string
  notes?: string
  can_host?: boolean
  best_day?: string
}

export type Option = {
  id: string
  ref: string
  kind: 'place' | 'event' | 'online' | 'home'
  title: string
  what: string
  why: string
  start: string
  end: string
  cost_per_person: number
  place?: string
  address?: string
  link?: string
  how?: string[]
  host?: string
  host_pub?: string
  rating?: number
  weather?: string
  when_text?: string
  distances?: Record<string, number>
  lat?: number | null
  lon?: number | null
  checked?: boolean
  access?: 'ok' | 'unconfirmed'
  activity?: string
  website?: string
  phone?: string
  reservation?: string
  thumbnail?: string
}

export type Task = {
  id: string
  title: string
  weight: number
  assignee: string
  due: string
  done: boolean
  swap_open: boolean
  swap_to?: string | null
  mine: boolean
}

export type Plan = {
  id: string
  title: string
  kind: string
  kind_other?: string
  start_day: string
  end_day: string
  dates: string[]
  decide: 'everyone' | 'planner'
  details?: Picks | null
  locks: { place?: string; day?: string; time?: string; end_time?: string }
  work: 'share' | 'solo'
  deadline?: string
  status: string
  stage: string
  planner: string
  group_id?: string
  members: Member[]
  me: Member | null
  is_planner: boolean
  answers_ready: boolean
  generating: boolean
  options: Option[]
  votes: Record<string, { in: string[]; maybe: string[]; cant: string[] }>
  chosen?: string
  problem?: string
  windows: { start: string; end: string; free: string[] }[]
  tasks: Task[]
  host_address?: string | null
  dropout?: { names: string[]; decided: string | null } | null
  checker?: { raw: number; passed: number; rejected: number; rules: string[] }
  created_at: string
  mode?: 'in_person' | 'online'
  budget_mode?: 'each' | 'shared'
  budget_limit?: number | null
  places: Option[]
  place_votes: Record<string, string[]>
  tallies?: { activities: { name: string; pubs: string[] }[]; duration?: string | null; distance?: string | null }
  lowest_budget?: number | null
  access_note?: string | null
  effort?: { people: number; questions: number; places_checked: number; tasks: number; task_people: number } | null
}

export type Group = { id: string; name: string; members: { name: string; color: string; email: string; load: number }[]; plans: { id: string; title: string; stage: string; created_at: string }[] }

export class ApiError extends Error {}

export async function api<T>(path: string, opts: { method?: string; body?: unknown; member?: string | null } = {}): Promise<T> {
  let r: Response
  try {
    r = await fetch(`/api${path}`, {
      method: opts.method ?? (opts.body ? 'POST' : 'GET'),
      headers: { 'Content-Type': 'application/json', ...(opts.member ? { 'X-Member': opts.member } : {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    })
  } catch {
    throw new ApiError("We can't reach the server. Check your connection and try again.")
  }
  if (!r.ok) {
    let msg = 'Something went wrong. Try again.'
    try {
      const j = await r.json()
      if (typeof j.detail === 'string') msg = j.detail
    } catch { /* not json */ }
    throw new ApiError(msg)
  }
  return r.json()
}

/* ---------- local memory ---------- */

function read<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v ? (JSON.parse(v) as T) : fallback
  } catch {
    return fallback
  }
}
function write(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v))
  } catch { /* private mode */ }
}

export type MyPlan = { id: string; member: string; title: string; saved: string }

export const local = {
  plans: () => read<MyPlan[]>('np.plans', []),
  addPlan(p: Omit<MyPlan, 'saved'>) {
    const rest = local.plans().filter((x) => x.id !== p.id)
    write('np.plans', [{ ...p, saved: new Date().toISOString() }, ...rest])
  },
  removePlan: (id: string) => write('np.plans', local.plans().filter((x) => x.id !== id)),
  memberFor: (planId: string) => local.plans().find((p) => p.id === planId)?.member ?? null,
  groups: () => read<{ id: string; name: string }[]>('np.groups', []),
  addGroup(g: { id: string; name: string }) {
    write('np.groups', [g, ...local.groups().filter((x) => x.id !== g.id)])
  },
  removeGroup: (id: string) => write('np.groups', local.groups().filter((x) => x.id !== id)),
  name: () => read<string>('np.name', ''),
  setName: (n: string) => write('np.name', n),
  lastPicks: () => read<Picks | null>('np.picks', null),
  setLastPicks: (p: Picks) => write('np.picks', p),
  city: () => read<string>('np.city', ''),
  setCity: (c: string) => write('np.city', c),
  standing: () => read<string>('np.standing', ''),
  setStanding: (s: string) => write('np.standing', s),
  draft: <T,>() => read<T | null>('np.draft', null),
  setDraft: (d: unknown) => write('np.draft', d),
  clearDraft: () => write('np.draft', null),
}

export const myTz = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

/* ---------- dates and times, always in the viewer's time zone ---------- */

export const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function parseDay(s: string) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(d: Date, n: number) {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

export function thisWeekend(now = new Date()) {
  const dow = now.getDay() // 0 Sun .. 6 Sat
  if (dow === 0) return { start: ymd(now), end: ymd(now) }
  const sat = addDays(now, 6 - dow)
  return { start: ymd(sat), end: ymd(addDays(sat, 1)) }
}

export function nextWeek(now = new Date()) {
  const dow = now.getDay()
  const mon = addDays(now, ((8 - dow) % 7) || 7)
  return { start: ymd(mon), end: ymd(addDays(mon, 6)) }
}

export function daysBetween(start: string, end: string, max = 14) {
  const out: string[] = []
  let d = parseDay(start)
  const e = parseDay(end)
  while (d <= e && out.length < max) {
    out.push(ymd(d))
    d = addDays(d, 1)
  }
  return out
}

export const fmtDay = (s: string) => parseDay(s).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })

export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

export const fmtClock = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

export function fmtRange(start: string, end: string) {
  return `${fmtTime(start)} to ${fmtClock(end)}`
}

export function names(list: string[]) {
  if (list.length <= 1) return list.join('')
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`
}

export const KIND_LABEL: Record<string, string> = {
  hangout: 'Hangout',
  meal: 'Meal',
  date: 'Date',
  call: 'Catch-up call',
  games: 'Game night',
  watch: 'Watch party',
  trip: 'Trip',
  other: 'Something else',
}

export const planName = (p: { title: string }) => p.title.charAt(0).toUpperCase() + p.title.slice(1)
