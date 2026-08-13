import { profile, projects } from '../data'
import ProjectCard from './ProjectCard'

export default function Projects() {
  return (
    <section id="projects" className="section section--alt projects-section">
      <div className="projects-glow" aria-hidden="true">
        <span className="projects-glow__blob projects-glow__blob--one" />
        <span className="projects-glow__blob projects-glow__blob--two" />
        <span className="projects-glow__grid" />
      </div>
      <h2 className="section__heading">Projects</h2>
      <p className="section__intro">
        This section is intentionally empty for now — new to GitHub, and these
        slots are waiting for real work. Follow along on{' '}
        <a href={profile.github} target="_blank" rel="noreferrer">
          GitHub
        </a>
        .
      </p>
      <div className="projects">
        {projects.map((project, index) => (
          <ProjectCard project={project} index={index} key={project.title} />
        ))}
      </div>
    </section>
  )
}
