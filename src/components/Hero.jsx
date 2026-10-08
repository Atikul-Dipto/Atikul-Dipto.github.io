import { profile } from '../data'
import HeroGlobe from './HeroGlobe'

export default function Hero() {
  return (
    <section id="top" className="hero">
      <div className="hero__grid" aria-hidden="true" />
      <div className="hero__inner">
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
            <span className="btn-pulse-wrap">
              <a className="btn btn--ghost" href="#contact">
                Get in Touch
              </a>
            </span>
          </div>

          <div className="hero__stats" aria-label="Quick profile stats">
            {profile.stats.map((stat) => (
              <div className="hero__stat" key={stat.label}>
                <strong>{stat.value}</strong>
                <span>{stat.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="hero__portrait">
          <HeroGlobe />
        </div>
      </div>
    </section>
  )
}
