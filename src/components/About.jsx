import { profile, education, certifications } from '../data'
import { useReveal } from '../hooks/useReveal'

export default function About() {
  const { ref: bioRef, visible: bioVisible } = useReveal({ threshold: 0.3 })

  return (
    <section id="about" className="section">
      <div className="about">
        <div className="about__text">
          <h2 className="section__heading">About</h2>
          <p className={`about__bio${bioVisible ? ' is-visible' : ''}`} ref={bioRef}>
            {profile.bio.map((part, i) =>
              typeof part === 'string' ? (
                <span key={i}>{part}</span>
              ) : (
                <strong className="bio-highlight" style={{ '--hl-delay': `${i * 120}ms` }} key={i}>
                  {part.text}
                </strong>
              ),
            )}
          </p>
        </div>

        <div className="about__side">
          <div className="card">
            <h3>Education</h3>
            <p className="card__title">{education.degree}</p>
            <p className="card__meta">
              {education.school} &middot; {education.period}
            </p>
            <p className="card__detail">{education.detail}</p>
          </div>

          <div className="card">
            <h3>Certifications</h3>
            <ul className="plain-list">
              {certifications.map((cert) => (
                <li key={cert}>{cert}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}
