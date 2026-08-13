import { futurePath } from '../data'

export default function FuturePath() {
  return (
    <section id="next" className="section next">
      <div className="next__card">
        <p className="eyebrow">Looking ahead</p>
        <h2>{futurePath.heading}</h2>
        <p>{futurePath.body}</p>
      </div>
    </section>
  )
}
