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
      className={`project-card project-card--placeholder${visible ? ' is-visible' : ''}`}
      style={{ '--delay': `${index * 90}ms` }}
      ref={setRefs}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
    >
      <span className="project-card__border" aria-hidden="true" />
      <span className="project-card__spotlight" aria-hidden="true" />
      <div className="project-card__body">
        <h3>{project.title}</h3>
        <p>{project.description}</p>
        <div className="tags">
          {project.tags.map((tag) => (
            <span className="tag tag--small" key={tag}>
              {tag}
            </span>
          ))}
        </div>
        <span className="project-card__badge">Coming soon</span>
      </div>
    </div>
  )
}
