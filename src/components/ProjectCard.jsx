import { useTiltSpotlight } from '../hooks/useTiltSpotlight'
import { useReveal } from '../hooks/useReveal'

export default function ProjectCard({ project, index }) {
  const { ref: tiltRef, onPointerMove, onPointerLeave } = useTiltSpotlight({ max: 8 })
  const { ref: revealRef, visible } = useReveal()

  const setRefs = (el) => {
    tiltRef.current = el
    revealRef.current = el
  }

  return (
    <div
      className={`project-card${project.placeholder ? ' project-card--placeholder' : ''}${visible ? ' is-visible' : ''}`}
      style={{ '--delay': `${index * 90}ms` }}
      ref={setRefs}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
    >
      <span className="project-card__border" aria-hidden="true" />
      <span className="project-card__spotlight" aria-hidden="true" />
      <div className="project-card__body">
        <div className="project-card__screenshot">
          <img src={project.screenshot} alt={`${project.title} screenshot`} loading="lazy" />
          <span className="project-card__screenshot-label">Project preview</span>
        </div>
        <h3>{project.title}</h3>
        <p className="project-card__summary">{project.summary}</p>
        <p>{project.description}</p>
        <div className="tags">
          {project.tags.map((tag) => (
            <span className="tag tag--small" key={tag}>
              {tag}
            </span>
          ))}
        </div>
        {project.placeholder ? (
          <span className="project-card__badge">Coming soon</span>
        ) : (
          <div className="project-card__links">
            {project.demoHref && (
              <a
                className="project-card__link project-card__link--primary"
                href={project.demoHref}
                target="_blank"
                rel="noreferrer"
              >
                Live Demo →
              </a>
            )}
            {project.href && (
              <a className="project-card__link" href={project.href} target="_blank" rel="noreferrer">
                GitHub →
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
