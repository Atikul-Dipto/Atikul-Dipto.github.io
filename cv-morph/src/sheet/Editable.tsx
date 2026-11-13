import { useEffect, useLayoutEffect, useRef, type KeyboardEvent } from 'react'
import { useStore } from '../state/store.ts'

export type SheetMode = 'edit' | 'touch' | 'view' | 'print'

interface Props {
  /** The field's address (see model/fields.ts). */
  field: string
  value: string
  mode: SheetMode
  className?: string
  placeholder?: string
  /** Keeps line breaks: a paragraph, not a line. */
  multiline?: boolean
  /** Printed in capitals; the stored text keeps its own case. */
  upper?: boolean
  /** Where the text leads, when it is a link (printed and exported pages only). */
  href?: string
  /** Enter in a one-line field: add the next bullet, the next tag. */
  onEnter?: () => void
  /** Backspace in a field that is already empty: remove it. */
  onEmpty?: () => void
}

const PLAIN = typeof document !== 'undefined' && (() => {
  const probe = document.createElement('div')
  try {
    probe.contentEditable = 'plaintext-only'
    return probe.contentEditable === 'plaintext-only'
  } catch {
    return false
  }
})()

/**
 * A piece of the CV's text, edited where it stands. On a page being looked
 * at or exported it is plain text. With a mouse and keyboard it is edited in
 * place; on a touch screen a tap picks it, and it is edited in the bar above
 * the keyboard, where the letters are a readable size.
 */
export function Editable({ field, value, mode, className = '', placeholder, multiline, upper, href, onEnter, onEmpty }: Props) {
  const ref = useRef<HTMLSpanElement>(null)
  const focus = useStore((s) => s.focus)
  const picked = useStore((s) => (mode === 'touch' ? s.picked === field : false))

  // The text is set by hand, never by React: re-rendering an element someone
  // is typing in would throw the caret to the start.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || mode !== 'edit' || el.textContent === value) return
    const wasFocused = document.activeElement === el
    el.textContent = value
    if (wasFocused) {
      const range = document.createRange()
      range.selectNodeContents(el)
      range.collapse(false)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
    }
  }, [value, mode])

  useEffect(() => {
    const el = ref.current
    if (!el || mode !== 'edit' || focus?.field !== field) return
    el.focus()
    const range = document.createRange()
    range.selectNodeContents(el)
    range.collapse(false)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  }, [focus, field, mode])

  const classes = `ed ${upper ? 'ed-upper' : ''} ${className}`.trim()

  if (mode === 'view' || mode === 'print') {
    if (!value) return null
    // An exported page carries real capitals: the PDF is drawn from the text itself.
    const text = upper && mode === 'print' ? value.toUpperCase() : value
    return href && mode === 'print' ? (
      <a className={classes} href={href} data-field={field}>
        {text}
      </a>
    ) : (
      <span className={classes} data-field={field}>
        {text}
      </span>
    )
  }

  if (mode === 'touch') {
    return (
      <span
        className={`${classes} ed-tap`}
        data-field={field}
        data-placeholder={placeholder}
        data-picked={picked || undefined}
        role="button"
        tabIndex={0}
        onClick={() => useStore.getState().pick(field)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') useStore.getState().pick(field)
        }}
      >
        {value}
      </span>
    )
  }

  const onKeyDown = (e: KeyboardEvent<HTMLSpanElement>) => {
    const el = e.currentTarget
    if (e.key === 'Enter' && !e.shiftKey && !multiline) {
      e.preventDefault()
      if (onEnter) onEnter()
      else el.blur()
    } else if (e.key === 'Backspace' && onEmpty && !el.textContent) {
      e.preventDefault()
      onEmpty()
    } else if (e.key === 'Escape') {
      el.blur()
    }
  }

  return (
    <span
      ref={ref}
      className={classes}
      data-field={field}
      data-placeholder={placeholder}
      contentEditable={PLAIN ? 'plaintext-only' : true}
      suppressContentEditableWarning
      spellCheck
      role="textbox"
      aria-label={placeholder}
      aria-multiline={multiline || undefined}
      onKeyDown={onKeyDown}
      onInput={(e) => {
        const el = e.currentTarget
        let text = el.textContent ?? ''
        // A browser leaves a lone line break in an emptied field; and a line is one line.
        if (text === '\n') text = ''
        if (!multiline && /[\n\r]/.test(text)) text = text.replace(/\s*[\n\r]+\s*/g, ' ')
        if (text !== el.textContent) el.textContent = text
        useStore.getState().setField(field, text)
      }}
      onPaste={
        PLAIN
          ? undefined
          : (e) => {
              e.preventDefault()
              document.execCommand('insertText', false, e.clipboardData.getData('text/plain'))
            }
      }
    />
  )
}
