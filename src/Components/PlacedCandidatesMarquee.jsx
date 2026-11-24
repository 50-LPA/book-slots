import React, { useState, useEffect } from 'react';
import MARQUEE_ITEMS from '../data/marqueeCompanies';

function LogoPlacedCard({ item, loadImages }) {
  const [logoFailed, setLogoFailed] = useState(false);

  return (
    <div className="flex w-[220px] shrink-0 flex-col overflow-hidden rounded-md border border-slate-300 bg-white shadow-sm sm:w-[260px]">
      {/* Same frame and inset for every logo, so wide and tall logos read the same size. */}
      <div className="flex h-16 w-full items-center justify-center px-5 py-3 sm:h-20">
        {loadImages && item.logoSrc && !logoFailed ? (
          <img
            src={item.logoSrc}
            alt={`${item.alt} logo`}
            className="h-full w-full object-contain transition-opacity duration-300"
            loading="lazy"
            decoding="async"
            onError={() => {
              // Logos are local first; when missing, show company name badge.
              setLogoFailed(true);
            }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-center text-base font-extrabold leading-tight tracking-tight text-slate-800 sm:text-lg">
            {item.alt}
          </div>
        )}
      </div>
      <p className="border-t border-slate-200 bg-slate-50 px-3 py-1.5 text-center text-[11px] font-medium tracking-wide text-slate-800 sm:text-xs">
        Placed {item.placed}
      </p>
    </div>
  );
}

/**
 * Marquee tab + scrolling row of partner logos with “placed N” under each (home calendar mockup).
 * Defers logo image downloading until after the calendar and slots are rendered.
 */
// ~1.5 s per company keeps the same scroll pace however many companies are listed.
export default function PlacedCandidatesMarquee({ className = '', speedSeconds = MARQUEE_ITEMS.length * 1.5, delayLoad = true }) {
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
      className={`relative mb-2 w-full ${className}`.trim()}
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
