import { useNavigate } from 'react-router-dom'
import Mascot from '../components/Mascot'
import { Button } from '../components/ui'
import { APP_NAME } from '../config'

const STEPS = [
  { n: '01', t: 'One link', d: 'Someone starts a plan and drops one link in the group chat.', spot: 'bg-spot-green' },
  { n: '02', t: 'Answer once', d: 'Everyone taps when they are free and what they feel like. About a minute.', spot: 'bg-spot-sky' },
  { n: '03', t: 'Gemma suggests', d: 'The app finds the time that works across time zones and 3 options that fit everyone.', spot: 'bg-spot-pink' },
  { n: '04', t: 'Code checks', d: 'Every option is checked for budget, distance, opening hours and real places before anyone sees it.', spot: 'bg-spot-mustard' },
  { n: '05', t: 'Vote, split, go', d: 'Tap I\'m in. Jobs go to whoever did the least planning lately. Calendar invite included.', spot: 'bg-spot-tomato' },
]

export default function About() {
  const nav = useNavigate()
  return (
    <div className="flex flex-col gap-8 pt-6">
      <header className="flex flex-col gap-4">
        <span className="label text-ink-soft">About</span>
        <h1 className="display text-[length:var(--text-poster)] leading-[var(--text-poster--line-height)]">{APP_NAME}</h1>
        <p className="font-hand text-xl">Every group chat has one person who does all the planning. This app does it, so nobody has to.</p>
      </header>
      <div className="flex items-end gap-4">
        <Mascot mood="sleepy" size={120} />
        <p className="border-2 border-ink bg-surface p-3 text-base">Hi, I'm Cal. I'm a calendar who would rather nap. So I do the planning fast.</p>
      </div>
      <ol className="flex flex-col border-2 border-ink">
        {STEPS.map((s) => (
          <li key={s.n} className={`flex gap-4 border-b-2 border-ink p-4 last:border-b-0 ${s.spot}`}>
            <span className="display text-2xl">{s.n}</span>
            <div><p className="display text-lg">{s.t}</p><p className="text-base">{s.d}</p></div>
          </li>
        ))}
      </ol>
      <section className="flex flex-col gap-2 border-2 border-ink bg-surface p-4">
        <span className="label">Why open source</span>
        <p className="text-base">It handles calendars, locations and budgets, exactly the data you don't want sent to a big AI company. It runs on Gemma, an open model on our own server, keeps only what the plan needs, and costs friend groups nothing.</p>
      </section>
      <section className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 border-2 border-ink bg-surface p-4 text-base">
        <span className="label">Model</span><span className="font-hand text-lg">Gemma 4</span>
        <span className="label">Places</span><span className="font-hand text-lg">SerpApi</span>
        <span className="label">Data</span><span className="font-hand text-lg">MongoDB Atlas</span>
        <span className="label">Hosting</span><span className="font-hand text-lg">Render</span>
        <span className="label">Code</span>
        <a className="font-hand text-lg underline" href="https://github.com/nikithakls17-sys/group-planner" target="_blank" rel="noreferrer">github.com/nikithakls17-sys/group-planner</a>
      </section>
      <Button onClick={() => nav('/new')}>Plan something</Button>
    </div>
  )
}
