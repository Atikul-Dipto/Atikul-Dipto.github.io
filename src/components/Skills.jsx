import { skills } from '../data'
import { useReveal } from '../hooks/useReveal'

function SkillGroup({ group, index }) {
  const { ref, visible } = useReveal()

  return (
    <div
      className={`skills__group${visible ? ' is-visible' : ''}`}
      style={{ '--delay': `${index * 100}ms` }}
      ref={ref}
    >
      <h3>{group.group}</h3>
      <div className="tags">
        {group.items.map((item, i) => (
          <span className="tag tag--interactive" style={{ '--delay': `${i * 40}ms` }} key={item}>
            {item}
          </span>
        ))}
      </div>
    </div>
  )
}

export default function Skills() {
  return (
    <section id="skills" className="section section--alt">
      <h2 className="section__heading">Skills</h2>
      <div className="skills">
        {skills.map((group, index) => (
          <SkillGroup group={group} index={index} key={group.group} />
        ))}
      </div>
    </section>
  )
}
