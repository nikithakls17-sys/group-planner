import type { Plan } from '../api'
import { Note, PageHeading } from '../components/ui'

/** Placeholder until the Money tab is built. */
export default function MoneyPage({ color }: { plan: Plan; member: string | null; call: unknown; run: unknown; busy: boolean; color: string }) {
  return (
    <>
      <PageHeading color={color}>Money</PageHeading>
      <Note>This page is being built.</Note>
    </>
  )
}
