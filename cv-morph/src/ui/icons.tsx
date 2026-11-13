import type { ReactNode, SVGProps } from 'react'

// Line icons, drawn here rather than pulled from a library: two dozen shapes
// don't justify a dependency.
const icon = (paths: ReactNode) =>
  function Icon(props: SVGProps<SVGSVGElement>) {
    return (
      <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
        {paths}
      </svg>
    )
  }

export const IconGrip = icon(
  <>
    <circle cx="9" cy="6" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="15" cy="6" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="9" cy="12" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="15" cy="12" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="9" cy="18" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="15" cy="18" r="1.2" fill="currentColor" stroke="none" />
  </>,
)
export const IconPlus = icon(<path d="M12 5v14M5 12h14" />)
export const IconX = icon(<path d="M6 6l12 12M18 6L6 18" />)
export const IconCheck = icon(<path d="M5 12.5l4.5 4.5L19 7.5" />)
export const IconTrash = icon(<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 12.5h9l1-12.5M10 11v5M14 11v5" />)
export const IconEye = icon(
  <>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="2.8" />
  </>,
)
export const IconEyeOff = icon(<path d="M4 4l16 16M10 5.8A9 9 0 0112 5.5c6 0 9.5 6.5 9.5 6.5a15 15 0 01-2.9 3.6M6.2 7.2A15 15 0 002.5 12S6 18.5 12 18.5a9 9 0 003.8-.8M9.9 9.9a3 3 0 004.2 4.2" />)
export const IconUndo = icon(<path d="M8 7L4 11l4 4M4 11h10a6 6 0 010 12h-2" transform="translate(0 -3)" />)
export const IconRedo = icon(<path d="M16 7l4 4-4 4M20 11H10a6 6 0 000 12h2" transform="translate(0 -3)" />)
export const IconDownload = icon(<path d="M12 4v11M7.5 11l4.5 4.5 4.5-4.5M5 19.5h14" />)
export const IconUpload = icon(<path d="M12 16V5M7.5 9L12 4.5 16.5 9M5 19.5h14" />)
export const IconFile = icon(<path d="M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5" />)
export const IconImage = icon(
  <>
    <rect x="3.5" y="5" width="17" height="14" rx="2" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="M4 17l5-4.5 3.5 3 3-2.5 4.5 4" />
  </>,
)
export const IconWand = icon(<path d="M5 19L16 8M14 6l4 4M18.5 3v3M17 4.5h3M6 4v2.5M4.8 5.2h2.5M19.5 14v3M18 15.5h3" />)
export const IconLayout = icon(
  <>
    <rect x="3.5" y="4" width="17" height="16" rx="2" />
    <path d="M10 4v16M10 10h10.5" />
  </>,
)
export const IconPalette = icon(
  <>
    <path d="M12 3.5a8.5 8.5 0 100 17c1.4 0 2-1 2-2 0-1.5-1-1.8-1-3 0-1 .8-1.5 2-1.5h1.5a4 4 0 004-4c0-3.6-3.8-6.5-8.5-6.5z" />
    <circle cx="8" cy="10" r="1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="7.5" r="1" fill="currentColor" stroke="none" />
    <circle cx="16" cy="10" r="1" fill="currentColor" stroke="none" />
  </>,
)
export const IconTarget = icon(
  <>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="4.5" />
    <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
  </>,
)
export const IconChevronDown = icon(<path d="M6 9.5l6 6 6-6" />)
export const IconChevronRight = icon(<path d="M9.5 6l6 6-6 6" />)
export const IconChevronLeft = icon(<path d="M14.5 6l-6 6 6 6" />)
export const IconArrowRight = icon(<path d="M4.5 12h15M13.5 6l6 6-6 6" />)
export const IconCopy = icon(
  <>
    <rect x="8.5" y="8.5" width="11" height="12" rx="2" />
    <path d="M15.5 8.5V5.5a2 2 0 00-2-2h-7a2 2 0 00-2 2v8a2 2 0 002 2h2" />
  </>,
)
export const IconSparkle = icon(<path d="M12 3.5l1.8 5.2 5.2 1.8-5.2 1.8L12 17.5l-1.8-5.2L5 10.5l5.2-1.8zM18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />)
export const IconZoomIn = icon(
  <>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="M15.5 15.5L20 20M10.5 8v5M8 10.5h5" />
  </>,
)
export const IconZoomOut = icon(
  <>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="M15.5 15.5L20 20M8 10.5h5" />
  </>,
)
export const IconPhone = icon(
  <>
    <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
    <path d="M11 18.5h2" />
  </>,
)
export const IconAlert = icon(<path d="M12 4l9 16H3zM12 10v4.5M12 17.5v.1" />)
export const IconInfo = icon(
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5.5M12 7.5v.1" />
  </>,
)
export const IconPrinter = icon(<path d="M7 8V4h10v4M6.5 17H4.5v-7a2 2 0 012-2h11a2 2 0 012 2v7h-2M7 14h10v6H7z" />)
export const IconLock = icon(
  <>
    <rect x="5" y="10.5" width="14" height="10" rx="2" />
    <path d="M8 10.5V7.5a4 4 0 018 0v3" />
  </>,
)
export const IconPencil = icon(<path d="M4 20l1-4.5L16.5 4l3.5 3.5L8.5 19zM14 6.5l3.5 3.5" />)
export const IconList = icon(<path d="M8.5 6.5H20M8.5 12H20M8.5 17.5H20M4.5 6.5v.1M4.5 12v.1M4.5 17.5v.1" />)
export const IconColumns = icon(
  <>
    <rect x="3.5" y="4" width="17" height="16" rx="2" />
    <path d="M12 4v16" />
  </>,
)
export const IconType = icon(<path d="M5 7V5h14v2M12 5v14M9 19h6" />)
export const IconRefresh = icon(<path d="M19.5 12a7.5 7.5 0 11-2.2-5.3M19.5 4.5v4h-4" />)
export const IconHome = icon(<path d="M4 11l8-7 8 7M6.5 9.5V20h11V9.5" />)
export const IconSearch = icon(
  <>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="M15.5 15.5L20 20" />
  </>,
)
export const IconText = icon(<path d="M5 6.5h14M5 11h14M5 15.5h9" />)
export const IconShare = icon(<path d="M12 15V4M8 7.5l4-4 4 4M6 11.5H5v9h14v-9h-1" />)
export const IconUser = icon(
  <>
    <circle cx="12" cy="8.5" r="4" />
    <path d="M4.5 20.5c1-4 4-5.5 7.5-5.5s6.5 1.5 7.5 5.5" />
  </>,
)
export const IconArrowUp = icon(<path d="M12 19.5v-15M6 10.5l6-6 6 6" />)
export const IconArrowDown = icon(<path d="M12 4.5v15M6 13.5l6 6 6-6" />)
