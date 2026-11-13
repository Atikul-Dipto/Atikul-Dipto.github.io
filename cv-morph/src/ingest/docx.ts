import type { Chunk, DocModel, PageModel, Tinted } from '../parse/geometry.ts'
import type { Progress } from './index.ts'
import { toChunks, type Piece } from './pdf.ts'

// A Word file has no positions of its own: where a line falls is decided by
// whatever lays it out. So it is laid out here, off-screen, by docx-preview,
// and the positions, sizes, weights and colours are read back off that page,
// the same facts a PDF gives.

const PT = 0.75 // points per CSS pixel

function hex(color: string): string {
  const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,/\s]+([\d.]+))?/.exec(color)
  if (!m || (m[4] !== undefined && Number(m[4]) < 0.05)) return ''
  return `#${[m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, '0')).join('')}`
}

export async function readDocx(file: File, onProgress: (p: Progress) => void): Promise<DocModel> {
  const { renderAsync } = await import('docx-preview')
  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  host.style.cssText = 'position:fixed;left:-100000px;top:0;width:1200px;pointer-events:none;background:#fff;color:#000'
  document.body.appendChild(host)
  try {
    try {
      await renderAsync(file, host, host, { inWrapper: true, breakPages: true, ignoreFonts: true, renderHeaders: true, renderFooters: false, useBase64URL: true })
    } catch {
      throw new Error('That Word file couldn’t be opened. Save it again as .docx, or export it as a PDF.')
    }
    onProgress({ stage: 'text' })
    await document.fonts.ready
    const sections = [...host.querySelectorAll<HTMLElement>('section.docx')]
    const pages: PageModel[] = (sections.length ? sections : [host]).map(readPage)
    onProgress({ stage: 'layout' })
    return { kind: 'docx', name: file.name, pages, unit: 1, ocr: false, soft: false, preview: sketch(pages[0]) }
  } finally {
    host.remove()
  }
}

function readPage(section: HTMLElement): PageModel {
  const origin = section.getBoundingClientRect()
  const pieces: Piece[] = []
  const fills: Tinted[] = []
  const rules: Tinted[] = []
  const range = document.createRange()
  const boxOf = (r: DOMRect) => ({ x: (r.left - origin.left) * PT, y: (r.top - origin.top) * PT, w: r.width * PT, h: r.height * PT })

  for (const el of section.querySelectorAll<HTMLElement>('*')) {
    const style = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) continue
    const fill = hex(style.backgroundColor)
    if (fill && fill !== '#ffffff' && el !== section) fills.push({ ...boxOf(r), color: fill })
    for (const side of ['Top', 'Bottom'] as const) {
      const width = parseFloat(style[`border${side}Width`]) || 0
      const color = hex(style[`border${side}Color`])
      if (width > 0 && style[`border${side}Style`] !== 'none' && color && r.width > 40) {
        const y = side === 'Top' ? r.top : r.bottom - width
        rules.push({ x: (r.left - origin.left) * PT, y: (y - origin.top) * PT, w: r.width * PT, h: width * PT, color })
      }
    }
  }

  const walker = document.createTreeWalker(section, NodeFilter.SHOW_TEXT)
  const listed = new Set<Element>()
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const parent = node.parentElement
    if (!parent || !node.data.trim()) continue
    const style = getComputedStyle(parent)
    if (style.display === 'none' || style.visibility === 'hidden') continue
    const size = parseFloat(style.fontSize) * PT
    const bold = (parseInt(style.fontWeight, 10) || 400) >= 600
    const italic = style.fontStyle === 'italic'
    const font = style.fontFamily.split(',')[0].replace(/['"]/g, '').trim()
    const color = hex(style.color)
    const link = parent.closest('a')?.href ?? ''
    // Word's list bullets are drawn by the stylesheet, not written in the text.
    const paragraph = parent.closest('p')
    let bullet = false
    if (paragraph && !listed.has(paragraph)) {
      const marker = getComputedStyle(paragraph, '::before').content
      if (marker && marker !== 'none' && marker !== 'normal' && marker !== '""') {
        bullet = true
        listed.add(paragraph)
      }
    }
    const word = /\S+/g
    for (let m = word.exec(node.data); m; m = word.exec(node.data)) {
      range.setStart(node, m.index)
      range.setEnd(node, m.index + m[0].length)
      const rects = [...range.getClientRects()].filter((r) => r.width > 0)
      if (!rects.length) continue
      const r = rects[0]
      const centre = (r.top + r.bottom) / 2 - origin.top
      pieces.push({
        text: m[0],
        x: (r.left - origin.left) * PT,
        y: centre * PT - size / 2,
        w: (rects[rects.length - 1].right - r.left) * PT,
        h: size,
        size,
        bold,
        italic,
        font,
        color,
        bullet,
        links: link && /^(?:https?:|mailto:|tel:)/i.test(link) ? [link] : [],
      })
      bullet = false
    }
  }
  const chunks: Chunk[] = toChunks(pieces)
  return { width: origin.width * PT, height: origin.height * PT, chunks, raster: null, rules, fills }
}

/** Draws a small picture of a page from what was read off it, for the reading animation. */
function sketch(page: PageModel | undefined): string {
  if (!page) return ''
  const scale = 620 / page.width
  const canvas = document.createElement('canvas')
  canvas.width = 620
  canvas.height = Math.round(Math.min(page.height, page.width * 1.6) * scale)
  const context = canvas.getContext('2d')
  if (!context) return ''
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  for (const fill of page.fills) {
    context.fillStyle = fill.color
    context.fillRect(fill.x * scale, fill.y * scale, fill.w * scale, fill.h * scale)
  }
  for (const rule of page.rules) {
    context.fillStyle = rule.color
    context.fillRect(rule.x * scale, rule.y * scale, rule.w * scale, Math.max(1, rule.h * scale))
  }
  context.textBaseline = 'top'
  for (const chunk of page.chunks) {
    context.fillStyle = chunk.color || '#222222'
    context.font = `${chunk.italic ? 'italic ' : ''}${chunk.bold ? '700 ' : ''}${Math.max(3, chunk.size * scale)}px sans-serif`
    context.fillText(chunk.text, chunk.x * scale, chunk.y * scale, chunk.w * scale)
  }
  return canvas.toDataURL('image/jpeg', 0.82)
}
