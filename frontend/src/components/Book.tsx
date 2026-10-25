import type { ReactNode } from 'react'

export type BookTab = { key: string; label: string; color: { hex: string; deep: string }; disabled?: boolean; done?: boolean }

function Clip({ className = '' }: { className?: string }) {
  // a binder clip, drawn flat
  return (
    <svg viewBox="0 0 64 120" className={className} aria-hidden="true">
      <path d="M20 8 C8 8 6 22 14 30" fill="none" stroke="#3a332b" strokeWidth="4" />
      <path d="M20 112 C8 112 6 98 14 90" fill="none" stroke="#3a332b" strokeWidth="4" />
      <rect x="14" y="22" width="34" height="76" fill="#2b241c" />
      <rect x="18" y="26" width="26" height="68" fill="#4a4137" />
      <rect x="44" y="30" width="12" height="60" fill="#8f8577" />
      <circle cx="31" cy="60" r="7" fill="#c9bfae" stroke="#2b241c" strokeWidth="2" />
    </svg>
  )
}

/** The whole app is a planner book on a desk. Laptop: open two-page spread, binder clip on the left edge, pastel
 *  tab dividers out of the right edge. Phone: one page, tabs as a strip along the top. */
export default function Book({ tabs, active, onTab, headLeft, headRight, left, right, turnKey }: {
  tabs: BookTab[]
  active: string
  onTab: (key: string) => void
  headLeft?: ReactNode
  headRight?: ReactNode
  left: ReactNode
  right?: ReactNode
  turnKey?: string
}) {
  const tab = tabs.find((t) => t.key === active)
  return (
    <div className="mx-auto w-full max-w-[1240px] px-0 py-0 md:px-14 md:py-8">
      {/* phone: clip + tab strip */}
      <div className="md:hidden">
        <div className="flex justify-center pt-2"><Clip className="h-10 w-20 rotate-90" /></div>
        <nav aria-label="Pages" className="-mb-px flex gap-1 overflow-x-auto px-3 pt-1">
          {tabs.map((t) => (
            <button key={t.key} type="button" disabled={t.disabled} onClick={() => onTab(t.key)} aria-current={t.key === active ? 'page' : undefined}
              className={`on-pastel min-h-12 shrink-0 border-2 border-b-0 px-4 text-sm font-bold disabled:opacity-50 ${t.key === active ? 'border-ink pb-1' : 'border-transparent opacity-90'}`}
              style={{ background: t.color.hex }}>
              {t.label}{t.done && t.key !== active ? <span className="sr-only"> (done)</span> : null}
            </button>
          ))}
        </nav>
      </div>

      <div className="relative">
        {/* laptop: binder clip on the left edge */}
        <Clip className="absolute -left-9 top-24 z-10 hidden h-28 w-16 md:block" />
        {/* laptop: tab dividers out of the right edge */}
        <nav aria-label="Pages" className="absolute -right-[92px] top-10 z-0 hidden w-[100px] flex-col gap-1.5 md:flex">
          {tabs.map((t) => (
            <button key={t.key} type="button" disabled={t.disabled} onClick={() => onTab(t.key)} aria-current={t.key === active ? 'page' : undefined}
              className={`on-pastel min-h-12 border-2 border-l-0 pl-4 pr-2 text-left text-sm font-bold transition-transform disabled:opacity-50 ${
                t.key === active ? 'translate-x-0 border-ink' : 'translate-x-[-8px] border-transparent hover:translate-x-[-4px]'}`}
              style={{ background: t.color.hex }}>
              {t.label}
            </button>
          ))}
        </nav>

        <div className="relative z-[1] grid min-h-[calc(100dvh-4rem)] grid-cols-1 shadow-[var(--page-shadow)] md:grid-cols-2">
          {/* left page: the current tab */}
          <section className="paper relative flex min-w-0 flex-col px-5 pb-12 pt-5 md:px-12 md:pt-8" aria-label={tab?.label}>
            <div className="mb-6 hidden items-center justify-between text-sm md:flex">
              <span className="font-semibold text-ink-soft">{headLeft}</span>
            </div>
            <div key={turnKey ?? active} className="turn flex flex-col gap-6">{left}</div>
            {/* spine */}
            <span className="pointer-events-none absolute inset-y-0 right-0 hidden w-10 bg-gradient-to-l from-black/10 to-transparent md:block" />
          </section>
          {/* right page: live summary */}
          <aside className="paper relative flex min-w-0 flex-col border-t-2 border-dashed border-rule px-5 pb-12 pt-5 md:border-t-0 md:px-12 md:pt-8" aria-label="Summary">
            <div className="mb-6 hidden items-center justify-end text-sm md:flex">
              <span className="font-semibold text-ink-soft">{headRight}</span>
            </div>
            <span className="pointer-events-none absolute inset-y-0 left-0 hidden w-10 bg-gradient-to-r from-black/10 to-transparent md:block" />
            <div className="flex flex-col gap-6">{right}</div>
          </aside>
        </div>
      </div>
    </div>
  )
}
