import { useEffect, useState } from 'react'
import './App.css'
import './agent/agent.css'
import AskAgent from './agent/AskAgent.jsx'
import VoucherBoard from './agent/VoucherBoard.jsx'
import { getStats, getVouchers } from './agent/api.js'

// Price Pulse is the shopping agent: ask, and each store answers. (The older
// scraped-prices dashboard that sat below it was removed 2026-10-29; the
// scrapers and their backend still live in scraper/ and backend/.)
export default function App() {
  const [vouchers, setVouchers] = useState({ status: 'loading', data: null })
  const [agentStats, setAgentStats] = useState({ status: 'loading', data: null })

  // The agent's voucher list and its running record (questions answered,
  // average time) — both from the Cloudflare function the agent runs on.
  useEffect(() => {
    getVouchers()
      .then((data) => setVouchers({ status: 'ready', data }))
      .catch(() => setVouchers({ status: 'error', data: null }))
    getStats()
      .then((data) => setAgentStats({ status: 'ready', data }))
      .catch(() => setAgentStats({ status: 'error', data: null }))
  }, [])

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href={import.meta.env.BASE_URL}>
          price<span>pulse</span>
        </a>
        <nav>
          <a className="active" href="#ask">
            Ask
          </a>
          <a href="#vouchers">
            Vouchers <b>{vouchers.data?.count ?? '·'}</b>
          </a>
        </nav>
        <div className={`sync${agentStats.status === 'error' ? ' offline' : ''}`}>
          <i />
          {agentStats.status === 'ready' ? 'Agent online' : agentStats.status === 'error' ? 'Agent unreachable' : 'Connecting…'}
        </div>
      </header>

      <AskAgent stats={agentStats.data} />

      <VoucherBoard data={vouchers.data} status={vouchers.status} />

      <footer id="sources">
        <span>Answers come live from Daraz and Cartup. Nothing here is a paid placement.</span>
        <span>
          Built for price-aware shopping ·{' '}
          <a href="https://github.com/Atikul-Dipto" target="_blank" rel="noreferrer">
            GitHub
          </a>
        </span>
      </footer>
    </main>
  )
}
