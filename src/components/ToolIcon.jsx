import { toolIcons } from '../data/toolIcons'

// Renders a brand glyph when one is available under an open licence, and a
// monogram tile otherwise. Brand colour is exposed as --brand so the tile can
// tint its background/border without a second lookup.
export default function ToolIcon({ slug, name }) {
  const icon = toolIcons[slug]
  const label = name ?? icon?.title ?? slug

  if (!icon) {
    return (
      <span className="tool-icon tool-icon--mono" aria-hidden="true">
        {label.slice(0, 2)}
      </span>
    )
  }

  if (icon.mono) {
    return (
      <span className="tool-icon tool-icon--mono" aria-hidden="true">
        {icon.mono}
      </span>
    )
  }

  return (
    <svg className="tool-icon" viewBox="0 0 24 24" role="img" aria-hidden="true" focusable="false">
      <path d={icon.path} />
    </svg>
  )
}
