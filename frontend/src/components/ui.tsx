import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { PASTELS } from '../config'

/* ---------- Button: primary / secondary / text. Same height, padding and line everywhere. ---------- */

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'text'; full?: boolean }

export function Button({ variant = 'primary', full, className = '', ...rest }: BtnProps) {
  const base = 'inline-flex min-h-12 items-center justify-center gap-2 px-5 text-base font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50'
  const look = {
    primary: 'bg-accent text-accent-ink hover:brightness-110',
    secondary: 'border-2 border-ink bg-surface text-ink hover:bg-muted',
    text: 'px-2 text-accent underline decoration-2 underline-offset-4',
  }[variant]
  return <button className={`${base} ${look} ${full ? 'w-full' : ''} ${className}`} {...rest} />
}

/* ---------- Chips ---------- */

export function Chip({ on, children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { on?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      className={`min-h-12 border-2 px-4 text-base font-medium transition-colors ${on ? 'border-ink bg-ink text-bg' : 'border-rule bg-surface text-ink hover:border-ink'}`}
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
            set(next.length ? next : multi && options.some((x) => x.value === 'nopref') ? ['nopref'] : [])
          }}
        >
          {o.label}
        </Chip>
      ))}
    </div>
  )
}

/* ---------- Tile: a big choice ---------- */

export function Tile({ on, title, sub, tint, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { on?: boolean; title: string; sub?: string; tint?: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      className={`flex min-h-16 w-full min-w-0 flex-col items-start justify-center border-2 px-4 py-3 text-left transition-colors ${on ? 'border-ink' : 'border-rule hover:border-ink'} ${on && tint ? 'on-pastel' : ''}`}
      style={{ background: on && tint ? tint : 'var(--surface)' }}
      {...rest}
    >
      <span className="text-base font-bold">{title}</span>
      {sub && <span className={`text-sm ${on && tint ? '' : 'text-ink-soft'}`}>{sub}</span>}
    </button>
  )
}

/* ---------- Card: a box on the page ---------- */

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`border-2 border-rule bg-surface p-4 ${className}`}>{children}</div>
}

/* ---------- Page heading: outlined display font, tinted with the tab color, rule across the page ---------- */

export function PageHeading({ children, color, sub }: { children: ReactNode; color: string; sub?: ReactNode }) {
  // deep tint on light paper, the pastel itself on dark paper (both readable)
  const light = PASTELS.find((c) => c.deep === color)?.hex ?? color
  const vars = { '--h-light': color, '--h-dark': light } as React.CSSProperties
  return (
    <div className="flex flex-col gap-2" style={vars}>
      <h1 className="page-heading text-2xl uppercase">{children}</h1>
      <hr className="page-rule border-t-2" />
      {sub && <p className="text-base text-ink-soft">{sub}</p>}
    </div>
  )
}

export function SubHeading({ children }: { children: ReactNode }) {
  return <h2 className="text-lg font-bold">{children}</h2>
}

/* ---------- Member avatar: color + initials, so color is never the only clue ---------- */

export const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?'

export function Avatar({ name, color, size = 40, dim, photo }: { name: string; color: string; size?: number; dim?: boolean; photo?: string }) {
  return (
    <span
      title={name}
      aria-label={name}
      role="img"
      className={`on-pastel relative inline-flex shrink-0 items-center justify-center border-2 border-ink font-bold ${dim ? 'opacity-40' : ''}`}
      style={{ width: size, height: size, background: color, fontSize: size < 36 ? 13 : 16 }}
    >
      {photo ? <img src={photo} alt="" className="h-full w-full object-cover" /> : initials(name)}
      {photo && <span className="absolute -bottom-1 -right-1 border border-ink bg-surface px-0.5 text-[10px] leading-3">{initials(name)}</span>}
    </span>
  )
}

export function AvatarRow({ people, size = 32 }: { people: { name: string; color: string; dim?: boolean; photo?: string }[]; size?: number }) {
  return (
    <span className="inline-flex -space-x-1">
      {people.map((p, i) => <Avatar key={i} {...p} size={size} />)}
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
          <span className={`h-2 ${i <= at ? 'bg-accent' : 'bg-muted'}`} />
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
      <button type="button" aria-label="What does this mean?" aria-expanded={open} onClick={() => setOpen(!open)}
        className="ml-1 inline-flex h-6 w-6 items-center justify-center border border-ink text-sm font-normal">?</button>
      {open && (
        <span role="tooltip" className="absolute left-1/2 z-20 mt-2 block w-60 -translate-x-1/2 border-2 border-ink bg-surface p-3 text-sm font-normal text-ink shadow-[var(--sticker-shadow)]">
          {text}
        </span>
      )}
    </span>
  )
}

/* ---------- Bottom sheet ---------- */

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title}
        className="paper rise max-h-[90dvh] w-full max-w-lg overflow-y-auto p-6 shadow-[var(--page-shadow)]"
        onClick={(e) => e.stopPropagation()}>
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
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-8 z-50 flex justify-center px-4">
        {msg && <div className="rise bg-ink px-5 py-3 text-base text-bg shadow-[var(--sticker-shadow)]">{msg}</div>}
      </div>
    </ToastCtx.Provider>
  )
}

/* ---------- Loading with friendly lines ---------- */

export function Working({ lines }: { lines: string[] }) {
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = window.setInterval(() => setI((x) => Math.min(x + 1, lines.length - 1)), 2200)
    return () => window.clearInterval(t)
  }, [lines.length])
  return (
    <div className="flex flex-col items-center gap-4 py-10 text-center" role="status">
      <span className="h-8 w-8 animate-spin border-4 border-muted border-t-accent" aria-hidden="true" />
      <p className="font-hand text-2xl">{lines[i]}</p>
    </div>
  )
}

export function ErrorBox({ message, fix, onFix }: { message: string; fix?: string; onFix?: () => void }) {
  return (
    <div role="alert" className="flex flex-col gap-3 border-2 border-danger bg-danger-soft p-4">
      <p className="text-base">{message}</p>
      {fix && onFix && <Button variant="secondary" onClick={onFix}>{fix}</Button>}
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
  'min-h-12 w-full border-2 border-rule bg-surface px-4 text-base text-ink placeholder:text-ink-soft focus:border-ink focus:outline-none'

/** Tiny handwritten margin note. */
export function Note({ children }: { children: ReactNode }) {
  return <p className="font-hand text-xl leading-6 text-ink-soft">{children}</p>
}
