
export function FallbackHeroGraphic() {
  return (
    <div className="relative w-full h-80 sm:h-96 flex items-center justify-center overflow-hidden rounded-2xl border border-border bg-surface/50 p-6">
      <div className="absolute inset-0 bg-radial-glow opacity-30 pointer-events-none" />
      <svg
        className="w-64 h-64 sm:w-80 sm:h-80 text-accent animate-pulse"
        viewBox="0 0 200 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <circle cx="100" cy="100" r="85" stroke="currentColor" strokeWidth="3" opacity="0.4" />
        <circle cx="100" cy="100" r="65" stroke="currentColor" strokeWidth="2" strokeDasharray="4 6" opacity="0.6" />
        <line x1="30" y1="100" x2="170" y2="100" stroke="currentColor" strokeWidth="2" strokeDasharray="3 4" opacity="0.8" />
        
        {/* Incoming particles */}
        <circle cx="85" cy="55" r="5" fill="var(--color-accent-2)" opacity="0.7" />
        <circle cx="115" cy="45" r="7" fill="var(--color-accent)" />
        <circle cx="135" cy="65" r="4" fill="var(--color-danger)" opacity="0.6" />
        
        {/* Sifted winning particle */}
        <circle cx="100" cy="100" r="6" fill="var(--color-accent)" />
        <circle cx="100" cy="145" r="9" fill="var(--color-success)" />
        <path d="M96 145L99 148L105 142" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}
