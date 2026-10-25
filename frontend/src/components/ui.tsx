import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

/* ---------- Button: primary / secondary / text. Same height, radius and padding everywhere. ---------- */

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'text'; full?: boolean }

export function Button({ variant = 'primary', full, className = '', ...rest }: BtnProps) {
  const base =
    'inline-flex min-h-12 items-center justify-center gap-2 rounded-[var(--radius-card)] px-6 text-base font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50'
  const look = {
    primary: 'bg-accent text-accent-ink hover:brightness-110',
    secondary: 'border-2 border-line bg-surface text-ink hover:border-ink-soft',
    text: 'px-3 text-accent hover:underline',
  }[variant]
  return <button className={`${base} ${look} ${full ? 'w-full' : ''} ${className}`} {...rest} />
}

/* ---------- Chips ---------- */

export function Chip({ on, children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { on?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      className={`min-h-12 rounded-full border-2 px-4 text-base font-medium transition-colors ${
        on ? 'border-accent bg-accent-soft text-ink' : 'border-line bg-surface text-ink hover:border-ink-soft'
      }`}
      {...rest}
    >
      {children}
    </button>
  )
}

export function ChipGroup({ options, value, onChange, multi, label }: {
  options: { value: string; label: string }[]
  value: string | string[]
  onChange: (v: string & string[]) => void
  multi?: boolean
  label?: string
}) {
  const vals = Array.isArray(value) ? value : [value]
  const set = onChange as (v: string | string[]) => void
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <Chip
          key={o.value}
          on={vals.includes(o.value)}
          onClick={() => {
            if (!multi) return set(o.value)
            if (o.value === 'nopref') return set(['nopref'])
            const cur = vals.filter((v) => v !== 'nopref')
            const next = cur.includes(o.value) ? cur.filter((v) => v !== o.value) : [...cur, o.value]
            set(next.length ? next : ['nopref'])
          }}
        >
          {o.label}
        </Chip>
      ))}
    </div>
  )
}

/* ---------- Tile: a big choice on a one-question screen ---------- */

export function Tile({ on, title, sub, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { on?: boolean; title: string; sub?: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      className={`flex min-h-16 w-full flex-col items-start justify-center rounded-[var(--radius-card)] border-2 px-4 py-3 text-left transition-colors ${
        on ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:border-ink-soft'
      }`}
      {...rest}
    >
      <span className="text-base font-semibold">{title}</span>
      {sub && <span className="text-sm text-ink-soft">{sub}</span>}
    </button>
  )
}

/* ---------- Card ---------- */

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-[var(--radius-card)] bg-surface p-4 shadow-[var(--shadow-card)] ${className}`}>{children}</div>
}

/* ---------- Member avatar: color + initials, so color is never the only clue ---------- */

export const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?'

function textOn(hex: string) {
  const n = parseInt((hex || '#000000').replace('#', ''), 16)
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
  return lum > 0.6 ? '#1f1d1a' : '#ffffff'
}

export function Avatar({ name, color, size = 40, dim }: { name: string; color: string; size?: number; dim?: boolean }) {
  return (
    <span
      title={name}
      aria-label={name}
      role="img"
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ring-2 ring-surface ${dim ? 'opacity-40' : ''}`}
      style={{ width: size, height: size, background: color, color: textOn(color), fontSize: size < 36 ? 14 : 16 }}
    >
      {initials(name)}
    </span>
  )
}

export function AvatarRow({ people, size = 32 }: { people: { name: string; color: string; dim?: boolean }[]; size?: number }) {
  return (
    <span className="inline-flex -space-x-2">
      {people.map((p, i) => (
        <Avatar key={i} {...p} size={size} />
      ))}
    </span>
  )
}

/* ---------- Progress tracker ---------- */

export const STAGES = ['answers', 'options', 'vote', 'tasks', 'confirmed'] as const
const STAGE_LABEL: Record<string, string> = { answers: 'Answers', options: 'Options', vote: 'Vote', tasks: 'Tasks', confirmed: 'Confirmed' }

export function Progress({ stage, answers }: { stage: string; answers?: string }) {
  const at = STAGES.indexOf(stage as (typeof STAGES)[number])
  return (
    <ol className="flex items-start gap-1" aria-label="Progress">
      {STAGES.map((s, i) => (
        <li key={s} className="flex flex-1 flex-col gap-1" aria-current={i === at ? 'step' : undefined}>
          <span className={`h-2 rounded-full ${i <= at ? 'bg-accent' : 'bg-muted'}`} />
          <span className={`text-sm ${i === at ? 'font-semibold text-ink' : 'text-ink-soft max-sm:sr-only'}`}>
            {s === 'answers' && answers ? `${STAGE_LABEL[s]} (${answers})` : STAGE_LABEL[s]}
          </span>
        </li>
      ))}
    </ol>
  )
}

