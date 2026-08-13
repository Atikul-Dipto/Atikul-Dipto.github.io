import { experience } from '../data'

export default function Experience() {
  return (
    <section id="experience" className="section">
      <h2 className="section__heading">Experience</h2>
      <ol className="timeline">
        {experience.map((job) => (
          <li className="timeline__item" key={job.role + job.org}>
            <div className="timeline__marker" />
            <div className="timeline__content">
              <div className="timeline__head">
                <h3>{job.role}</h3>
                <span className="timeline__period">{job.period}</span>
              </div>
              <p className="timeline__org">
                {job.org} &middot; {job.location}
              </p>
              <ul>
                {job.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
