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
    <div className="flex w-[132px] shrink-0 flex-col items-center justify-center rounded-md border border-slate-300 bg-white shadow-sm sm:w-[148px] overflow-hidden">
      <img
        src={item.logoSrc}
        alt={`${item.alt} logo`}
        className="h-16 w-full object-cover sm:h-20"
        loading="lazy"
      />
      <p className="mt-2 text-center text-[11px] font-medium tracking-wide text-slate-800 sm:text-xs">
        Placed {item.placed}
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
      <div className="sb-placed-marquee-fade relative overflow-hidden py-2">
        <div className="sb-placed-marquee-track flex w-max items-center gap-4 px-0 sm:gap-6 sm:px-0">
          {loop.map((item, idx) => (
            <LogoPlacedCard key={`${item.id}-${idx}`} item={item} />
          ))}
        </div>
      </div>
    </section>
  );
}
