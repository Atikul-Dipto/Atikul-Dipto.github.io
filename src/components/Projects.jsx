import { useEffect, useRef } from 'react'
import { profile, projects } from '../data'
import ProjectCard from './ProjectCard'

export default function Projects() {
  const viewportRef = useRef(null)

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    viewport.scrollLeft = viewport.scrollWidth
  }, [])

  const scrollProjects = (direction) => {
    viewportRef.current?.scrollBy({ left: direction * 420, behavior: 'smooth' })
  }

  return (
    <section id="projects" className="section section--alt projects-section">
      <div className="projects-glow" aria-hidden="true">
        <span className="projects-glow__blob projects-glow__blob--one" />
        <span className="projects-glow__blob projects-glow__blob--two" />
        <span className="projects-glow__grid" />
      </div>
      <h2 className="section__heading">Projects</h2>
      <p className="section__intro">
        A growing collection of analytics tools, visual experiments, and operational products. Follow along
        on{' '}
        <a href={profile.github} target="_blank" rel="noreferrer">
          GitHub
        </a>
        .
      </p>
      <div className="projects-controls" aria-label="Project navigation">
        <button type="button" onClick={() => scrollProjects(-1)} aria-label="Show previous projects">
          <span aria-hidden="true">←</span>
        </button>
        <span>Scroll to explore</span>
        <button type="button" onClick={() => scrollProjects(1)} aria-label="Show next projects">
          <span aria-hidden="true">→</span>
        </button>
      </div>
      <div className="projects-viewport" ref={viewportRef}>
        <div className="projects">
          {projects.map((project, index) => (
            <ProjectCard project={project} index={index} key={`primary-${project.title}`} />
          ))}
        </div>
      </div>
    </section>
  )
}
