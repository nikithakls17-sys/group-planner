import { useRef, type ReactNode } from 'react'
import { Button } from './ui'

/** Step progress bar at the top of a flow. Finished steps are buttons, so you can jump back and edit. */
export function StepBar({ steps, at, reached, onJump, canJump }: {
  steps: string[]; at: number; reached: number; onJump: (i: number) => void; canJump?: (i: number) => boolean
}) {
  return (
    <nav aria-label="Steps" className="flex flex-col gap-2">
      <ol className="flex gap-1">
        {steps.map((s, i) => {
          const done = i !== at && (canJump ? canJump(i) : i <= reached)
          return (
            <li key={s} className="flex-1">
              <button
                type="button"
                disabled={!done}
                onClick={() => onJump(i)}
                aria-current={i === at ? 'step' : undefined}
                aria-label={`${s}${i < at ? ' (done, tap to edit)' : i === at ? ' (this step)' : ''}`}
                className="group flex w-full flex-col gap-1 disabled:cursor-default"
              >
                <span className={`block h-2 border border-ink ${i < at || (i <= reached && i !== at) ? 'bg-ink' : i === at ? 'bg-accent' : 'bg-surface'}`} />
              </button>
            </li>
          )
        })}
      </ol>
      <p className="label text-ink-soft">
        Step {at + 1} of {steps.length}: <span className="text-ink">{steps[at]}</span>
      </p>
    </nav>
  )
}

/** One step of a flow: Back button, step bar, a big poster question, content, one primary button, a "what's next" line.
 *  On phones, swipe right = Back and swipe left = Next (only when Next is allowed). */
export function Step({ bar, onBack, backLabel = 'Back', question, sub, children, primary, onPrimary, primaryDisabled, secondary, next }: {
  bar?: ReactNode
  onBack?: () => void
  backLabel?: string
  question: ReactNode
  sub?: ReactNode
  children?: ReactNode
  primary?: string
  onPrimary?: () => void
  primaryDisabled?: boolean
  secondary?: ReactNode
  next?: ReactNode
}) {
  const touch = useRef<{ x: number; y: number; t: number } | null>(null)
  const onTouchStart = (e: React.TouchEvent) => {
    // no swiping from inside things that use horizontal gestures themselves (task drag, inputs, sliders)
    if ((e.target as HTMLElement).closest('[data-noswipe], input, textarea, select')) return
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() }
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = touch.current
    touch.current = null
    if (!s) return
    const dx = e.changedTouches[0].clientX - s.x
    const dy = e.changedTouches[0].clientY - s.y
    if (Math.abs(dx) < 70 || Math.abs(dy) > 50 || Date.now() - s.t > 700) return
    if (dx > 0 && onBack) onBack()
    if (dx < 0 && primary && onPrimary && !primaryDisabled) onPrimary()
  }
  return (
    <section className="rise flex min-h-[80dvh] flex-col gap-6" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="flex flex-col gap-3">
        {onBack ? (
          <button type="button" onClick={onBack} className="-ml-1 inline-flex min-h-12 items-center gap-2 self-start px-1 text-base font-semibold">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" />
            </svg>
            {backLabel}
          </button>
        ) : (
          <span className="min-h-12" />
        )}
        {bar}
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="display text-2xl">{question}</h1>
        {sub && <p className="text-base text-ink-soft">{sub}</p>}
      </div>
      {children}
      {(primary || secondary) && (
        <div className="flex flex-col gap-3 pt-2">
          {primary && (
            <Button full onClick={onPrimary} disabled={primaryDisabled}>
              {primary}
            </Button>
          )}
          {secondary}
        </div>
      )}
      {next && <p className="font-hand text-lg text-ink-soft">{next}</p>}
    </section>
  )
}
