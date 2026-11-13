import { PRESETS } from './design/design.ts'
import { newProject } from './model/project.ts'
import { sampleCv } from './model/sample.ts'
import { Sheet } from './sheet/Sheet.tsx'

// A scratch page while the pieces are built: every template, side by side.
const cv = sampleCv()
export default function App() {
  const which = Number(new URLSearchParams(location.search).get('p') ?? -1)
  const list = which >= 0 ? [PRESETS[which]] : PRESETS
  return (
    <main style={{ background: '#222', padding: 20, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
      <button
        id="export"
        onClick={async () => {
          const { exportPdf } = await import('./export/pdf.ts')
          const result = await exportPdf(newProject(cv, list[0]))
          const a = document.createElement('a')
          a.href = URL.createObjectURL(result.blob)
          a.download = 'cv.pdf'
          a.click()
          document.title = `pages ${result.pages} missing [${result.missing}]`
        }}
      >
        export
      </button>
      {list.map((design) => {
        const p = newProject(cv, design)
        return <Sheet key={design.name} cv={p.cv} design={p.design} arrangement={p.arrangement} mode={new URLSearchParams(location.search).get('m') === 'edit' ? 'edit' : 'view'} gap={16} />
      })}
    </main>
  )
}
