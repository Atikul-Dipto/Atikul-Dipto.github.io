import { useMemo, useState } from 'react'
import { sqlQueries } from '../data'
import { tokenizeSql } from '../utils/sqlHighlight'
import { useReveal } from '../hooks/useReveal'

function CodeBlock({ sql }) {
  const tokens = useMemo(() => tokenizeSql(sql), [sql])
  return (
    <pre className="sql-code" tabIndex={0}>
      <code>
        {tokens.map((t, i) =>
          t.type === 'plain' || t.type === 'punct' ? (
            t.text
          ) : (
            <span className={`sql-tok sql-tok--${t.type}`} key={i}>
              {t.text}
            </span>
          ),
        )}
      </code>
    </pre>
  )
}

export default function SqlShowcase() {
  const [activeId, setActiveId] = useState(sqlQueries[0].id)
  const [copied, setCopied] = useState(false)
  const { ref, visible } = useReveal({ threshold: 0.1 })

  const active = sqlQueries.find((q) => q.id === activeId) ?? sqlQueries[0]
  const lineCount = active.sql.split('\n').length

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(active.sql)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      /* clipboard blocked — nothing to do */
    }
  }

  const select = (id) => {
    setActiveId(id)
    setCopied(false)
  }

  return (
    <section id="sql" className="section section--alt sql-section">
      <h2 className="section__heading">SQL</h2>
      <p className="section__intro">
        Queries behind the numbers in my projects — written against the Postgres databases that power
        NeerVibe and Price Pulse. Each one answers a real operational question.
      </p>

      <div className={`sql-showcase${visible ? ' is-visible' : ''}`} ref={ref}>
        <div className="sql-nav" role="tablist" aria-label="SQL queries">
          {sqlQueries.map((q, i) => (
            <button
              type="button"
              role="tab"
              key={q.id}
              id={`sql-tab-${q.id}`}
              aria-selected={q.id === active.id}
              aria-controls={`sql-panel-${q.id}`}
              className={`sql-nav__item${q.id === active.id ? ' is-active' : ''}`}
              style={{ '--delay': `${i * 60}ms` }}
              onClick={() => select(q.id)}
            >
              <span className="sql-nav__index">{String(i + 1).padStart(2, '0')}</span>
              <span className="sql-nav__text">
                <strong>{q.title}</strong>
                <small>{q.project}</small>
              </span>
            </button>
          ))}
        </div>

        <div
          className="sql-panel"
          role="tabpanel"
          id={`sql-panel-${active.id}`}
          aria-labelledby={`sql-tab-${active.id}`}
        >
          <div className="sql-panel__head">
            <div>
              <p className="sql-panel__question">{active.question}</p>
              <div className="tags">
                {active.techniques.map((t) => (
                  <span className="tag tag--small" key={t}>
                    {t}
                  </span>
                ))}
              </div>
            </div>
            <div className="sql-panel__meta">
              <span className="sql-panel__dialect">{active.dialect}</span>
              <span>{lineCount} lines</span>
              <button type="button" className="sql-copy" onClick={copy} aria-live="polite">
                {copied ? 'Copied ✓' : 'Copy'}
              </button>
            </div>
          </div>

          <CodeBlock sql={active.sql} />

          <p className="sql-panel__note">{active.note}</p>
        </div>
      </div>
    </section>
  )
}
