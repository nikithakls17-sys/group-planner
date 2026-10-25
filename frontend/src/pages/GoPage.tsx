import type { Plan } from '../api'
import { Note, PageHeading } from '../components/ui'

/** Placeholder until the Go tab is built. */
export default function GoPage({ color }: { plan: Plan; member: string | null; call: unknown; run: unknown; busy: boolean; color: string }) {
  return (
    <>
      <PageHeading color={color}>Go</PageHeading>
      <Note>This page is being built.</Note>
    </>
  )
}
