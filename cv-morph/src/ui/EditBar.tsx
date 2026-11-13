import { useEffect, useLayoutEffect, useRef } from 'react'
import { fieldLabel, fieldOrder, hasField, readField } from '../model/fields.ts'
import * as ops from '../model/ops.ts'
import { visibleIds } from '../model/project.ts'
import { edit, useStore } from '../state/store.ts'
import { IconCheck, IconChevronLeft, IconChevronRight, IconPlus, IconTrash } from './icons.tsx'

/**
 * On a phone the page is shown small, so its text is edited here: tap a line
 * on the page and it opens in this bar, at a size thumbs and eyes can manage,
 * just above the keyboard. The page updates as you type.
 */
export function EditBar() {
  const project = useStore((s) => s.project)
  const picked = useStore((s) => s.picked)
  const area = useRef<HTMLTextAreaElement>(null)
  const bar = useRef<HTMLDivElement>(null)

  // Keep the bar on top of the on-screen keyboard.
  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return
    const place = () => bar.current?.style.setProperty('--keyboard', `${Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)}px`)
    place()
    viewport.addEventListener('resize', place)
    viewport.addEventListener('scroll', place)
    return () => {
      viewport.removeEventListener('resize', place)
      viewport.removeEventListener('scroll', place)
    }
  }, [])

  useEffect(() => {
    if (!picked) return
    area.current?.focus({ preventScroll: true })
    document.querySelector(`[data-field="${CSS.escape(picked)}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [picked])

  const value = project && picked ? readField(project.cv, picked) : ''
  useLayoutEffect(() => {
    const el = area.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(132, el.scrollHeight)}px`
  }, [value, picked])

  if (!project || !picked) return null
  if (!hasField(project.cv, picked)) {
    queueMicrotask(() => useStore.getState().pick(null))
    return null
  }
  const state = useStore.getState()
  const order = fieldOrder(project.cv, visibleIds(project))
  const at = order.indexOf(picked)
  const [kind, a, b, c] = picked.split(':')

  // What "add another" and "remove" mean depends on what is being edited.
  const add =
    kind === 'b' ? () => ops.addBullet : kind === 'i' ? () => ops.addItem : kind === 't' ? () => ops.addTag : null
  const addNext = () => {
    if (!add) return
    edit((p) => {
      const field = kind === 'b' ? ops.addBullet(p, a, b, c) : kind === 'i' ? ops.addItem(p, a, b) : ops.addTag(p, a, b, c)
      queueMicrotask(() => useStore.getState().pick(field))
    })
  }
  const remove =
    kind === 'b' || kind === 'i' || kind === 't' || kind === 'c'
      ? () =>
          edit((p) => {
            const field = kind === 'b' ? ops.removeBullet(p, a, b, c) : kind === 'i' ? ops.removeItem(p, a, b) : kind === 't' ? ops.removeTag(p, a, b, c) : (ops.removeContact(p, a), 'name')
            queueMicrotask(() => useStore.getState().pick(field))
          })
      : null

  return (
    <div className="editbar glass" ref={bar}>
      <div className="editbar-top">
        <span className="editbar-label mono">{fieldLabel(project.cv, picked)}</span>
        <button type="button" className="btn btn-ghost btn-icon btn-s" aria-label="Previous" disabled={at <= 0} onClick={() => state.pick(order[at - 1])}>
          <IconChevronLeft />
        </button>
        <button type="button" className="btn btn-ghost btn-icon btn-s" aria-label="Next" disabled={at < 0 || at >= order.length - 1} onClick={() => state.pick(order[at + 1])}>
          <IconChevronRight />
        </button>
        {add && (
          <button type="button" className="btn btn-ghost btn-icon btn-s" aria-label="Add another after this" onClick={addNext}>
            <IconPlus />
          </button>
        )}
        {remove && (
          <button type="button" className="btn btn-ghost btn-icon btn-s" aria-label="Remove this" onClick={remove}>
            <IconTrash />
          </button>
        )}
        <button type="button" className="btn btn-primary btn-icon btn-s" aria-label="Done" onClick={() => state.pick(null)}>
          <IconCheck />
        </button>
      </div>
      <textarea
        ref={area}
        className="editbar-text"
        rows={1}
        value={value}
        aria-label={fieldLabel(project.cv, picked)}
        placeholder="Type here"
        enterKeyHint={add ? 'enter' : 'done'}
        onChange={(e) => state.setField(picked, kind === 'sx' || picked.endsWith(':summary') ? e.target.value : e.target.value.replace(/\n/g, ' '))}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' || e.shiftKey || kind === 'sx' || picked.endsWith(':summary')) return
          e.preventDefault()
          if (add) addNext()
          else state.pick(null)
        }}
      />
    </div>
  )
}
