import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react'
import { mix } from '../design/color.ts'
import { PAGES, PX_PER_MM, PX_PER_PT, type Design } from '../design/design.ts'
import { fontStack } from '../design/fonts.ts'
import * as ops from '../model/ops.ts'
import { CONTACT_ID, type Arrangement, type Contact, type Cv, type Entry, type Region, type Section } from '../model/types.ts'
import { edit } from '../state/store.ts'
import { IconEyeOff, IconGrip, IconPlus, IconTrash } from '../ui/icons.tsx'
import { Editable, type SheetMode } from './Editable.tsx'
import { ensureFonts } from './fontFiles.ts'
import { paginate, type Paging } from './paginate.ts'
import './sheet.css'

/** What the studio hooks into the page: dragging, and which block is in the air. */
export interface SheetHooks {
  /** The section or entry being dragged: it shows as a thin marker where it would land. */
  dragging: string | null
  onGrip(event: PointerEvent<HTMLElement>, what: { section: string; entry?: string }): void
}

interface Props {
  cv: Cv
  design: Design
  arrangement: Arrangement
  mode: SheetMode
  /** The space shown between pages; none on a page being exported. */
  gap?: number
  hooks?: SheetHooks
  /** Changes whenever blocks may have moved; the page then glides them into place. */
  motion?: number
  onPaging?(paging: Paging): void
}

interface Ctx {
  mode: SheetMode
  design: Design
  hooks?: SheetHooks
}

const SheetCtx = createContext<Ctx>({ mode: 'view', design: null as unknown as Design })
const useSheet = () => useContext(SheetCtx)

const BULLETS: Record<Design['entry']['bullet'], string> = { disc: '•', dash: '–', dot: '·', chevron: '›', none: '' }

/** A block the page-breaker may move to the next page but never cut in two. */
function Unit({ children, heading }: { children: ReactNode; heading?: boolean | number }) {
  return (
    <div className="unit" data-unit={heading ? 'heading' : 'block'}>
      {children}
    </div>
  )
}

