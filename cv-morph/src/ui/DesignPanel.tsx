import { useRef } from 'react'
import { isDark, mix, readable } from '../design/color.ts'
import { PRESETS, type Design } from '../design/design.ts'
import { FONTS, type FontId } from '../design/fonts.ts'
import * as ops from '../model/ops.ts'
import { edit, useStore } from '../state/store.ts'
import { Color, Group, Range, Row, Seg } from './controls.tsx'
import { IconUser, IconWand } from './icons.tsx'
import { toast } from './toast.ts'

/** Changes the design; repeated changes to one control are a single step to undo. */
const tune = (key: string, change: (d: Design) => void) => edit((p) => change(p.design), { key: `design:${key}`, moves: true })

const ACCENTS = ['#1d4ed8', '#0f766e', '#7c3aed', '#be123c', '#b4532a', '#15803d', '#0e7490', '#111827']

/** A template drawn as a diagram: where the blocks go and in what colours. */
export function Thumb({ design }: { design: Design }) {
  const d = design
  const two = d.columns === 2
  const side = (
    <div className="thumb-side" style={{ width: `${d.sidebar.width * 100}%`, background: d.sidebar.fill || 'transparent' }}>
      {d.header.place === 'side' && <i className="thumb-name" style={{ background: d.header.nameColor, width: '80%' }} />}
      {[0, 1, 2].map((i) => (
        <span key={i}>
          <i className="thumb-h" style={{ background: d.sidebar.heading }} />
          <i style={{ background: d.sidebar.text }} />
          <i style={{ background: d.sidebar.text, width: '60%' }} />
        </span>
      ))}
    </div>
  )
  return (
    <div className="thumb" style={{ background: d.colors.paper }}>
      {(!two || d.header.place === 'top') && (
        <div className="thumb-head" style={{ background: d.header.fill || 'transparent', alignItems: d.header.align === 'center' ? 'center' : 'flex-start' }}>
          <i className="thumb-name" style={{ background: d.header.nameColor }} />
          <i style={{ background: d.header.textColor, width: '60%' }} />
        </div>
      )}
      <div className="thumb-cols" style={{ flexDirection: d.sidebar.side === 'left' ? 'row' : 'row-reverse' }}>
        {two && side}
        <div className="thumb-main">
          {two && d.header.place === 'main' && <i className="thumb-name" style={{ background: d.header.nameColor }} />}
          {[0, 1, 2].map((i) => (
            <span key={i}>
              <i
                className="thumb-h"
                style={{
                  background: d.heading.rule === 'band' ? mix(d.heading.color, d.colors.paper, 0.75) : d.heading.color,
                  height: d.heading.rule === 'band' ? 5 : 2.5,
                  width: d.heading.rule === 'band' ? '100%' : '38%',
                  marginInline: d.heading.align === 'center' ? 'auto' : undefined,
                }}
              />
              <i style={{ background: d.colors.muted }} />
              <i style={{ background: d.colors.muted }} />
              <i style={{ background: d.colors.muted, width: '70%' }} />
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

async function pickPhoto(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  // A square from the middle, small enough to keep the saved CV and its PDF light.
  const edge = Math.min(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = Math.min(480, edge)
  canvas.getContext('2d')?.drawImage(bitmap, (bitmap.width - edge) / 2, (bitmap.height - edge) / 2, edge, edge, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return canvas.toDataURL('image/jpeg', 0.88)
}

export function DesignPanel({ onCopyFormat }: { onCopyFormat(): void }) {
  const design = useStore((s) => s.project?.design)
  const photo = useStore((s) => s.project?.cv.photo ?? '')
  const file = useRef<HTMLInputElement>(null)
  if (!design) return null
  const d = design
  const two = d.columns === 2
  const fonts = FONTS.map((f) => (
    <option key={f.id} value={f.id}>
      {f.label} — {f.note}
    </option>
  ))

  const setAccent = (color: string) =>
    tune('accent', (x) => {
      x.colors.accent = color
      x.heading.color = color
      if (x.header.fill) x.header.fill = color
      if (!x.sidebar.fill) x.sidebar.heading = color
    })

  const setSideFill = (fill: string) =>
    tune('sidefill', (x) => {
      x.sidebar.fill = fill
      const base = fill || x.colors.paper
      x.sidebar.text = readable(isDark(base) ? '#e8edf7' : x.colors.text, base)
      x.sidebar.heading = readable(isDark(base) ? mix(x.colors.accent, '#ffffff', 0.55) : x.colors.accent, base, 3)
      if (x.header.place === 'side') {
        x.header.nameColor = readable(isDark(base) ? '#ffffff' : '#111827', base)
        x.header.textColor = readable(isDark(base) ? '#c9d3e6' : x.colors.muted, base)
      }
    })

  const setBand = (on: boolean) =>
    tune('band', (x) => {
      x.header.fill = on ? x.colors.accent : ''
      const base = on ? x.colors.accent : x.colors.paper
      x.header.nameColor = readable(isDark(base) ? '#ffffff' : '#111827', base)
      x.header.textColor = readable(isDark(base) ? mix('#ffffff', base, 0.18) : x.colors.muted, base)
    })

  return (
    <div className="panel-body">
      <Group title="Copy a format">
        <button type="button" className="copy-card" onClick={onCopyFormat}>
          <span className="copy-card-icon">
            <IconWand />
          </span>
          <span>
            <b>Use the look of another CV</b>
            <small>Give it a PDF, a picture or a Word file of a CV you like. Your content is poured into its layout.</small>
          </span>
        </button>
      </Group>

      <Group title="Templates">
        <div className="thumbs">
          {PRESETS.map((preset) => (
            <button
              key={preset.name}
              type="button"
              className="thumb-btn"
              aria-pressed={preset.name === d.name}
              onClick={() => edit((p) => ops.applyDesign(p, { ...preset, page: p.design.page, header: { ...preset.header, photo: p.design.header.photo } }), { moves: true })}
            >
              <Thumb design={preset} />
              <span>{preset.name}</span>
            </button>
          ))}
        </div>
      </Group>

      <Group title="Layout">
        <Row label="Columns">
          <Seg label="Columns" value={d.columns} options={[[1, 'One'], [2, 'Two']] as const} onChange={(columns) => edit((p) => ops.applyDesign(p, { ...p.design, columns }), { moves: true })} />
        </Row>
        {two && (
          <>
            <Row label="Sidebar">
              <Seg label="Sidebar side" value={d.sidebar.side} options={[['left', 'Left'], ['right', 'Right']] as const} onChange={(v) => tune('side', (x) => void (x.sidebar.side = v))} />
            </Row>
            <Row label="Sidebar width">
              <Range label="Sidebar width" value={d.sidebar.width} min={0.24} max={0.46} step={0.01} show={(v) => `${Math.round(v * 100)}%`} onChange={(v) => tune('sidew', (x) => void (x.sidebar.width = v))} />
            </Row>
            <Row label="Name sits">
              <Seg label="Where the name sits" value={d.header.place} options={[['top', 'Across'], ['main', 'Main'], ['side', 'Sidebar']] as const} onChange={(v) => tune('place', (x) => void (x.header.place = v))} />
            </Row>
          </>
        )}
        <Row label="Header">
          <Seg label="Header alignment" value={d.header.align} options={[['left', 'Left'], ['center', 'Centre'], ['right', 'Right']] as const} onChange={(v) => tune('halign', (x) => void (x.header.align = v))} />
        </Row>
        <Row label="Contact details">
          <Seg label="Contact layout" value={d.header.contacts} options={[['inline', 'One line'], ['stacked', 'Stacked']] as const} onChange={(v) => tune('contacts', (x) => void (x.header.contacts = v))} />
        </Row>
        <Row label="Paper">
          <Seg label="Paper size" value={d.page} options={[['a4', 'A4'], ['letter', 'Letter']] as const} onChange={(v) => tune('page', (x) => void (x.page = v))} />
        </Row>
        <Row label="Margins">
          <Range label="Margins" value={d.margin} min={8} max={26} step={1} show={(v) => `${v} mm`} onChange={(v) => tune('margin', (x) => void (x.margin = v))} />
        </Row>
        <Row label="Breathing room">
          <Range label="Spacing" value={d.spacing} min={0.6} max={1.6} step={0.05} show={(v) => `${Math.round(v * 100)}%`} onChange={(v) => tune('spacing', (x) => void (x.spacing = v))} />
        </Row>
      </Group>

      <Group title="Colour">
        <Row label="Accent">
          <span className="accents">
            {ACCENTS.map((color) => (
              <button key={color} type="button" className="accent-dot" style={{ background: color }} aria-label={`Accent ${color}`} aria-pressed={d.colors.accent === color} onClick={() => setAccent(color)} />
            ))}
            <Color label="Accent colour" value={d.colors.accent} onChange={setAccent} />
          </span>
        </Row>
        <Row label="Text">
          <Color label="Text colour" value={d.colors.text} onChange={(v) => tune('text', (x) => { x.colors.text = v; x.colors.muted = mix(v, x.colors.paper, 0.32) })} />
        </Row>
        <Row label="Name">
          <Color label="Name colour" value={d.header.nameColor} onChange={(v) => tune('name', (x) => void (x.header.nameColor = v))} />
        </Row>
        {(!two || d.header.place === 'top') && (
          <Row label="Header band">
            <Seg label="Header band" value={d.header.fill ? 'on' : 'off'} options={[['off', 'Off'], ['on', 'On']] as const} onChange={(v) => setBand(v === 'on')} />
          </Row>
        )}
        {two && (
          <Row label="Sidebar fill">
            <span className="accents">
              <button type="button" className="chip" onClick={() => setSideFill('')}>
                None
              </button>
              <Color label="Sidebar fill" value={d.sidebar.fill || d.colors.paper} onChange={setSideFill} />
            </span>
          </Row>
        )}
      </Group>

      <Group title="Type">
        <Row label="Text">
          <select className="select" aria-label="Text font" value={d.fonts.body} onChange={(e) => tune('body', (x) => void (x.fonts.body = e.target.value as FontId))}>
            {fonts}
          </select>
        </Row>
        <Row label="Headings">
          <select className="select" aria-label="Heading font" value={d.fonts.heading} onChange={(e) => tune('headfont', (x) => void (x.fonts.heading = e.target.value as FontId))}>
            {fonts}
          </select>
        </Row>
        <Row label="Text size">
          <Range label="Text size" value={d.fonts.size} min={8} max={12.5} step={0.25} show={(v) => `${v} pt`} onChange={(v) => tune('size', (x) => void (x.fonts.size = v))} />
        </Row>
        <Row label="Line spacing">
          <Range label="Line spacing" value={d.fonts.leading} min={1.15} max={1.7} step={0.01} show={(v) => v.toFixed(2)} onChange={(v) => tune('leading', (x) => void (x.fonts.leading = v))} />
        </Row>
        <Row label="Name size">
          <Range label="Name size" value={d.header.nameSize} min={16} max={40} step={1} show={(v) => `${v} pt`} onChange={(v) => tune('namesize', (x) => void (x.header.nameSize = v))} />
        </Row>
        <Row label="Name">
          <Seg label="Name style" value={`${d.header.nameWeight}-${d.header.nameCase}`} options={[['700-none', 'Bold'], ['400-none', 'Light'], ['700-upper', 'CAPS'], ['400-upper', 'Light caps']] as const} onChange={(v) => tune('namestyle', (x) => { x.header.nameWeight = v.startsWith('700') ? 700 : 400; x.header.nameCase = v.endsWith('upper') ? 'upper' : 'none' })} />
        </Row>
      </Group>

      <Group title="Section headings">
        <Row label="Line">
          <Seg label="Heading line" value={d.heading.rule} options={[['none', 'None'], ['under', 'Under'], ['over', 'Over'], ['band', 'Band'], ['bar', 'Bar']] as const} onChange={(v) => tune('rule', (x) => void (x.heading.rule = v))} />
        </Row>
        <Row label="Letters">
          <Seg label="Heading capitals" value={d.heading.case} options={[['upper', 'CAPITALS'], ['none', 'As typed']] as const} onChange={(v) => tune('hcase', (x) => void (x.heading.case = v))} />
        </Row>
        <Row label="Position">
          <Seg label="Heading position" value={d.heading.align} options={[['left', 'Left'], ['center', 'Centre']] as const} onChange={(v) => tune('hpos', (x) => void (x.heading.align = v))} />
        </Row>
        <Row label="Size">
          <Range label="Heading size" value={d.heading.size} min={9} max={16} step={0.5} show={(v) => `${v} pt`} onChange={(v) => tune('hsize', (x) => void (x.heading.size = v))} />
        </Row>
        <Row label="Letter spacing">
          <Range label="Heading letter spacing" value={d.heading.spacing} min={0} max={0.12} step={0.01} show={(v) => v.toFixed(2)} onChange={(v) => tune('hspace', (x) => void (x.heading.spacing = v))} />
        </Row>
      </Group>

      <Group title="Entries and lists">
        <Row label="Dates">
          <Seg label="Where dates go" value={d.entry.dates} options={[['right', 'Right'], ['left', 'Left'], ['below', 'Below']] as const} onChange={(v) => tune('dates', (x) => void (x.entry.dates = v))} />
        </Row>
        <Row label="Organisation">
          <Seg label="Organisation style" value={d.entry.subtitle} options={[['plain', 'Plain'], ['italic', 'Italic'], ['accent', 'Accent']] as const} onChange={(v) => tune('sub', (x) => void (x.entry.subtitle = v))} />
        </Row>
        <Row label="Bullets">
          <Seg label="Bullet mark" value={d.entry.bullet} options={[['disc', '•'], ['dash', '–'], ['dot', '·'], ['chevron', '›'], ['none', 'None']] as const} onChange={(v) => tune('bullet', (x) => void (x.entry.bullet = v))} />
        </Row>
        <Row label="Skills">
          <Seg label="Skills layout" value={d.skills} options={[['inline', 'Line'], ['list', 'List'], ['chips', 'Chips']] as const} onChange={(v) => tune('skills', (x) => void (x.skills = v))} />
        </Row>
      </Group>

      <Group title="Photo">
        <Row label="Shape">
          <Seg label="Photo" value={d.header.photo} options={[['none', 'None'], ['round', 'Round'], ['square', 'Square']] as const} onChange={(v) => tune('photo', (x) => void (x.header.photo = v))} />
        </Row>
        {d.header.photo !== 'none' && (
          <Row label={photo ? 'Picture added' : 'No picture yet'}>
            <span className="accents">
              <button type="button" className="btn btn-s" onClick={() => file.current?.click()}>
                <IconUser /> {photo ? 'Change' : 'Choose'}
              </button>
              {photo && (
                <button type="button" className="btn btn-s btn-ghost" onClick={() => edit((p) => void (p.cv.photo = ''), { moves: true })}>
                  Remove
                </button>
              )}
            </span>
          </Row>
        )}
        <input
          ref={file}
          type="file"
          accept="image/*"
          hidden
          onChange={async (e) => {
            const chosen = e.target.files?.[0]
            e.target.value = ''
            if (!chosen) return
            try {
              const url = await pickPhoto(chosen)
              edit((p) => void (p.cv.photo = url), { moves: true })
            } catch {
              toast('That picture couldn’t be opened.', true)
            }
          }}
        />
        <p className="hint">Many employers’ screening software ignores photos, and some countries advise against them. Add one only where it is expected.</p>
      </Group>
    </div>
  )
}
