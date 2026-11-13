import { AnimatePresence } from 'motion/react'
import { useCallback, useEffect, useState } from 'react'
import { newProject, type Project } from './model/project.ts'
import { sampleCv } from './model/sample.ts'
import { useStore } from './state/store.ts'
import { Home } from './ui/Home.tsx'
import { ImportFlow, type Source } from './ui/ImportFlow.tsx'
import { Studio } from './ui/Studio.tsx'
import { useToasts } from './ui/toast.ts'

type View = 'home' | 'studio'
const viewOf = (): View => (location.hash === '#/studio' ? 'studio' : 'home')

export default function App() {
  const project = useStore((s) => s.project)
  const toasts = useToasts((s) => s.toasts)
  const [view, setView] = useState<View>(viewOf)
  const [source, setSource] = useState<Source | null>(null)

  // The address says which screen this is, so Back on a phone goes from the studio to the start.
  useEffect(() => {
    const sync = () => setView(viewOf())
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])
  const go = useCallback((to: View) => {
    if (viewOf() !== to) location.hash = to === 'studio' ? '#/studio' : '#/'
    setView(to)
  }, [])

  const start = useCallback(
    (next: Project) => {
      useStore.getState().open(next)
      go('studio')
    },
    [go],
  )
  const replacing = useCallback(() => !useStore.getState().project || window.confirm('This replaces the CV you were working on. Export it first if you want to keep it. Carry on?'), [])
  const onFile = useCallback((file: File) => replacing() && setSource({ file }), [replacing])
  const onText = useCallback((text: string) => replacing() && setSource({ text }), [replacing])

  return (
    <>
      {view === 'studio' && project ? (
        <Studio onHome={() => go('home')} />
      ) : (
        <Home onFile={onFile} onText={onText} onSample={() => replacing() && start(newProject(sampleCv()))} onBlank={() => replacing() && start(newProject())} onContinue={() => go('studio')} />
      )}
      <AnimatePresence>
        {source && (
          <ImportFlow
            key="import"
            source={source}
            onCancel={() => setSource(null)}
            onDone={(next) => {
              setSource(null)
              start(next)
            }}
          />
        )}
      </AnimatePresence>
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.bad ? 'toast-bad' : ''}`}>
            {t.text}
          </div>
        ))}
      </div>
    </>
  )
}
