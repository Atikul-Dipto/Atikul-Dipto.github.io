import { useEffect } from 'react'
import './App.css'

// Work Signal now lives inside Prottoy, built from real job listings and
// official labour statistics. This page forwards old links there.
const TARGET = 'https://atikul-dipto.github.io/ats-resume-scanner/#/market'

export default function App() {
  useEffect(() => {
    window.location.replace(TARGET)
  }, [])

  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Work Signal has moved</p>
          <h1>Now part of <em>Prottoy.</em></h1>
          <p>
            Work Signal now runs on real job listings and official Bangladesh labour statistics.{' '}
            <a href={TARGET}>Open Work Signal in Prottoy →</a>
          </p>
        </div>
      </section>
    </main>
  )
}
