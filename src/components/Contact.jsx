import { profile } from '../data'
import ContactCard from './ContactCard'

function getMethods(p) {
  return [
    { key: 'email', label: 'Email', value: p.email, href: `mailto:${p.email}`, icon: 'mail' },
    {
      key: 'linkedin',
      label: 'LinkedIn',
      value: `in/${p.linkedinHandle}`,
      href: p.linkedin,
      icon: 'linkedin',
      external: true,
    },
    {
      key: 'github',
      label: 'GitHub',
      value: `@${p.githubHandle}`,
      href: p.github,
      icon: 'github',
      external: true,
    },
    { key: 'phone', label: 'Phone', value: p.phone, href: `tel:${p.phone.replace(/\s+/g, '')}`, icon: 'phone' },
  ]
}

export default function Contact() {
  const methods = getMethods(profile)

  return (
    <section id="contact" className="section">
      <h2 className="section__heading">Get in Touch</h2>
      <p className="section__intro">
        Open to data analyst roles, collaborations, or just talking data. Reach out.
      </p>
      <div className="contact-grid">
        {methods.map((method, index) => (
          <ContactCard method={method} index={index} key={method.key} />
        ))}
      </div>
    </section>
  )
}
