/** Cal, the lazy calendar. Ink-line, slightly wobbly, with a face and limbs, so the app has someone to do the planning. */
export type Mood = 'sleepy' | 'happy' | 'thinking' | 'wave'

export default function Mascot({ mood = 'happy', size = 120, className = '' }: { mood?: Mood; size?: number; className?: string }) {
  const s = { stroke: 'var(--ink)', strokeWidth: 2.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' }
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" className={className} role="img" aria-label="Cal, a lazy calendar character">
      {/* legs */}
      <path {...s} d="M46 98 C45 104 44 108 40 110 M74 98 C75 104 77 108 82 110" />
      <path {...s} d="M36 111 L44 111 M78 111 L87 111" />
      {/* arms */}
      {mood === 'wave' ? (
        <path {...s} d="M27 62 C18 58 14 48 16 38 M14 34 l3 4 M19 33 l-1 5" />
      ) : mood === 'thinking' ? (
        <path {...s} d="M27 66 C20 70 24 80 34 78" />
      ) : (
        <path {...s} d="M27 64 C18 68 15 76 17 84" />
      )}
      <path {...s} d={mood === 'happy' ? 'M93 64 C103 58 107 50 106 42' : 'M93 64 C101 70 104 78 102 86'} />
      {/* body: a calendar page, drawn a little off-square */}
      <path {...s} fill="var(--surface)" d="M28 30 C47 28 74 29 93 30 C94 50 94 76 93 98 C72 99 49 99 27 98 C26 76 27 50 28 30 Z" />
      <path {...s} fill="var(--accent)" d="M28 30 C47 28 74 29 93 30 L93 43 C72 44 49 44 28 43 Z" />
      {/* rings */}
      <path {...s} d="M44 24 L44 35 M76 24 L76 35" />
      {/* face */}
      {mood === 'sleepy' ? (
        <>
          <path {...s} d="M45 62 q5 4 10 0 M66 62 q5 4 10 0" />
          <path {...s} strokeWidth={1.8} d="M86 50 l6 0 l-6 6 l6 0 M96 42 l4 0 l-4 4 l4 0" />
        </>
      ) : mood === 'thinking' ? (
        <>
          <circle cx="50" cy="61" r="2.6" fill="var(--ink)" />
          <circle cx="71" cy="59" r="2.6" fill="var(--ink)" />
          <path {...s} d="M66 53 q5 -3 10 0" />
        </>
      ) : (
        <>
          <circle cx="50" cy="61" r="2.8" fill="var(--ink)" />
          <circle cx="71" cy="61" r="2.8" fill="var(--ink)" />
        </>
      )}
      <path {...s} d={mood === 'thinking' ? 'M54 79 q6 -2 12 0' : 'M52 75 q8 8 17 0'} />
      {/* cheeks, crosshatched */}
      <path {...s} strokeWidth={1.2} d="M40 70 l4 -4 M43 71 l4 -4 M78 70 l4 -4 M81 71 l4 -4" />
    </svg>
  )
}

/** A marked space for an illustration that will be added later. */
export function IllustrationSlot({ name, ratio = '4 / 3', note }: { name: string; ratio?: string; note?: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-1 border-2 border-dashed border-ink-soft bg-surface/60 p-4 text-center"
      style={{ aspectRatio: ratio }}
      data-illustration={name}
    >
      <span className="label text-ink-soft">Illustration: {name}</span>
      {note && <span className="font-hand text-base text-ink-soft">{note}</span>}
    </div>
  )
}
