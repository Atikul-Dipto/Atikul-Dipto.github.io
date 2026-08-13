import { profile, projects } from '../data'

export default function Projects() {
  return (
    <section id="projects" className="section section--alt">
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
        {projects.map((project) => (
          <div className="project-card project-card--placeholder" key={project.title}>
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
        ))}
      </div>
    </section>
  )
}
