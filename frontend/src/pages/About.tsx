import { useNavigate } from 'react-router-dom'
import { Button, Note, PageHeading } from '../components/ui'
import { APP_NAME, PASTELS } from '../config'

const STEPS = [
  { t: 'One link', d: 'Someone starts a plan and drops one link in the group chat.' },
  { t: 'Answer once', d: 'Everyone taps the days they are free and what they feel like. About a minute.' },
  { t: 'Gemma suggests', d: 'The app finds the dates that work across time zones and 3 plans that fit everyone.' },
  { t: 'Code checks', d: 'Every plan is checked for budget, distance, opening hours, access needs and real places before anyone sees it.' },
  { t: 'Vote, split, go', d: "Tap I'm in. Jobs go to whoever did the least planning lately. Then getting there, receipts and the bill." },
]

export default function About() {
  const nav = useNavigate()
  return (
    <>
      <PageHeading color={PASTELS[2].deep} sub="Every group chat has one person who does all the planning. This app does it, so nobody has to.">About {APP_NAME}</PageHeading>
      <ol className="flex flex-col">
        {STEPS.map((s, i) => (
          <li key={s.t} className="flex gap-4 border-b border-rule py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center border-2 border-ink font-bold" style={{ background: PASTELS[i].hex }}>{i + 1}</span>
            <div><p className="font-bold">{s.t}</p><p className="text-base">{s.d}</p></div>
          </li>
        ))}
      </ol>
      <Button onClick={() => nav('/new')}>Plan something</Button>
    </>
  )
}

export function AboutRight() {
  return (
    <>
      <h2 className="text-lg font-bold">Why open source</h2>
      <p className="text-base">It handles calendars, locations, budgets and access needs, exactly the data you don't want sent to a big AI company. It runs on Gemma, an open model on our own server, keeps only what the plan needs, and costs friend groups nothing.</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-base">
        <dt className="label">Model</dt><dd>Gemma 4</dd>
        <dt className="label">Places</dt><dd>SerpApi</dd>
        <dt className="label">Data</dt><dd>MongoDB Atlas</dd>
        <dt className="label">Hosting</dt><dd>Render</dd>
        <dt className="label">Code</dt><dd><a className="underline" href="https://github.com/nikithakls17-sys/group-planner" target="_blank" rel="noreferrer">github.com/nikithakls17-sys/group-planner</a></dd>
      </dl>
      <Note>Made for friend groups who keep saying "we should hang out".</Note>
    </>
  )
}
