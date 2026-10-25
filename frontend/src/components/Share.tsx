import QRCode from 'qrcode'
import { useEffect, useState } from 'react'
import { Button, Field, inputCls, useToast } from './ui'

export function planLink(id: string) {
  return `${window.location.origin}/p/${id}`
}

export function inviteText(planner: string, what: string, deadline?: string) {
  const by = deadline ? ` by ${new Date(deadline).toLocaleString(undefined, { weekday: 'long', hour: 'numeric', minute: '2-digit' })}` : ''
  return `${planner} is planning ${what}. Tap the link, answer once (about a minute)${by}, and the app sorts out the rest:`
}

/** Web Share API first (WhatsApp, iMessage, Instagram, Slack, email...), then copy link, email and QR. */
export default function Share({ id, message: initial }: { id: string; message: string }) {
  const toast = useToast()
  const [message, setMessage] = useState(initial)
  const [qr, setQr] = useState('')
  const [showQr, setShowQr] = useState(false)
  const link = planLink(id)
  useEffect(() => {
    QRCode.toDataURL(link, { margin: 1, width: 240 }).then(setQr).catch(() => setQr(''))
  }, [link])
  const canShare = typeof navigator !== 'undefined' && 'share' in navigator
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${message} ${link}`)
      toast('Copied. Paste it in your group chat.')
    } catch {
      toast('Copy did not work. Long-press the link to copy it.')
    }
  }
  const share = async () => {
    try {
      await navigator.share({ text: `${message} ${link}` })
    } catch { /* closed the share sheet */ }
  }
  return (
    <div className="flex flex-col gap-4">
      <Field label="Message (you can edit it)">
        <textarea className={`${inputCls} min-h-28 py-3`} value={message} onChange={(e) => setMessage(e.target.value)} />
      </Field>
      <p className="break-all rounded-[var(--radius-card)] bg-muted px-4 py-3 text-sm">{link}</p>
      {canShare ? <Button full onClick={share}>Share</Button> : <Button full onClick={copy}>Copy message and link</Button>}
      <div className="grid grid-cols-3 gap-2">
        {canShare && <Button variant="secondary" onClick={copy}>Copy</Button>}
        <a
          className="inline-flex min-h-12 items-center justify-center rounded-[var(--radius-card)] border-2 border-line bg-surface px-4 text-base font-semibold"
          href={`mailto:?subject=${encodeURIComponent('Quick plan question')}&body=${encodeURIComponent(`${message}\n\n${link}`)}`}
        >
          Email
        </a>
        <Button variant="secondary" onClick={() => setShowQr(!showQr)}>QR code</Button>
      </div>
      {showQr && qr && (
        <div className="flex flex-col items-center gap-2">
          <img src={qr} alt="QR code for the plan link" width={240} height={240} className="rounded-xl" />
          <p className="text-sm text-ink-soft">Friends can scan this with their phone camera.</p>
        </div>
      )}
    </div>
  )
}
