import { useRef } from 'react'
import { profile } from '../data'

export default function Hero() {
  const frameRef = useRef(null)

  const handlePointerMove = (e) => {
    const el = frameRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const px = (e.clientX - rect.left) / rect.width
    const py = (e.clientY - rect.top) / rect.height
    const rotateY = (px - 0.5) * 16
    const rotateX = (0.5 - py) * 16
    el.style.setProperty('--rx', `${rotateX.toFixed(2)}deg`)
    el.style.setProperty('--ry', `${rotateY.toFixed(2)}deg`)
    el.style.setProperty('--gx', `${(px * 100).toFixed(1)}%`)
    el.style.setProperty('--gy', `${(py * 100).toFixed(1)}%`)
  }

  const handlePointerLeave = () => {
    const el = frameRef.current
    if (!el) return
    el.style.setProperty('--rx', '0deg')
    el.style.setProperty('--ry', '0deg')
  }

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
          <div
            className="portrait-frame"
            ref={frameRef}
            onPointerMove={handlePointerMove}
            onPointerLeave={handlePointerLeave}
          >
            <span className="portrait-frame__ring" />
            <span className="portrait-frame__glow" />
            <img
              className="portrait-frame__img"
              src={profile.photo}
              alt={profile.photoAlt}
              loading="eager"
            />
          </div>
        </div>
      </div>
    </section>
  )
}
