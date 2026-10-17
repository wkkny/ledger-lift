/** The Ledger Lift mark: a ruled page with an arrow lifting off it. Same drawing as build/icon-small.svg. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 128 128" aria-hidden="true">
      <rect width="128" height="128" rx="30" fill="#325f4c" />
      <rect x="32" y="24" width="64" height="80" rx="7" fill="#fff" />
      <g fill="none" stroke="#e0a030" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="50,50 64,35 78,50" />
        <line x1="64" y1="37" x2="64" y2="58" />
      </g>
      <g stroke="#325f4c" strokeWidth="7" strokeLinecap="round">
        <line x1="44" y1="76" x2="84" y2="76" />
        <line x1="44" y1="92" x2="70" y2="92" />
      </g>
    </svg>
  )
}
