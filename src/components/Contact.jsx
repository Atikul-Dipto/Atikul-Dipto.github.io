import { profile } from '../data'

export default function Contact() {
  return (
    <section id="contact" className="section">
      <h2 className="section__heading">Get in Touch</h2>
      <p className="section__intro">
        Open to data analyst roles, collaborations, or just talking data. Reach out.
      </p>
      <div className="contact-grid">
        <a className="contact-card" href={`mailto:${profile.email}`}>
          <span className="contact-card__label">Email</span>
          <span className="contact-card__value">{profile.email}</span>
        </a>
        <a className="contact-card" href={profile.linkedin} target="_blank" rel="noreferrer">
          <span className="contact-card__label">LinkedIn</span>
          <span className="contact-card__value">in/AtikulIslam</span>
        </a>
        <a className="contact-card" href={profile.github} target="_blank" rel="noreferrer">
          <span className="contact-card__label">GitHub</span>
          <span className="contact-card__value">@{profile.githubHandle}</span>
        </a>
        <a className="contact-card" href={`tel:${profile.phone.replace(/\s+/g, '')}`}>
          <span className="contact-card__label">Phone</span>
          <span className="contact-card__value">{profile.phone}</span>
        </a>
      </div>
    </section>
  )
}
