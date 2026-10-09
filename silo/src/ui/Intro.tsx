import { identity } from '../content/portfolio'
import { useSilo } from '../state/useSilo'

/**
 * The approach sequence. Skippable immediately (spec §3) — ENTER works from
 * the first frame, and every action here is a real destination.
 */
export default function Intro() {
  const enter = useSilo((s) => s.enter)
  const goToLevel = useSilo((s) => s.goToLevel)
  const setCvOpen = useSilo((s) => s.setCvOpen)

  return (
    <div className="intro">
      <div className="intro__vignette" aria-hidden="true" />
      <div className="intro__inner">
        <p className="intro__eyebrow">Structure 01 · Depth 12 levels · Status operational</p>
        <h1 className="intro__name">{identity.name}</h1>
        <p className="intro__headline">{identity.headline}</p>
        <p className="intro__blurb">{identity.intro}</p>

        <div className="intro__actions">
          <button type="button" className="btn btn--primary" onClick={enter}>
            Enter the Silo
          </button>
          <button type="button" className="btn" onClick={() => setCvOpen(true)}>
            View CV
          </button>
          <button type="button" className="btn" onClick={() => goToLevel(7)}>
            Explore Projects
          </button>
        </div>

        <p className="intro__skip">
          <a href="/">Prefer a conventional page? Read the standard portfolio →</a>
        </p>
      </div>
    </div>
  )
}
