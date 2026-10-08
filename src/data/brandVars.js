import { toolIcons } from './toolIcons'

// Brand colour as CSS vars, so a tile can tint itself without a second lookup.
// --brand-dark falls back to --brand for icons that read fine on both themes.
export function brandVars(slug) {
  const icon = toolIcons[slug]
  if (!icon) return undefined
  return {
    '--brand': `#${icon.hex}`,
    '--brand-dark': `#${icon.darkHex ?? icon.hex}`,
  }
}
