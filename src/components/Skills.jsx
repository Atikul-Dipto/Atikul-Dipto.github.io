import { skills } from '../data'

export default function Skills() {
  return (
    <section id="skills" className="section section--alt">
      <h2 className="section__heading">Skills</h2>
      <div className="skills">
        {skills.map((group) => (
          <div className="skills__group" key={group.group}>
            <h3>{group.group}</h3>
            <div className="tags">
              {group.items.map((item) => (
                <span className="tag" key={item}>
                  {item}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
