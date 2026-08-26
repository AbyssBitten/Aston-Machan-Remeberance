export function Crown({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 32" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="crownGold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffeec6" />
          <stop offset="55%" stopColor="#f4cd86" />
          <stop offset="100%" stopColor="#c79143" />
        </linearGradient>
      </defs>
      <path
        d="M3 26 6 8l8.5 8L24 3l9.5 13L42 8l3 18Z"
        fill="url(#crownGold)"
        stroke="rgba(255,240,205,0.7)"
        strokeWidth="0.8"
      />
      <rect x="3" y="27" width="42" height="3" rx="1.5" fill="url(#crownGold)" opacity="0.9" />
      <circle cx="24" cy="20" r="2" fill="#fff6e2" opacity="0.9" />
    </svg>
  );
}

export function Ribbon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 14" className={className} aria-hidden="true">
      <path
        d="M2 7c18-9 34 9 52 0s34-9 64 0"
        fill="none"
        stroke="rgba(244,205,134,0.55)"
        strokeWidth="1"
        strokeLinecap="round"
      />
      <path
        d="M2 11c18-9 34 9 52 0s34-9 64 0"
        fill="none"
        stroke="rgba(127,215,208,0.35)"
        strokeWidth="1"
        strokeLinecap="round"
      />
    </svg>
  );
}
