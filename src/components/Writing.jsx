import { writing } from '../data'
import { useReveal } from '../hooks/useReveal'
import { useTiltSpotlight } from '../hooks/useTiltSpotlight'

function ArticleCard({ article, index }) {
  const { ref: tiltRef, onPointerMove, onPointerLeave } = useTiltSpotlight({ max: 5 })
  const { ref: revealRef, visible } = useReveal()

  const setRefs = (el) => {
    tiltRef.current = el
    revealRef.current = el
  }

  return (
    <a
      className={`article-card${visible ? ' is-visible' : ''}`}
      style={{ '--delay': `${index * 90}ms` }}
      ref={setRefs}
      href={article.href}
      target="_blank"
      rel="noreferrer"
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
    >
      <span className="article-card__spotlight" aria-hidden="true" />
      <div className="article-card__masthead">
        <span className="article-card__kind">{article.kind}</span>
        <span className="article-card__pub">{article.publication}</span>
        <time dateTime={article.date}>{article.dateLabel}</time>
      </div>
      <h3>{article.title}</h3>
      <p>{article.summary}</p>
      <div className="article-card__foot">
        <div className="tags">
          {article.tags.map((tag) => (
            <span className="tag tag--small" key={tag}>
              {tag}
            </span>
          ))}
        </div>
        <span className="article-card__cta">Read the article →</span>
      </div>
    </a>
  )
}

export default function Writing() {
  return (
    <section id="writing" className="section writing-section">
      <h2 className="section__heading">Writing</h2>
      <p className="section__intro">
        Published pieces on data, logistics, and how the two should meet.
      </p>
      <div className="writing-grid">
        {writing.map((article, index) => (
          <ArticleCard article={article} index={index} key={article.href} />
        ))}
      </div>
    </section>
  )
}
