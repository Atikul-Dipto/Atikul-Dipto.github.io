import { useState } from 'react'
import * as ops from '../model/ops.ts'
import { KIND_ORDER, KINDS } from '../model/sections.ts'
import { CONTACT_ID, type ContactKind, type SectionShape } from '../model/types.ts'
import { edit, useStore } from '../state/store.ts'
import { Group, Row, Seg } from './controls.tsx'
import { startDrag } from './dnd.ts'
import { IconArrowDown, IconArrowUp, IconEye, IconEyeOff, IconGrip, IconPlus, IconTrash } from './icons.tsx'

const SHAPES: readonly (readonly [SectionShape, string])[] = [
  ['entries', 'Entries'],
  ['list', 'List'],
  ['tags', 'Tags'],
  ['text', 'Text'],
]

const CONTACTS: ContactKind[] = ['email', 'phone', 'location', 'linkedin', 'github', 'website', 'other']

/** The CV as an outline: which sections it has, in which column and order, and what is tucked away. */
export function SectionsPanel() {
  const project = useStore((s) => s.project)
  const [open, setOpen] = useState<string | null>(null)
  const [lifted, setLifted] = useState<string | null>(null)
  if (!project) return null
  const { cv, arrangement, design } = project
  const two = design.columns === 2
  const titleOf = (id: string) => (id === CONTACT_ID ? 'Contact details' : cv.sections.find((s) => s.id === id)?.title || 'Untitled')
  const contactPlaced = arrangement.main.includes(CONTACT_ID) || arrangement.side.includes(CONTACT_ID)

  const zone = (name: ops.Place, label: string, ids: string[], empty: string) => (
    <div className="outline-zone" data-zone={name} data-zone-group="section" data-drag-root>
      <div className="outline-zone-title mono">{label}</div>
      {ids.length === 0 && <p className="outline-empty">{empty}</p>}
      {ids.map((id, index) => {
        const section = cv.sections.find((s) => s.id === id)
        const isOpen = open === id
        return (
          <div key={id} className={`outline-item ${lifted === id ? 'outline-lifted' : ''}`} data-drop="section" data-drop-id={id}>
            <div className="outline-row">
              <button
                type="button"
                className="outline-grip"
                aria-label={`Drag ${titleOf(id)}`}
                onPointerDown={(event) => {
                  const state = useStore.getState()
                  const before = state.project
                  startDrag(event, {
                    id,
                    group: 'section',
                    label: titleOf(id),
                    onStart: () => setLifted(id),
                    onMove: (landing) => landing && state.edit((p) => ops.placeSection(p, id, landing.zone as ops.Place, landing.index), { quiet: true, moves: true }),
                    onEnd: (_, cancelled) => {
                      setLifted(null)
                      useStore.getState().settle(before, !cancelled)
                    },
                  })
                }}
              >
                <IconGrip />
              </button>
              <button type="button" className="outline-title" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : id)}>
                <span>{titleOf(id)}</span>
                {section && <small>{KINDS[section.kind].title === section.title ? section.shape : `${KINDS[section.kind].title.toLowerCase()} · ${section.shape}`}</small>}
              </button>
              <button type="button" className="btn btn-ghost btn-icon btn-s" aria-label="Move up" disabled={index === 0} onClick={() => edit((p) => ops.placeSection(p, id, name, index - 1), { moves: true })}>
                <IconArrowUp />
              </button>
              <button type="button" className="btn btn-ghost btn-icon btn-s" aria-label="Move down" disabled={index === ids.length - 1} onClick={() => edit((p) => ops.placeSection(p, id, name, index + 1), { moves: true })}>
                <IconArrowDown />
              </button>
              {name === 'hidden' ? (
                <button type="button" className="btn btn-ghost btn-icon btn-s" aria-label="Show on the CV" onClick={() => edit((p) => ops.placeSection(p, id, section && KINDS[section.kind].side && two ? 'side' : 'main', 999), { moves: true })}>
                  <IconEyeOff />
                </button>
              ) : (
                <button type="button" className="btn btn-ghost btn-icon btn-s" aria-label={id === CONTACT_ID ? 'Put back under the name' : 'Hide from the CV'} onClick={() => edit((p) => ops.placeSection(p, id, 'hidden', 0), { moves: true })}>
                  <IconEye />
                </button>
              )}
            </div>
            {isOpen && (
              <div className="outline-more">
                {two && name !== 'hidden' && (
                  <Row label="Column">
                    <Seg label="Column" value={name} options={[['main', 'Main'], ['side', 'Sidebar']] as const} onChange={(to) => edit((p) => ops.placeSection(p, id, to, 999), { moves: true })} />
                  </Row>
                )}
                {section && (
                  <>
                    <Row label="Laid out as">
                      <Seg label="Section layout" value={section.shape} options={SHAPES} onChange={(shape) => edit((p) => ops.setShape(p, id, shape), { moves: true })} />
                    </Row>
                    <Row label="Remove it">
                      <button type="button" className="btn btn-s" onClick={() => edit((p) => ops.removeSection(p, id), { moves: true })}>
                        <IconTrash /> Delete section
                      </button>
                    </Row>
                  </>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )

  return (
    <div className="panel-body">
      <Group title="Arrange">
        <p className="hint">Drag a section by its handle, here or on the page itself, to move it. Drop it in the other column, or in Hidden to keep it out of this version.</p>
        {zone('main', two ? 'Main column' : 'On the page', two ? arrangement.main : [...arrangement.main, ...arrangement.side], 'Drop a section here')}
        {two && zone('side', 'Sidebar', arrangement.side, 'Drop a section here')}
        {zone('hidden', 'Hidden', arrangement.hidden, 'Nothing hidden')}
        {!contactPlaced && two && (
          <button type="button" className="btn btn-s" onClick={() => edit((p) => ops.placeSection(p, CONTACT_ID, 'side', 0), { moves: true })}>
            <IconPlus /> Show contact details as a section
          </button>
        )}
      </Group>

      <Group title="Add a section">
        <div className="add-kinds">
          {KIND_ORDER.map((kind) => (
            <button key={kind} type="button" className="chip" onClick={() => edit((p) => ops.addSection(p, kind, two && KINDS[kind].side ? 'side' : 'main'), { moves: true })}>
              <IconPlus /> {kind === 'custom' ? 'Your own' : KINDS[kind].title}
            </button>
          ))}
        </div>
      </Group>

      <Group title="Add a contact detail">
        <div className="add-kinds">
          {CONTACTS.map((kind) => (
            <button key={kind} type="button" className="chip" onClick={() => edit((p) => ops.addContact(p, kind))}>
              <IconPlus /> {kind === 'other' ? 'Other' : kind.charAt(0).toUpperCase() + kind.slice(1)}
            </button>
          ))}
        </div>
        <p className="hint">To remove a contact detail, empty it and press Backspace.</p>
      </Group>
    </div>
  )
}
