import { useEffect, useRef, useState } from 'react'
import { checkName, citizens, joinCitizens, type Citizen } from '../lib/citizens'
import { useSilo } from '../state/useSilo'

/**
 * The citizens' kiosk: would you like to become a member of the Silo? Yes,
 * a name, and a certificate -- and the name goes up on the room's wall, for
 * everyone who comes in after.
 */

type Step = { at: 'ask' } | { at: 'form'; error: string | null; sending: boolean } | { at: 'done'; citizen: Citizen }

function drawCertificate(cv: HTMLCanvasElement, c: Citizen) {
  const g = cv.getContext('2d')!
  const W = cv.width
  const H = cv.height
  const grad = g.createLinearGradient(0, 0, W, H)
  grad.addColorStop(0, '#0b141c')
  grad.addColorStop(1, '#16222c')
  g.fillStyle = grad
  g.fillRect(0, 0, W, H)
  g.strokeStyle = '#8fd3ff'
  g.lineWidth = 6
  g.strokeRect(30, 30, W - 60, H - 60)
  g.strokeStyle = 'rgba(255,210,122,0.8)'
  g.lineWidth = 2
  g.strokeRect(48, 48, W - 96, H - 96)
  g.textAlign = 'center'
  g.fillStyle = '#8fd3ff'
  g.font = '700 30px ui-monospace, Consolas, monospace'
  g.fillText('THE SILO  ·  RECREATION LEVEL', W / 2, 140)
  g.fillStyle = '#ffd27a'
  g.font = '700 78px Georgia, serif'
  g.fillText('Certificate of Citizenship', W / 2, 260)
  g.fillStyle = '#d6ecfa'
  g.font = 'italic 400 36px Georgia, serif'
  g.fillText('This certifies that', W / 2, 360)
  g.fillStyle = '#ffffff'
  g.font = '700 92px "Segoe UI", "Helvetica Neue", Arial, sans-serif'
  g.fillText(c.name, W / 2, 490, W - 200)
  g.fillStyle = '#d6ecfa'
  g.font = 'italic 400 36px Georgia, serif'
  g.fillText('is a citizen of the Silo, and their name is on its wall.', W / 2, 580, W - 200)
  g.fillStyle = '#8fd3ff'
  g.font = '700 44px ui-monospace, Consolas, monospace'
  g.fillText(`CITIZEN No. ${String(c.n).padStart(5, '0')}`, W / 2, 700)
  g.fillStyle = 'rgba(214,236,250,0.75)'
  g.font = '400 28px ui-monospace, Consolas, monospace'
  g.fillText(new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }), W / 2, 760)
  // The seal.
  g.strokeStyle = '#ffd27a'
  g.lineWidth = 4
  g.beginPath()
  g.arc(W - 220, H - 200, 80, 0, Math.PI * 2)
  g.stroke()
  g.beginPath()
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    g.moveTo(W - 220, H - 200)
    g.lineTo(W - 220 + Math.cos(a) * 66, H - 200 + Math.sin(a) * 66)
  }
  g.stroke()
}

export default function CitizenPanel() {
  const open = useSilo((s) => s.panel === 'citizen')
  const close = useSilo((s) => s.closePanel)
  const [step, setStep] = useState<Step>({ at: 'ask' })
  const [name, setName] = useState('')
  const canvas = useRef<HTMLCanvasElement>(null)
  const mine = citizens.mine !== null ? citizens.list.find((c) => c.n === citizens.mine) ?? null : null

  useEffect(() => {
    if (!open) return
    setStep({ at: 'ask' })
    setName('')
  }, [open])

  useEffect(() => {
    if (step.at === 'done' && canvas.current) drawCertificate(canvas.current, step.citizen)
  }, [step])

  if (!open) return null

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const problem = checkName(name)
    if (problem) {
      setStep({ at: 'form', error: problem, sending: false })
      return
    }
    setStep({ at: 'form', error: null, sending: true })
    const r = await joinCitizens(name)
    if (r.ok) setStep({ at: 'done', citizen: r.citizen })
    else setStep({ at: 'form', error: r.reason, sending: false })
  }

  const download = () => {
    if (!canvas.current || step.at !== 'done') return
    const a = document.createElement('a')
    a.href = canvas.current.toDataURL('image/png')
    a.download = `silo-citizen-${step.citizen.n}.png`
    a.click()
  }

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label="Silo citizenship">
      <div className="sheet__panel sheet__panel--wide citizen">
        <div className="sheet__head">
          <div>
            <p className="sheet__eyebrow">Recreation · the citizens' room</p>
            <h2>Silo citizenship</h2>
          </div>
          <button type="button" className="btn btn--ghost" onClick={close}>
            Close
          </button>
        </div>

        {step.at === 'ask' && (
          <div className="citizen__ask">
            <p className="citizen__q">Would you like to become a member of the Silo?</p>
            <p className="citizen__note">
              Your name goes up on the wall of this room, for everyone who visits to see. {citizens.list.length ? `${citizens.list.length} ${citizens.list.length === 1 ? 'citizen so far' : 'citizens so far'}.` : ''}
            </p>
            <div className="citizen__actions">
              <button type="button" className="btn btn--primary" onClick={() => setStep({ at: 'form', error: null, sending: false })}>
                Yes, I'd like to join
              </button>
              {mine && (
                <button type="button" className="btn btn--ghost" onClick={() => setStep({ at: 'done', citizen: mine })}>
                  See my certificate (No. {mine.n})
                </button>
              )}
              <button type="button" className="btn btn--ghost" onClick={close}>
                Not now
              </button>
            </div>
          </div>
        )}

        {step.at === 'form' && (
          <form className="citizen__form" onSubmit={submit}>
            <label htmlFor="citizen-name">The name to put on the wall</label>
            <input
              id="citizen-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              autoComplete="name"
              autoFocus
              placeholder="Your name"
              disabled={step.sending}
            />
            <p className="citizen__note">
              Shown to everyone, on this wall only. Up to 40 letters; names with abuse in them are refused and removed. Nothing else about you is kept with it.
            </p>
            {step.error && (
              <p className="citizen__error" role="alert">
                {step.error}
              </p>
            )}
            <div className="citizen__actions">
              <button type="submit" className="btn btn--primary" disabled={step.sending}>
                {step.sending ? 'Adding…' : 'Become a citizen'}
              </button>
              <button type="button" className="btn btn--ghost" onClick={() => setStep({ at: 'ask' })} disabled={step.sending}>
                Back
              </button>
            </div>
          </form>
        )}

        {step.at === 'done' && (
          <div className="citizen__done">
            <canvas ref={canvas} width={1600} height={1000} className="citizen__cert" aria-label={`Certificate of citizenship for ${step.citizen.name}, citizen number ${step.citizen.n}`} />
            <p className="citizen__note">Your name is on the wall now. Look round the room.</p>
            <div className="citizen__actions">
              <button type="button" className="btn btn--primary" onClick={download}>
                Download the certificate
              </button>
              <button type="button" className="btn btn--ghost" onClick={close}>
                Back to the room
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
