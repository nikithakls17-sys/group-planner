import type { Plan } from '../api'
import { Note, PageHeading } from '../components/ui'

const TITLES: Record<string, string> = { wear: 'What are we wearing?', rides: 'Getting there', map: 'Where is everyone?' }

/** Placeholder until the after-the-plan pages are built. */
export default function GoPage({ color, section }: { plan: Plan; member: string | null; call: unknown; run: unknown; busy: boolean; color: string; section: string }) {
  return (
    <>
      <PageHeading color={color}>{TITLES[section] ?? section}</PageHeading>
      <Note>This page is being built.</Note>
    </>
  )
}
