import React, { useState, useEffect } from 'react';
import MARQUEE_ITEMS from '../data/marqueeCompanies';

function LogoPlacedCard({ item, loadImages }) {
  const [logoFailed, setLogoFailed] = useState(false);

  return (
    <div className="flex w-[220px] shrink-0 flex-col items-center rounded-md border border-slate-300 bg-white shadow-sm sm:w-[260px] overflow-hidden">
      <div className="w-full">
        {loadImages && !logoFailed ? (
          <img
            src={item.logoSrc}
            alt={`${item.alt} logo`}
            className="h-16 w-full object-contain bg-white sm:h-20 transition-opacity duration-300"
            loading="lazy"
            decoding="async"
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
 * Defers logo image downloading until after the calendar and slots are rendered.
 */
export default function PlacedCandidatesMarquee({ className = '', speedSeconds = 15, delayLoad = true }) {
  const [loadImages, setLoadImages] = useState(!delayLoad);

  useEffect(() => {
    if (!delayLoad || loadImages) return undefined;

    // Defer loading logo images until the calendar and slots are fully rendered
    let id;
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      id = window.requestIdleCallback(() => setLoadImages(true), { timeout: 1200 });
      return () => window.cancelIdleCallback(id);
    } else {
      id = setTimeout(() => setLoadImages(true), 600);
      return () => clearTimeout(id);
    }
  }, [delayLoad, loadImages]);

  // Duplicate once for seamless 0% -> -50% looping.
  const loop = [...MARQUEE_ITEMS, ...MARQUEE_ITEMS];

  return (
    <section
      className={`relative w-full mb-2 sm:mb-3 ${className}`.trim()}
      aria-label="Placement highlights"
    >
      <div className="sb-placed-marquee-fade relative w-full overflow-hidden py-0">
        <div
          className="sb-placed-marquee-track flex w-max items-center gap-3 px-0 sm:gap-5 sm:px-0"
          style={{ animationDuration: `${speedSeconds}s` }}
        >
          {loop.map((item, idx) => (
            <LogoPlacedCard key={`${item.id}-${idx}`} item={item} loadImages={loadImages} />
          ))}
        </div>
      </div>
    </section>
  );
}
