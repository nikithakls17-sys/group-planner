/** A marked space for an illustration that will be added later. */
export function IllustrationSlot({ name, ratio = '4 / 3', note }: { name: string; ratio?: string; note?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 border-2 border-dashed border-ink-soft bg-surface/60 p-4 text-center"
      style={{ aspectRatio: ratio }} data-illustration={name}>
      <span className="label">Illustration: {name}</span>
      {note && <span className="font-hand text-xl text-ink-soft">{note}</span>}
    </div>
  )
}
