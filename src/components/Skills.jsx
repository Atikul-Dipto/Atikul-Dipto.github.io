import { useState } from 'react'
import { skills } from '../data'
import { useReveal } from '../hooks/useReveal'
import ToolIcon from './ToolIcon'
import { brandVars } from '../data/brandVars'
import CountUp from './CountUp'

const TABS = [
  { key: 'software', label: 'Software & Tools', hint: 'What I build and analyse with' },
  { key: 'analytics', label: 'Analytics', hint: 'What I actually do with data' },
  { key: 'soft', label: 'Soft Skills', hint: 'How I work with people' },
]

function ToolTile({ tool, index }) {
  return (
    <span className="tool" style={{ ...brandVars(tool.icon), '--delay': `${index * 28}ms` }}>
      <ToolIcon slug={tool.icon} name={tool.name} />
      <b>{tool.name}</b>
    </span>
  )
}

function SkillGroup({ group, index, variant }) {
  const { ref, visible } = useReveal({ threshold: 0.08 })

  return (
    <div
      className={`skill-group${visible ? ' is-visible' : ''}`}
      style={{ '--delay': `${index * 80}ms` }}
      ref={ref}
    >
      <h3>
        {group.group}
        <span className="skill-group__count"><CountUp value={String(group.items.length)} duration={900} /></span>
      </h3>
      {variant === 'software' ? (
        <div className="tool-grid">
          {group.items.map((tool, i) => (
            <ToolTile tool={tool} index={i} key={tool.name} />
          ))}
        </div>
      ) : (
        <div className="tags">
          {group.items.map((item, i) => (
            <span className="tag tag--interactive" style={{ '--delay': `${i * 34}ms` }} key={item}>
              {item}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Skills() {
  const [active, setActive] = useState('software')
  const groups = skills[active]
  const total = groups.reduce((sum, g) => sum + g.items.length, 0)

  return (
    <section id="skills" className="section section--alt skills-section">
      <h2 className="section__heading">Skills</h2>
      <p className="section__intro">
        The toolkit behind the dashboards — from the databases the numbers live in to the way they get
        explained to a room.
      </p>

      <div className="skill-tabs" role="tablist" aria-label="Skill categories">
        {TABS.map((tab) => (
          <button
            type="button"
            role="tab"
            key={tab.key}
            id={`skill-tab-${tab.key}`}
            aria-selected={active === tab.key}
            aria-controls={`skill-panel-${tab.key}`}
            className={`skill-tab${active === tab.key ? ' is-active' : ''}`}
            onClick={() => setActive(tab.key)}
          >
            <strong>{tab.label}</strong>
            <small>{tab.hint}</small>
          </button>
        ))}
      </div>

      <div
        className={`skill-panel skill-panel--${active}`}
        role="tabpanel"
        id={`skill-panel-${active}`}
        aria-labelledby={`skill-tab-${active}`}
        key={active}
      >
        {groups.map((group, index) => (
          <SkillGroup group={group} index={index} variant={active} key={group.group} />
        ))}
        <p className="skill-panel__total">
          <CountUp value={String(total)} />{' '}
          {active === 'soft' ? 'strengths' : active === 'analytics' ? 'capabilities' : 'tools'}
        </p>
      </div>
    </section>
  )
}
