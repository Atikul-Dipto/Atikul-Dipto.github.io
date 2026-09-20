import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { profile, projects } from '../data'
import ProjectCard from './ProjectCard'

// Vertical scroll distance (px) spent per px of horizontal travel while pinned.
const SCROLL_RATIO = 1

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

export default function Projects() {
  const sectionRef = useRef(null)
  const stickyRef = useRef(null)
  const viewportRef = useRef(null)
  const trackRef = useRef(null)
  const progressRef = useRef(null)

  // Pinned = the section becomes a scroll-driven layer: it sticks to the
  // viewport and vertical scroll slides the track sideways. Falls back to the
  // native horizontal scroller on small screens, short viewports, when the
  // track already fits, or when the visitor prefers reduced motion.
  const [pinned, setPinned] = useState(false)
  const [travel, setTravel] = useState(0)

  useLayoutEffect(() => {
    const section = sectionRef.current
    const sticky = stickyRef.current
    const viewport = viewportRef.current
    const track = trackRef.current
    if (!section || !sticky || !viewport || !track) return

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)')
    const narrow = window.matchMedia('(max-width: 760px)')

    const measure = () => {
      const maxShift = track.scrollWidth - viewport.clientWidth
      // Measure the height the layer would have when pinned (compact paddings,
      // no min-height), keeping it in normal flow for the measurement.
      const hadPinned = section.classList.contains('projects-section--pinned')
      section.classList.add('projects-section--pinned')
      sticky.style.position = 'relative'
      sticky.style.minHeight = '0'
      const fits = sticky.offsetHeight <= window.innerHeight
      sticky.style.position = ''
      sticky.style.minHeight = ''
      if (!hadPinned) section.classList.remove('projects-section--pinned')

      const shouldPin = !reduce.matches && !narrow.matches && fits && maxShift > 24
      setPinned(shouldPin)
      setTravel(shouldPin ? maxShift : 0)
    }

    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(track)
    ro.observe(viewport)
    window.addEventListener('resize', measure)
    reduce.addEventListener?.('change', measure)
    narrow.addEventListener?.('change', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
      reduce.removeEventListener?.('change', measure)
      narrow.removeEventListener?.('change', measure)
    }
  }, [])

  // Scroll → horizontal shift, written straight to CSS variables so nothing
  // re-renders per frame.
  useEffect(() => {
    const section = sectionRef.current
    const track = trackRef.current
    const bar = progressRef.current
    if (!section || !track) return

    const cards = [...track.querySelectorAll('.project-card')]

    const applyParallax = () => {
      const mid = window.innerWidth / 2
      for (const card of cards) {
        const r = card.getBoundingClientRect()
        const ratio = clamp((r.left + r.width / 2 - mid) / window.innerWidth, -1, 1)
        card.style.setProperty('--px', `${(ratio * -26).toFixed(1)}px`)
      }
    }

    if (!pinned) {
      section.style.removeProperty('--progress')
      track.style.removeProperty('--shift')
      let raf = 0
      const onFree = () => {
        cancelAnimationFrame(raf)
        raf = requestAnimationFrame(applyParallax)
      }
      applyParallax()
      const viewport = viewportRef.current
      viewport?.addEventListener('scroll', onFree, { passive: true })
      window.addEventListener('scroll', onFree, { passive: true })
      return () => {
        cancelAnimationFrame(raf)
        viewport?.removeEventListener('scroll', onFree)
        window.removeEventListener('scroll', onFree)
      }
    }

    let raf = 0
    const update = () => {
      raf = 0
      const rect = section.getBoundingClientRect()
      const range = rect.height - window.innerHeight
      const progress = range > 0 ? clamp(-rect.top / range, 0, 1) : 0
      section.style.setProperty('--progress', progress.toFixed(4))
      track.style.setProperty('--shift', `${(-progress * travel).toFixed(1)}px`)
      if (bar) bar.style.setProperty('--progress', progress.toFixed(4))
      applyParallax()
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }

    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [pinned, travel])

  const step = (direction) => {
    if (pinned) {
      window.scrollBy({ top: direction * 420 * SCROLL_RATIO, behavior: 'smooth' })
    } else {
      viewportRef.current?.scrollBy({ left: direction * 420, behavior: 'smooth' })
    }
  }

  return (
    <section
      id="projects"
      className={`section section--alt projects-section${pinned ? ' projects-section--pinned' : ''}`}
      ref={sectionRef}
      style={pinned ? { height: `calc(100vh + ${Math.round(travel * SCROLL_RATIO)}px)` } : undefined}
    >
      <div className="projects-sticky" ref={stickyRef}>
        <div className="projects-glow" aria-hidden="true">
          <span className="projects-glow__blob projects-glow__blob--one" />
          <span className="projects-glow__blob projects-glow__blob--two" />
          <span className="projects-glow__grid" />
        </div>
        <h2 className="section__heading">Projects</h2>
        <p className="section__intro">
          A growing collection of analytics tools, visual experiments, and operational products. Follow
          along on{' '}
          <a href={profile.github} target="_blank" rel="noreferrer">
            GitHub
          </a>
          .
        </p>
        <div className="projects-controls" aria-label="Project navigation">
          <button type="button" onClick={() => step(-1)} aria-label="Show previous projects">
            <span aria-hidden="true">←</span>
          </button>
          <span className="projects-controls__label">
            {pinned ? 'Keep scrolling' : 'Scroll to explore'}
          </span>
          <span className="projects-progress" ref={progressRef} aria-hidden="true">
            <i />
          </span>
          <button type="button" onClick={() => step(1)} aria-label="Show next projects">
            <span aria-hidden="true">→</span>
          </button>
        </div>
        <div className="projects-viewport" ref={viewportRef}>
          <div className="projects" ref={trackRef}>
            {projects.map((project, index) => (
              <ProjectCard project={project} index={index} key={project.title} />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
