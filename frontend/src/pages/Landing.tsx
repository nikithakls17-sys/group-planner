export default function Landing() {
  return (
    <main className="flex flex-col gap-6 pt-10">
      <h1 className="text-3xl font-extrabold leading-tight">Nobody has to be the planner.</h1>
      <p className="text-ink-soft">
        Every group chat has one person who does all the planning. Start a plan, share one link,
        everyone answers once, and the app does the rest.
      </p>
      <button className="rounded-2xl bg-accent px-5 py-4 text-lg font-bold text-white">Start a plan</button>
      <button className="rounded-2xl bg-warm-soft px-5 py-4 text-lg font-bold text-ink">I'm bored</button>
    </main>
  )
}
