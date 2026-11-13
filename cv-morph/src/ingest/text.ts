import { blankChunk, type DocModel } from '../parse/geometry.ts'

/** Pasted or plain text: lines with no looks, only their order and indentation. */
export function readText(text: string, name = 'pasted text'): DocModel {
  const size = 11
  const chunks = []
  let y = 40
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const line = raw.replace(/\t/g, '    ')
    if (!line.trim()) {
      y += size * 1.1
      continue
    }
    const indent = line.length - line.trimStart().length
    chunks.push(blankChunk(line.trim(), 40 + indent * size * 0.5, y, line.trim().length * size * 0.5, size, size))
    y += size * 1.35
  }
  return { kind: 'text', name, pages: [{ width: 612, height: Math.max(792, y + 40), chunks, raster: null, rules: [], fills: [] }], unit: 1, ocr: false, soft: false, preview: '' }
}