export function Sheet({ cv, design, arrangement, mode, gap = 0, hooks, motion = 0, onPaging }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [paging, setPaging] = useState<Paging>({ pages: 1, headBottom: 0 })
  const page = PAGES[design.page]
  const margin = design.margin * PX_PER_MM
  const two = design.columns === 2
  // One column has no sidebar for the header to sit in.
  const headPlace = two ? design.header.place : 'top'
  const places = useRef(new Map<string, { x: number; y: number }>())
  const lastMotion = useRef(motion)

  useEffect(() => {
    void ensureFonts([design.fonts.body, design.fonts.heading])
  }, [design.fonts.body, design.fonts.heading])

  // After every render: break the pages, then glide any block that moved.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const run = () => {
      const next = paginate(el, page.height, gap, margin)
      setPaging((prev) => (prev.pages === next.pages && Math.abs(prev.headBottom - next.headBottom) < 0.5 ? prev : next))
      onPaging?.(next)
    }
    run()
    if (mode === 'edit' || mode === 'touch') glide(el, places.current, lastMotion.current !== motion)
    lastMotion.current = motion
    const observer = new ResizeObserver(run)
    for (const node of el.querySelectorAll('[data-flow], [data-head]')) observer.observe(node)
    document.fonts.addEventListener('loadingdone', run)
    return () => {
      observer.disconnect()
      document.fonts.removeEventListener('loadingdone', run)
    }
  })

  const side = design.sidebar
  const stride = page.height + gap
  const sideWidth = page.width * side.width
  const style = {
    '--pw': `${page.width}px`,
    '--ph': `${page.height}px`,
    '--m': `${margin}px`,
    '--paper': design.colors.paper,
    '--text': design.colors.text,
    '--muted': design.colors.muted,
    '--accent': design.colors.accent,
    '--rule': design.colors.rule,
    '--font-body': fontStack(design.fonts.body),
    '--font-head': fontStack(design.fonts.heading),
    '--fs': `${design.fonts.size * PX_PER_PT}px`,
    '--lh': design.fonts.leading,
    '--name-size': `${design.header.nameSize * PX_PER_PT}px`,
    '--name-weight': design.header.nameWeight,
    '--name-color': design.header.nameColor,
    '--name-spacing': `${design.header.nameSpacing}em`,
    '--head-text': design.header.textColor,
    '--h-size': `${design.heading.size * PX_PER_PT}px`,
    '--h-weight': design.heading.weight,
    '--h-color': design.heading.color,
    '--h-spacing': `${design.heading.spacing}em`,
    '--band': mix(design.heading.color, design.colors.paper, 0.86),
    '--sp': design.spacing,
    minHeight: `${paging.pages * page.height + (paging.pages - 1) * gap}px`,
  } as CSSProperties

  const sideBase = side.fill || design.colors.paper
  const sideStyle = {
    '--text': side.text,
    '--muted': mix(side.text, sideBase, 0.3),
    '--accent': side.heading,
    '--h-color': side.heading,
    '--rule': mix(side.text, sideBase, 0.72),
    '--band': mix(side.heading, sideBase, 0.8),
  } as CSSProperties

  // Margins: the page's own at the outer edges, a narrower gutter between columns.
  const topPad = headPlace === 'top' ? margin * (design.header.fill || side.fill ? 0.6 : 0.4) : margin
  const pad = (left: number, right: number): CSSProperties => ({ paddingLeft: left, paddingRight: right, paddingTop: topPad, paddingBottom: margin })
  const inner = side.fill ? margin * 0.78 : margin * 0.42
  const sidePad = side.fill ? pad(margin * 0.62, margin * 0.62) : side.side === 'left' ? pad(margin, inner) : pad(inner, margin)
  const mainPad = !two ? pad(margin, margin) : side.side === 'left' ? pad(inner, margin) : pad(margin, inner)

  const byId = new Map(cv.sections.map((s) => [s.id, s]))
  const contactInColumn = arrangement.main.includes(CONTACT_ID) || arrangement.side.includes(CONTACT_ID)
  const header = <Header cv={cv} showContacts={!contactInColumn} place={headPlace} />

  const column = (region: Region, ids: string[]) =>
    ids.map((id) =>
      id === CONTACT_ID ? <ContactSection key={id} contacts={cv.contacts} /> : byId.has(id) ? <SectionView key={id} section={byId.get(id) as Section} region={region} /> : null,
    )

  const mainColumn = (
    <div className="col col-main" data-flow="main" data-zone="main" data-zone-group="section" style={mainPad}>
      {headPlace === 'main' && header}
      {column('main', two ? arrangement.main : [...arrangement.main, ...arrangement.side])}
    </div>
  )
  const sideColumn = two && (
    <div className="col col-side" data-flow="side" data-zone="side" data-zone-group="section" style={{ ...sidePad, ...sideStyle }}>
      {headPlace === 'side' && header}
      {column('side', arrangement.side)}
    </div>
  )

  return (
    <SheetCtx.Provider value={{ mode, design, hooks }}>
      <div
        ref={ref}
        className="sheet"
        style={style}
        data-drag-root
        data-mode={mode}
        data-cols={design.columns}
        data-side={side.side}
        data-rule={design.heading.rule}
        data-halign={design.heading.align}
        data-head-align={design.header.align}
        data-dates={design.entry.dates}
        data-sub={design.entry.subtitle}
        data-skills={design.skills}
        data-pages={paging.pages}
        data-stride={stride}
      >
        <div className="sheet-backs" aria-hidden="true">
          {Array.from({ length: paging.pages }, (_, i) => (
            <div key={i} className="sheet-paper" style={{ top: i * stride }}>
              {two && side.fill && (
                <div
                  className="sheet-fill"
                  style={{
                    background: side.fill,
                    width: sideWidth,
                    [side.side]: 0,
                    top: i === 0 && headPlace === 'top' ? paging.headBottom : 0,
                    bottom: 0,
                  }}
                />
              )}
              {i === 0 && headPlace === 'top' && design.header.fill && <div className="sheet-fill" style={{ background: design.header.fill, left: 0, right: 0, top: 0, height: paging.headBottom }} />}
            </div>
          ))}
        </div>
        <div className="sheet-flow">
          {headPlace === 'top' && header}
          <div className="sheet-cols" style={two ? { gridTemplateColumns: side.side === 'left' ? `${sideWidth}px minmax(0, 1fr)` : `minmax(0, 1fr) ${sideWidth}px` } : undefined}>
            {two && side.side === 'left' && sideColumn}
            {mainColumn}
            {two && side.side === 'right' && sideColumn}
          </div>
        </div>
      </div>
    </SheetCtx.Provider>
  )
}

/**
 * Moves blocks from where they were to where they now are, instead of
 * letting them jump: sections closing a gap, or crossing to the other column.
 * Only position is animated; text is never stretched.
 */
