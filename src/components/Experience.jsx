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
  return (
    <section id="experience" className="section">
      <h2 className="section__heading">Experience</h2>
      <ol className="timeline">
        {experience.map((job, index) => (
          <Job job={job} index={index} key={job.role + job.org} />
        ))}
      </ol>
    </section>
  )
}
