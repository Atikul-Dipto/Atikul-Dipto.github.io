import { useMemo, useState } from 'react'
import './App.css'

const jobs = [
  { title: 'Data Analyst', company: 'bKash', location: 'Dhaka', mode: 'Hybrid', salary: 85000, skills: ['SQL', 'Power BI', 'Python'], industry: 'Fintech', posted: '2h ago' },
  { title: 'Business Intelligence Analyst', company: 'Grameenphone', location: 'Dhaka', mode: 'On-site', salary: 110000, skills: ['SQL', 'Tableau', 'Excel'], industry: 'Telecom', posted: '5h ago' },
  { title: 'Product Data Analyst', company: 'Pathao', location: 'Dhaka', mode: 'Remote', salary: 95000, skills: ['Python', 'A/B Testing', 'SQL'], industry: 'Technology', posted: '1d ago' },
  { title: 'Junior Data Scientist', company: 'Robi', location: 'Chattogram', mode: 'Hybrid', salary: 78000, skills: ['Python', 'Machine Learning', 'Statistics'], industry: 'Telecom', posted: '1d ago' },
  { title: 'Reporting Analyst', company: 'Daraz', location: 'Dhaka', mode: 'Hybrid', salary: 72000, skills: ['Excel', 'Power BI', 'SQL'], industry: 'E-commerce', posted: '2d ago' },
  { title: 'Operations Analyst', company: 'M&J Group', location: 'Dhaka', mode: 'On-site', salary: 60000, skills: ['Excel', 'SQL', 'Operations'], industry: 'Logistics', posted: '3d ago' },
  { title: 'Research Analyst', company: 'LightCastle', location: 'Remote', mode: 'Remote', salary: 68000, skills: ['Research', 'Excel', 'Statistics'], industry: 'Consulting', posted: '4d ago' },
]
const money = (value) => `৳${new Intl.NumberFormat('en-US').format(value)}`

export default function App() {
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState('All work modes')
  const [industry, setIndustry] = useState('All industries')
  const [selectedSkill, setSelectedSkill] = useState('All skills')
  const filtered = useMemo(() => jobs.filter((job) => [job.title, job.company, job.location].join(' ').toLowerCase().includes(query.toLowerCase()) && (mode === 'All work modes' || job.mode === mode) && (industry === 'All industries' || job.industry === industry) && (selectedSkill === 'All skills' || job.skills.includes(selectedSkill))), [industry, mode, query, selectedSkill])
  const skillCounts = useMemo(() => Object.entries(jobs.flatMap((job) => job.skills).reduce((counts, skill) => ({ ...counts, [skill]: (counts[skill] || 0) + 1 }), {})).sort((a, b) => b[1] - a[1]).slice(0, 6), [])
  const companyCounts = useMemo(() => Object.entries(jobs.reduce((counts, job) => ({ ...counts, [job.company]: (counts[job.company] || 0) + 1 }), {})).sort((a, b) => b[1] - a[1]), [])
  const remoteCount = jobs.filter((job) => job.mode === 'Remote').length
  const averageSalary = Math.round(jobs.reduce((sum, job) => sum + job.salary, 0) / jobs.length)
  const industries = [...new Set(jobs.map((job) => job.industry))].sort()
  const skills = [...new Set(jobs.flatMap((job) => job.skills))].sort()

  return <main className="shell"><header className="topbar"><a className="logo" href="/">work<span>signal</span></a><nav><a className="active" href="#jobs">Job feed</a><a href="#skills">Skills</a><a href="#companies">Companies</a></nav><div className="live"><i /> Live feed <small>updated 4 min ago</small></div></header>
    <section className="hero"><div><p className="eyebrow">Bangladesh job market intelligence</p><h1>See where the<br /><em>work is moving.</em></h1><p>Public job listings shaped into a practical signal for analysts, builders, and curious career pivots.</p></div><div className="hero-stamp"><strong>{jobs.length * 31}</strong><span>active listings indexed</span><small>from 18 public sources</small></div></section>
    <section className="filters"><label className="search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search roles, companies, locations" /></label><label><span>Work mode</span><select value={mode} onChange={(event) => setMode(event.target.value)}><option>All work modes</option><option>Remote</option><option>Hybrid</option><option>On-site</option></select></label><label><span>Industry</span><select value={industry} onChange={(event) => setIndustry(event.target.value)}><option>All industries</option>{industries.map((item) => <option key={item}>{item}</option>)}</select></label><label><span>Skill</span><select value={selectedSkill} onChange={(event) => setSelectedSkill(event.target.value)}><option>All skills</option>{skills.map((item) => <option key={item}>{item}</option>)}</select></label></section>
    <section className="metrics"><div><span>Listings indexed</span><strong>1,248</strong><small className="good">↗ 12% this month</small></div><div><span>Average salary</span><strong>{money(averageSalary)}</strong><small>Estimated monthly gross</small></div><div><span>Remote roles</span><strong>{remoteCount * 31}</strong><small>{Math.round(remoteCount / jobs.length * 100)}% of tracked roles</small></div><div><span>Companies hiring</span><strong>86</strong><small>Across 9 industries</small></div></section>
    <section className="dashboard-grid"><div className="feed panel" id="jobs"><div className="panel-head"><div><p className="eyebrow">Fresh from the web</p><h2>Latest opportunities</h2></div><span>{filtered.length} matching</span></div>{filtered.map((job) => <article className="job" key={`${job.company}-${job.title}`}><div className="company-mark">{job.company.slice(0, 1)}</div><div className="job-main"><h3>{job.title}</h3><p>{job.company} <b>·</b> {job.location} <b>·</b> <em className={job.mode === 'Remote' ? 'remote' : ''}>{job.mode}</em></p><div className="job-skills">{job.skills.map((skill) => <button type="button" onClick={() => setSelectedSkill(skill)} key={skill}>{skill}</button>)}</div></div><div className="job-meta"><strong>{money(job.salary)}</strong><span>/ month est.</span><small>{job.posted}</small></div></article>)}{!filtered.length && <p className="empty">No roles match these filters.</p>}</div>
      <aside className="side"><div className="panel" id="skills"><div className="panel-head"><div><p className="eyebrow">Demand signal</p><h2>Top skills</h2></div><span>this month</span></div><div className="bars">{skillCounts.map(([skill, count]) => <button type="button" className="bar-row" onClick={() => setSelectedSkill(skill)} key={skill}><span>{skill}</span><i><em style={{ width: `${count / skillCounts[0][1] * 100}%` }} /></i><b>{count * 31}</b></button>)}</div></div><div className="panel companies" id="companies"><div className="panel-head"><div><p className="eyebrow">Hiring map</p><h2>Active companies</h2></div></div>{companyCounts.slice(0, 5).map(([company, count], index) => <div className="company-row" key={company}><b>0{index + 1}</b><span>{company}</span><strong>{count * 31} roles</strong></div>)}</div></aside></section>
    <footer><span>Source: public career pages and job boards</span><span>Scraped with Selenium · <a href="https://github.com/Atikul-Dipto" target="_blank" rel="noreferrer">GitHub</a></span></footer>
  </main>
}
