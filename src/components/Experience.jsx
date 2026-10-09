import { useEffect, useRef } from 'react'
import { experience } from '../data'
import { useReveal } from '../hooks/useReveal'

function Job({ job, index }) {
  const { ref, visible } = useReveal({ threshold: 0.12 })

  // Both logo variants ship in the markup; CSS shows the one that suits the
  // active theme, so there is no flash when the OS theme changes.
  const logo = job.logo && (
    <span className="timeline__logo">
      <img className="timeline__logo-img timeline__logo-img--light" src={job.logo} alt="" loading="lazy" />
      <img
        className="timeline__logo-img timeline__logo-img--dark"
        src={job.logoDark ?? job.logo}
        alt=""
        loading="lazy"
      />
    </span>
  )

  return (
    <li
      className={`timeline__item${visible ? ' is-visible' : ''}`}
      style={{ '--delay': `${index * 110}ms` }}
      ref={ref}
    >
      <div className="timeline__marker" />
      <div className="timeline__content">
        <div className="timeline__brand">
          {job.orgUrl && logo ? (
            <a
              className="timeline__logo-link"
              href={job.orgUrl}
              target="_blank"
              rel="noreferrer"
              aria-label={`${job.org} website`}
            >
              {logo}
            </a>
          ) : (
            logo
          )}
          <div className="timeline__brand-text">
            <div className="timeline__head">
              <h3>{job.role}</h3>
              <span className="timeline__period">{job.period}</span>
            </div>
            <p className="timeline__org">
              <strong>{job.org}</strong>
              {job.orgNote && <em> — {job.orgNote}</em>}
              <span className="timeline__dot" aria-hidden="true">
                ·
              </span>
              {job.location}
            </p>
          </div>
        </div>
        <ul>
          {job.points.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      </div>
    </li>
  )
}

export default function Experience() {
  const listRef = useRef(null)

  // The spine fills as you read down the list — a time series drawing itself.
  useEffect(() => {
    const el = listRef.current
    if (!el) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      el.style.setProperty('--timeline-progress', '1')
      return
    }

    let raf = 0
    const measure = () => {
      raf = 0
      const rect = el.getBoundingClientRect()
      // Complete when the end of the list reaches the lower third of the screen.
      const start = window.innerHeight * 0.85
      const span = rect.height + start - window.innerHeight * 0.35
      const p = Math.min(1, Math.max(0, (start - rect.top) / span))
      el.style.setProperty('--timeline-progress', p.toFixed(3))
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(measure)
    }

    measure()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  return (
    <section id="experience" className="section">
      <h2 className="section__heading">Experience</h2>
      <ol className="timeline" ref={listRef}>
        {experience.map((job, index) => (
          <Job job={job} index={index} key={job.role + job.org} />
        ))}
      </ol>
    </section>
  )
}