/* ---------- "?" tooltip ---------- */

export function Help({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="relative inline-block align-middle">
      <button
        type="button"
        aria-label="What does this mean?"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="ml-1 inline-flex h-6 w-6 items-center justify-center rounded-full border border-line text-sm text-ink-soft"
      >
        ?
      </button>
      {open && (
        <span role="tooltip" className="absolute left-1/2 z-20 mt-2 block w-60 -translate-x-1/2 rounded-xl bg-ink p-3 text-sm font-normal text-white">
          {text}
        </span>
      )}
    </span>
  )
}

/* ---------- Bottom sheet for secondary actions ---------- */

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/30 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="rise max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-[var(--radius-card)] bg-surface p-6 sm:rounded-[var(--radius-card)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <Button variant="text" onClick={onClose}>Close</Button>
        </div>
        {children}
      </div>
    </div>
  )
}

/* ---------- Toast ---------- */

const ToastCtx = createContext<(msg: string) => void>(() => {})
export const useToast = () => useContext(ToastCtx)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null)
  const show = useCallback((m: string) => {
    setMsg(m)
    window.setTimeout(() => setMsg(null), 2600)
  }, [])
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 sm:bottom-8">
        {msg && <div className="rise rounded-full bg-ink px-6 py-3 text-base text-white shadow-[var(--shadow-card)]">{msg}</div>}
      </div>
    </ToastCtx.Provider>
  )
}

/* ---------- Screen: one question, one primary button, one "what happens next" line ---------- */

export function Screen({ question, sub, children, primary, onPrimary, primaryDisabled, next, back = true, onBack, secondary, step }: {
  question: ReactNode
  sub?: ReactNode
  children?: ReactNode
  primary?: string
  onPrimary?: () => void
  primaryDisabled?: boolean
  next?: ReactNode
  back?: boolean
  onBack?: () => void
  secondary?: ReactNode
  step?: string
}) {
  const nav = useNavigate()
  return (
    <section className="rise flex flex-col gap-6">
      <div className="flex min-h-12 items-center justify-between">
        {back ? (
          <button
            type="button"
            onClick={onBack ?? (() => nav(-1))}
            aria-label="Back"
            className="-ml-3 inline-flex min-h-12 min-w-12 items-center justify-center rounded-full text-ink hover:bg-muted"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ) : (
          <span />
        )}
        {step && <span className="text-sm text-ink-soft">{step}</span>}
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-bold">{question}</h1>
        {sub && <p className="text-base text-ink-soft">{sub}</p>}
      </div>
      {children}
      {(primary || secondary) && (
        <div className="flex flex-col gap-2 pt-2">
          {primary && (
            <Button full onClick={onPrimary} disabled={primaryDisabled}>
              {primary}
            </Button>
          )}
          {secondary}
        </div>
      )}
      {next && <p className="text-sm text-ink-soft">{next}</p>}
    </section>
  )
}

/* ---------- Loading with friendly messages ---------- */

export function Working({ lines }: { lines: string[] }) {
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = window.setInterval(() => setI((x) => Math.min(x + 1, lines.length - 1)), 2200)
    return () => window.clearInterval(t)
  }, [lines.length])
  return (
    <div className="flex flex-col items-center gap-4 py-12 text-center" role="status">
      <span className="h-10 w-10 animate-spin rounded-full border-4 border-muted border-t-accent" aria-hidden="true" />
      <p className="font-hand text-xl">{lines[i]}</p>
    </div>
  )
}

/* ---------- Error: plain language, one clear fix ---------- */

export function ErrorBox({ message, fix, onFix }: { message: string; fix?: string; onFix?: () => void }) {
  return (
    <div role="alert" className="flex flex-col gap-3 rounded-[var(--radius-card)] bg-danger-soft p-4">
      <p className="text-base text-ink">{message}</p>
      {fix && onFix && (
        <Button variant="secondary" onClick={onFix}>
          {fix}
        </Button>
      )}
    </div>
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-base font-semibold">{label}</span>
      {children}
      {hint && <span className="text-sm text-ink-soft">{hint}</span>}
    </label>
  )
}

export const inputCls =
  'min-h-12 w-full rounded-[var(--radius-card)] border-2 border-line bg-surface px-4 text-base text-ink placeholder:text-ink-soft focus:border-accent focus:outline-none'