function glide(sheet: HTMLElement, last: Map<string, { x: number; y: number }>, moved: boolean) {
  const box = sheet.getBoundingClientRect()
  const scale = box.width / sheet.offsetWidth || 1
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const seen = new Set<string>()
  for (const el of sheet.querySelectorAll<HTMLElement>('[data-glide]')) {
    const id = el.dataset.glide as string
    const r = el.getBoundingClientRect()
    const now = { x: (r.left - box.left) / scale, y: (r.top - box.top) / scale }
    const was = last.get(id)
    seen.add(id)
    last.set(id, now)
    if (!moved || still) continue
    if (!was) {
      el.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.2,.8,.2,1)' })
      continue
    }
    const dx = was.x - now.x
    const dy = was.y - now.y
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue
    el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' })
  }
  for (const id of [...last.keys()]) if (!seen.has(id)) last.delete(id)
}

// ------------------------------------------------------------------ header

function Header({ cv, showContacts, place }: { cv: Cv; showContacts: boolean; place: 'top' | 'main' | 'side' }) {
  const { mode, design } = useSheet()
  const h = design.header
  const editing = mode === 'edit' || mode === 'touch'
  const wantsPhoto = h.photo !== 'none'
  const photo = wantsPhoto && cv.photo ? <img className={`photo photo-${h.photo}`} src={cv.photo} alt="" /> : null
  return (
    <header className={`head head-${place} ${h.fill && place === 'top' ? 'head-filled' : ''}`} data-head={place} data-photo={photo ? 'yes' : undefined}>
      <div className="head-row">
        {photo}
        <div className="head-text">
          <h1 className="name">
            <Editable field="name" value={cv.name} mode={mode} placeholder="Your name" upper={h.nameCase === 'upper'} />
          </h1>
          {(cv.headline || editing) && (
            <p className="headline">
              <Editable field="headline" value={cv.headline} mode={mode} placeholder="What you do, in a line" />
            </p>
          )}
          {showContacts && cv.contacts.length > 0 && (
            <div className={`contacts contacts-${place === 'side' ? 'stacked' : h.contacts}`}>
              {cv.contacts.map((c, i) => (
                <span className="contact" key={c.id}>
                  {i > 0 && h.contacts === 'inline' && place !== 'side' && <span className="sep"> | </span>}
                  <ContactText contact={c} />
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      {h.rule && <div className="head-rule" />}
    </header>
  )
}

function ContactText({ contact }: { contact: Contact }) {
  const { mode } = useSheet()
  return (
    <Editable
      field={`c:${contact.id}`}
      value={contact.value}
      mode={mode}
      placeholder={contact.kind}
      href={contact.url || undefined}
      onEmpty={() => edit((p) => ops.removeContact(p, contact.id))}
    />
  )
}

function ContactSection({ contacts }: { contacts: Contact[] }) {
  const { mode, design, hooks } = useSheet()
  const dragging = hooks?.dragging === CONTACT_ID
  return (
    <section className={`sec ${dragging ? 'sec-lifted' : ''}`} data-section={CONTACT_ID} data-glide={CONTACT_ID} data-drop="section" data-drop-id={CONTACT_ID}>
      {mode === 'edit' && <SectionTools id={CONTACT_ID} />}
      <Unit heading>
        <h2 className="sec-h">
          <span className={design.heading.case === 'upper' ? 'ed ed-upper' : 'ed'}>{design.heading.case === 'upper' && mode === 'print' ? 'CONTACT' : 'Contact'}</span>
        </h2>
      </Unit>
      {contacts.map((c) => (
        <Unit key={c.id}>
          <div className="contact-line">
            <ContactText contact={c} />
          </div>
        </Unit>
      ))}
    </section>
  )
}

// ------------------------------------------------------------------ sections

function SectionTools({ id, onAdd }: { id: string; onAdd?: () => void }) {
  const { hooks } = useSheet()
  return (
    <div className="tools sec-tools" contentEditable={false} data-noexport>
      <button type="button" className="tool tool-grip" aria-label="Drag to move this section" title="Drag to move" onPointerDown={(e) => hooks?.onGrip(e, { section: id })}>
        <IconGrip />
      </button>
      {onAdd && (
        <button type="button" className="tool" aria-label="Add to this section" title="Add" onClick={onAdd}>
          <IconPlus />
        </button>
      )}
      <button type="button" className="tool" aria-label="Hide this section" title="Hide" onClick={() => edit((p) => ops.placeSection(p, id, 'hidden', 0), { moves: true })}>
        <IconEyeOff />
      </button>
      {id !== CONTACT_ID && (
        <button type="button" className="tool tool-danger" aria-label="Delete this section" title="Delete" onClick={() => edit((p) => ops.removeSection(p, id), { moves: true })}>
          <IconTrash />
        </button>
      )}
    </div>
  )
}

function SectionView({ section: s, region }: { section: Section; region: Region }) {
  const { mode, design, hooks } = useSheet()
  const lifted = hooks?.dragging === s.id
  const add =
    s.shape === 'entries'
      ? () => edit((p) => ops.addEntry(p, s.id), { moves: true })
      : s.shape === 'list'
        ? () => edit((p) => ops.addItem(p, s.id))
        : s.shape === 'tags'
          ? () => edit((p) => ops.addGroup(p, s.id))
          : undefined
  return (
    <section
      className={`sec ${lifted ? 'sec-lifted' : ''}`}
      data-section={s.id}
      data-kind={s.kind}
      data-shape={s.shape}
      data-glide={s.id}
      data-drop="section"
      data-drop-id={s.id}
      data-zone-group={`entry:${s.id}`}
      data-zone={s.id}
    >
      {mode === 'edit' && <SectionTools id={s.id} onAdd={add} />}
      <Unit heading>
        <h2 className="sec-h">
          <Editable field={`st:${s.id}`} value={s.title} mode={mode} placeholder="Section title" upper={design.heading.case === 'upper'} />
        </h2>
      </Unit>
      {s.shape === 'text' && (
        <Unit>
          <div className="para">
            <Editable field={`sx:${s.id}`} value={s.text} mode={mode} placeholder="Write a few lines" multiline />
          </div>
        </Unit>
      )}
      {s.shape === 'entries' && s.entries.map((e) => <EntryView key={e.id} section={s} entry={e} region={region} />)}
      {s.shape === 'list' && s.items.map((item) => <BulletLine key={item.id} field={`i:${s.id}:${item.id}`} value={item.text} onEnter={() => edit((p) => ops.addItem(p, s.id, item.id))} onEmpty={() => edit((p) => ops.removeItem(p, s.id, item.id))} />)}
      {s.shape === 'tags' && <Tags section={s} region={region} />}
    </section>
  )
}

function BulletLine({ field, value, onEnter, onEmpty }: { field: string; value: string; onEnter: () => void; onEmpty: () => void }) {
  const { mode, design } = useSheet()
  const mark = BULLETS[design.entry.bullet]
  if (!value && (mode === 'view' || mode === 'print')) return null
  return (
    <Unit>
      <div className="bullet">
        {mark && <span className="b-mark">{mark}</span>}
        <Editable className="b-text" field={field} value={value} mode={mode} placeholder="Write a point" onEnter={onEnter} onEmpty={onEmpty} />
      </div>
    </Unit>
  )
}

function EntryView({ section: s, entry: e, region }: { section: Section; entry: Entry; region: Region }) {
  const { mode, design, hooks } = useSheet()
  const f = (name: string) => `e:${s.id}:${e.id}:${name}`
  // A narrow sidebar has no room for dates beside the title.
  const dates = region === 'side' ? 'below' : design.entry.dates
  const editing = mode === 'edit' || mode === 'touch'
  const show = (value: string) => editing || !!value
  const title = <Editable className="e-title" field={f('title')} value={e.title} mode={mode} placeholder="Title" />
  const sub = <Editable className="e-sub" field={f('subtitle')} value={e.subtitle} mode={mode} placeholder="Organisation" />
  const date = <Editable className="e-date" field={f('date')} value={e.date} mode={mode} placeholder="Dates" />
  const loc = <Editable className="e-loc" field={f('location')} value={e.location} mode={mode} placeholder="Place" />
  const lifted = hooks?.dragging === e.id

  return (
    <div className={`entry ${lifted ? 'entry-lifted' : ''}`} data-entry={e.id} data-dates={dates} data-glide={e.id} data-drop={`entry:${s.id}`} data-drop-id={e.id}>
      {mode === 'edit' && (
        <div className="tools entry-tools" contentEditable={false} data-noexport>
          <button type="button" className="tool tool-grip" aria-label="Drag to reorder" title="Drag to reorder" onPointerDown={(ev) => hooks?.onGrip(ev, { section: s.id, entry: e.id })}>
            <IconGrip />
          </button>
          <button type="button" className="tool" aria-label="Add a point" title="Add a point" onClick={() => edit((p) => ops.addBullet(p, s.id, e.id, e.bullets[e.bullets.length - 1]?.id))}>
            <IconPlus />
          </button>
          <button type="button" className="tool tool-danger" aria-label="Delete this entry" title="Delete" onClick={() => edit((p) => ops.removeEntry(p, s.id, e.id), { moves: true })}>
            <IconTrash />
          </button>
        </div>
      )}
      <Unit heading={e.bullets.length > 0 || !!e.summary}>
        {dates === 'left' ? (
          <div className="e-grid">
            <div className="e-when">
              {show(e.date) && <div className="e-line">{date}</div>}
              {show(e.location) && <div className="e-line">{loc}</div>}
            </div>
            <div className="e-what">
              {show(e.title) && <div className="e-line">{title}</div>}
              {show(e.subtitle) && <div className="e-line">{sub}</div>}
            </div>
          </div>
        ) : dates === 'right' ? (
          <>
            {(show(e.title) || show(e.date)) && (
              <div className="e-row">
                {title}
                {date}
              </div>
            )}
            {(show(e.subtitle) || show(e.location)) && (
              <div className="e-row">
                {sub}
                {loc}
              </div>
            )}
          </>
        ) : (
          <>
            {show(e.title) && <div className="e-line">{title}</div>}
            {show(e.subtitle) && <div className="e-line">{sub}</div>}
            {(show(e.date) || show(e.location)) && (
              <div className="e-line e-meta">
                {date}
                {e.date && e.location && <span className="sep"> | </span>}
                {loc}
              </div>
            )}
          </>
        )}
      </Unit>
      {(e.summary || mode === 'edit') && (
        <Unit>
          <div className="e-sum e-indent">
            <Editable field={f('summary')} value={e.summary} mode={mode} placeholder="Description (optional)" multiline />
          </div>
        </Unit>
      )}
      <div className="e-indent">
        {e.bullets.map((b) => (
          <BulletLine
            key={b.id}
            field={`b:${s.id}:${e.id}:${b.id}`}
            value={b.text}
            onEnter={() => edit((p) => ops.addBullet(p, s.id, e.id, b.id))}
            onEmpty={() => edit((p) => ops.removeBullet(p, s.id, e.id, b.id))}
          />
        ))}
      </div>
    </div>
  )
}

function Tags({ section: s, region }: { section: Section; region: Region }) {
  const { mode, design } = useSheet()
  const editing = mode === 'edit'
  // In a sidebar a running line of skills wraps badly; one to a line reads better.
  const look = region === 'side' && design.skills === 'inline' ? 'list' : design.skills
  return (
    <>
      {s.groups.map((g) => {
        const tag = (t: { id: string; text: string }) => (
          <Editable
            key={t.id}
            className="tag"
            field={`t:${s.id}:${g.id}:${t.id}`}
            value={t.text}
            mode={mode}
            placeholder="skill"
            onEnter={() => edit((p) => ops.addTag(p, s.id, g.id, t.id))}
            onEmpty={() => edit((p) => ops.removeTag(p, s.id, g.id, t.id))}
          />
        )
        const label = (g.label || editing) && <Editable className="tag-label" field={`g:${s.id}:${g.id}`} value={g.label} mode={mode} placeholder="Group (optional)" />
        const more = editing && (
          <button type="button" className="tool tool-inline" contentEditable={false} data-noexport aria-label="Add a skill" title="Add" onClick={() => edit((p) => ops.addTag(p, s.id, g.id, g.items[g.items.length - 1]?.id))}>
            <IconPlus />
          </button>
        )
        const shown = mode === 'view' || mode === 'print' ? g.items.filter((t) => t.text) : g.items
        if (look === 'list') {
          return (
            <div className="tag-group tag-list" key={g.id}>
              {label && (
                <Unit heading>
                  <div className="tag-head">{label}</div>
                </Unit>
              )}
              {shown.map((t) => (
                <Unit key={t.id}>
                  <div className="tag-line">{tag(t)}</div>
                </Unit>
              ))}
              {more}
            </div>
          )
        }
        return (
          <Unit key={g.id}>
            <div className={`tag-group tag-${look}`}>
              {label && (
                <span className="tag-lead">
                  {label}
                  {look === 'inline' && g.label && <span className="sep">: </span>}
                </span>
              )}
              <span className="tag-run">
                {shown.map((t, i) => (
                  <span className="tag-wrap" key={t.id}>
                    {tag(t)}
                    {look === 'inline' && i < shown.length - 1 && <span className="sep">, </span>}
                  </span>
                ))}
                {more}
              </span>
            </div>
          </Unit>
        )
      })}
    </>
  )
}
