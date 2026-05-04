import React, { useState } from 'react';
import MARQUEE_ITEMS from '../data/marqueeCompanies';

function LogoPlacedCard({ item }) {
  const [logoSrc, setLogoSrc] = useState(item.logoSrc);
  const [logoFailed, setLogoFailed] = useState(false);

  return (
    <div className="flex w-[220px] shrink-0 flex-col items-center rounded-md border border-slate-300 bg-white shadow-sm sm:w-[260px] overflow-hidden">
      <div className="w-full">
        {!logoFailed ? (
          <img
            src={logoSrc}
            alt={`${item.alt} logo`}
            className="h-16 w-full object-contain bg-white sm:h-20"
            loading="lazy"
            onError={() => {
              // Logos are local first; when missing, show company name badge.
              setLogoFailed(true);
            }}
          />
        ) : (
          <div className="h-16 w-full sm:h-20 flex items-center justify-center bg-slate-100 px-2 text-center text-[10px] font-semibold text-slate-700">
            {item.alt}
          </div>
        )}
      </div>
      <p className="mt-2 px-2 pb-2 text-center text-[11px] font-medium tracking-wide text-slate-800 sm:text-xs">
        Placed {item.placed}
      </p>
    </div>
  );
}

/**
 * Marquee tab + scrolling row of partner logos with “placed N” under each (home calendar mockup).
 */
export default function PlacedCandidatesMarquee({ className = '', speedSeconds = 15 }) {
  // Duplicate once for seamless 0% -> -50% looping.
  const loop = [...MARQUEE_ITEMS, ...MARQUEE_ITEMS];

  return (
    <section
      className={`relative w-full mb-2 sm:mb-3 ${className}`.trim()}
      aria-label="Placement highlights"
    >
      <div className="sb-placed-marquee-fade relative w-full overflow-hidden py-2">
        <div
          className="sb-placed-marquee-track flex w-max items-center gap-3 px-0 sm:gap-5 sm:px-0"
          style={{ animationDuration: `${speedSeconds}s` }}
        >
          {loop.map((item, idx) => (
            <LogoPlacedCard key={`${item.id}-${idx}`} item={item} />
          ))}
        </div>
      </div>
    </section>
  );
}
