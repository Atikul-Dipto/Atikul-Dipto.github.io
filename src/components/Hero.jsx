import { profile } from '../data'

export default function Hero() {
  return (
    <section id="top" className="hero">
      <div className="hero__grid" aria-hidden="true" />
      <div className="hero__content">
        <p className="eyebrow">{profile.location}</p>
        <h1>
          {profile.name}
          <span className="hero__title">{profile.title}</span>
        </h1>
        <p className="hero__tagline">{profile.tagline}</p>
        <div className="hero__actions">
          <a className="btn btn--primary" href="#projects">
            View Projects
          </a>
          <a className="btn btn--ghost" href={profile.resumeUrl} download>
            Download Resume
          </a>
          <a className="btn btn--ghost" href="#contact">
            Get in Touch
          </a>
        </div>
      </div>
    </section>
  )
}
