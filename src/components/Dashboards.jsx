import { useState } from 'react'
import { dashboards } from '../data'
import { useReveal } from '../hooks/useReveal'

// A Power BI "Publish to web" embed is a 16:9 iframe. The report canvas is
// authored at 1280x720, so the same ratio keeps it from letterboxing.
const ASPECT = (9 / 16) * 100

function Embed({ dashboard }) {
  const [loaded, setLoaded] = useState(false)

  // No embed URL means the report has not been published. Say so plainly
  // rather than showing a frame that implies a live report is a click away:
  // publishing needs a Power BI work or school account, which is a real
  // obstacle and not something to paper over with a spinner.
  if (!dashboard.embedUrl) {
    return (
      <div className="dash__embed dash__embed--pending">
        <div className="dash__pending">
          <span className="dash__pending-badge">Not published yet</span>
          <p>
            The model and report are built and version-controlled, but a public
            embed needs a Power BI work or school account. Until there is one,
            the whole thing is readable as plain text instead — the data model,
            every DAX measure and every visual definition.
          </p>
          <a
            className="dash__link dash__link--primary"
            href={dashboard.repoHref}
            target="_blank"
            rel="noreferrer"
          >
            Read the model and measures →
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="dash__embed" style={{ '--aspect': `${ASPECT}%` }}>
      {!loaded && <span className="dash__embed-loading">Loading the report…</span>}
      <iframe
        title={`${dashboard.title} — Power BI report`}
        src={dashboard.embedUrl}
        loading="lazy"
        allowFullScreen
        onLoad={() => setLoaded(true)}
      />
    </div>
  )
}

function DashboardCase({ dashboard, index }) {
  const { ref, visible } = useReveal()

  return (
    <article
      className={`dash${visible ? ' is-visible' : ''}`}
      style={{ '--delay': `${index * 110}ms` }}
      ref={ref}
      id={`dashboard-${dashboard.id}`}
    >
      <header className="dash__head">
        <h3>{dashboard.title}</h3>
        <p className="dash__question">{dashboard.question}</p>
        <p className="dash__purpose">{dashboard.purpose}</p>
        <p className="dash__dataset">
          <span>Data</span> {dashboard.dataset}
        </p>
      </header>

      <dl className="dash__highlights">
        {dashboard.highlights.map(([value, label]) => (
          <div className="dash__highlight" key={label}>
            <dt>{value}</dt>
            <dd>{label}</dd>
          </div>
        ))}
      </dl>

      <Embed dashboard={dashboard} />

      <div className="dash__cols">
        <section className="dash__col">
          <h4>What it found</h4>
          <ul className="dash__findings">
            {dashboard.findings.map((finding) => (
              <li key={finding.headline}>
                <strong>{finding.headline}</strong>
                <span>{finding.detail}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="dash__col">
          <h4>How it is built</h4>
          <dl className="dash__build">
            {dashboard.build.map(([term, detail]) => (
              <div key={term}>
                <dt>{term}</dt>
                <dd>{detail}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      <footer className="dash__foot">
        <section className="dash__caveats">
          <h4>Worth knowing</h4>
          <ul>
            {dashboard.caveats.map((caveat) => (
              <li key={caveat}>{caveat}</li>
            ))}
          </ul>
        </section>
        <div className="dash__meta">
          <div className="tags">
            {dashboard.tags.map((tag) => (
              <span className="tag tag--small" key={tag}>
                {tag}
              </span>
            ))}
          </div>
          <div className="dash__links">
            {dashboard.embedUrl && (
              <a
                className="dash__link dash__link--primary"
                href={dashboard.embedUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open full screen →
              </a>
            )}
            <a
              className="dash__link"
              href={dashboard.repoHref}
              target="_blank"
              rel="noreferrer"
            >
              Model and measures →
            </a>
          </div>
        </div>
      </footer>
    </article>
  )
}

export default function Dashboards() {
  return (
    <section id="dashboards" className="section section--alt dashboards-section">
      <h2 className="section__heading">Dashboards</h2>
      <p className="section__intro">
        Two Power BI projects, each on data I can show you the provenance of. Both
        are kept as Power BI Projects rather than <code>.pbix</code> binaries, so
        the data model, every DAX measure and every visual is plain text in the
        repository — reviewable without opening Power BI at all.
      </p>
      <div className="dashboards">
        {dashboards.map((dashboard, index) => (
          <DashboardCase dashboard={dashboard} index={index} key={dashboard.id} />
        ))}
      </div>
    </section>
  )
}
