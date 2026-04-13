import React from 'react';

const base = process.env.PUBLIC_URL || '';

/** Dummy placement counts — illustrative only (matches mockup style: logo + “placed N”). */
const MARQUEE_ITEMS = [
  { id: 'tcs', logoSrc: `${base}/placed-marquee/tcs.png`, alt: 'TCS', placed: 113 },
  { id: 'infosys', logoSrc: `${base}/placed-marquee/infosys.png`, alt: 'Infosys', placed: 87 },
  { id: 'capgemini', logoSrc: `${base}/placed-marquee/capgemini.png`, alt: 'Capgemini', placed: 64 },
];

function LogoPlacedCard({ item }) {
  return (
    <div className="flex w-[132px] shrink-0 flex-col items-center justify-center rounded-md border border-slate-300 bg-white px-2 py-2.5 shadow-sm sm:w-[148px] sm:px-3 sm:py-3">
      <img
        src={item.logoSrc}
        alt={`${item.alt} logo`}
        className="h-8 w-auto max-w-[120px] object-contain sm:h-9"
        loading="lazy"
      />
      <p className="mt-2 text-center text-[11px] font-medium tracking-wide text-slate-800 sm:text-xs">
        placed <span className="font-bold tabular-nums">{item.placed}</span>
      </p>
    </div>
  );
}

/**
 * Marquee tab + scrolling row of partner logos with “placed N” under each (home calendar mockup).
 */
export default function PlacedCandidatesMarquee() {
  const loop = [...MARQUEE_ITEMS, ...MARQUEE_ITEMS];

  return (
    <section className="mb-3 sm:mb-4" aria-label="Placement highlights">
      <div className="overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm">
        {/* Tab strip — “Marquee” as active tab */}
        <div className="flex items-end gap-0 border-b border-slate-200 bg-slate-50/80 px-2 pt-1">
          <div
            className="rounded-t-md border border-b-0 border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-900 shadow-[0_-1px_0_0_white] sm:text-sm sm:px-4 sm:py-2"
            role="tab"
            aria-selected="true"
          >
            Marquee
          </div>
        </div>

        <div className="sb-placed-marquee-fade relative overflow-hidden bg-slate-50 py-3 sm:py-4">
          <div className="sb-placed-marquee-track flex w-max items-center gap-4 px-4 sm:gap-6 sm:px-6">
            {loop.map((item, idx) => (
              <LogoPlacedCard key={`${item.id}-${idx}`} item={item} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
