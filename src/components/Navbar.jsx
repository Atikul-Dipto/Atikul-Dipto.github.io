import { useEffect, useState } from 'react'
import { profile } from '../data'

const LINKS = [
  { href: '#about', label: 'About' },
  { href: '#skills', label: 'Skills' },
  { href: '#experience', label: 'Experience' },
  { href: '#projects', label: 'Projects' },
  { href: '#next', label: "What's Next" },
  { href: '#contact', label: 'Contact' },
]

export default function Navbar() {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [active, setActive] = useState('about')

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 8)

      const sectionEls = [...document.querySelectorAll('main section[id]')]
      if (!sectionEls.length) return

      const offset = window.innerHeight * 0.32
      let nextActive = 'about'

      for (const section of sectionEls) {
        const top = section.offsetTop - offset
        const bottom = top + section.offsetHeight

        if (window.scrollY >= top && window.scrollY < bottom) {
          nextActive = section.id
          break
        }
      }

      setActive(nextActive)
    }

    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header className={`nav${scrolled ? ' nav--scrolled' : ''}`}>
      <div className="nav__inner">
        <a href="#top" className="nav__brand" onClick={() => setOpen(false)}>
          {profile.name}
        </a>

        <nav className={`nav__links${open ? ' nav__links--open' : ''}`}>
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className={active === link.href.slice(1) ? 'active' : ''}
            >
              {link.label}
            </a>
          ))}
        </nav>

        <button
          className="nav__toggle"
          aria-label="Toggle navigation menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span />
          <span />
          <span />
        </button>
      </div>
    </header>
  )
}
