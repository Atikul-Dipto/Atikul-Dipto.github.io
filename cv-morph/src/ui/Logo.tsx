/** The mark: a page with its corner turning into light. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#46e6ff" />
          <stop offset="0.55" stopColor="#8f7cff" />
          <stop offset="1" stopColor="#ff6bcb" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" rx="24" fill="#0b1020" />
      <path d="M30 20h28l16 16v44H30z" fill="none" stroke="url(#logo-g)" strokeWidth="6" strokeLinejoin="round" />
      <path d="M40 48h24M40 60h24M40 72h14" stroke="url(#logo-g)" strokeWidth="6" strokeLinecap="round" />
    </svg>
  )
}

export function Brand() {
  return (
    <span className="brand-mark">
      <Logo />
      <span className="brand-word">
        CV <span className="grad-text">Morph</span>
      </span>
    </span>
  )
}
