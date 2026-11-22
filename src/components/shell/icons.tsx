import type { IconName } from "@/lib/nav";

const PATHS: Record<IconName, React.ReactNode> = {
  today: (
    <>
      <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" />
    </>
  ),
  collection: (
    <>
      <rect x="3.5" y="6" width="11" height="14" rx="1.6" />
      <path d="M8 3.5h10.9a1.6 1.6 0 0 1 1.6 1.6V17" />
    </>
  ),
  add: (
    <>
      <path d="M12 5v14M5 12h14" />
    </>
  ),
  decks: (
    <>
      <rect x="4" y="8" width="16" height="12" rx="2" />
      <path d="M6.5 5h11M9 2.5h6" />
    </>
  ),
  deck: (
    <>
      <rect x="6" y="3.5" width="12" height="17" rx="1.8" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2.2" />
      <circle cx="9" cy="17" r="2.2" />
    </>
  ),
  more: (
    <>
      <circle cx="5.5" cy="12" r="1.3" />
      <circle cx="12" cy="12" r="1.3" />
      <circle cx="18.5" cy="12" r="1.3" />
    </>
  ),
  back: (
    <>
      <path d="M14.5 5.5 8 12l6.5 6.5" />
    </>
  ),
};

export function Icon({ name, className = "" }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shell-icon ${className}`}
    >
      {PATHS[name]}
    </svg>
  );
}

/** The MTG Deck Tutor mark: three cards, the one you went looking for raised in the middle. Its colours follow the theme. */
export function Mark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="shell-mark">
      <defs>
        <linearGradient id="tutor-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: "var(--mark-a, #8b5cf6)" }} />
          <stop offset="1" style={{ stopColor: "var(--mark-b, #ec4899)" }} />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#tutor-mark)" />
      <g fill="#ffffff">
        <rect x="5.6" y="12.6" width="6.4" height="13.2" rx="1.4" />
        <rect x="12.8" y="6.4" width="6.4" height="19.4" rx="1.4" />
        <rect x="20" y="12.6" width="6.4" height="13.2" rx="1.4" />
      </g>
      <circle cx="16" cy="10.4" r="1.4" style={{ fill: "var(--mark-gem, #c026d3)" }} />
    </svg>
  );
}
