import React from 'react';

function CalendarToolbar({
  today,
  rangeLabel,
  onPrevWeek,
  onNextWeek,
  onToday,
  onOpenMobileCalendar,
  onReload,
}) {
  return (
    <div className="relative flex flex-col sm:flex-row md:flex-col lg:flex-row sm:items-center md:items-center lg:items-center sm:justify-between md:justify-center lg:justify-between bg-white px-1 sm:px-3 md:px-4 py-1.5 sm:py-2 md:py-3 gap-1 sm:gap-2 md:gap-3 min-h-12 sm:min-h-14">
      {/* Left Navigation Controls (next only) – desktop/tablet only */}
      <div className="hidden sm:flex md:flex lg:flex items-center gap-2 flex-shrink-0 z-10 justify-start md:justify-center w-auto order-3 sm:order-none">
        <button
          type="button"
          onClick={
            onNextWeek
              ? onNextWeek
              : (e) => {
                  e.preventDefault();
                }
          }
          className="btn-circle"
        >
          <span className="sr-only">Next week</span>
          <i className="fa-solid fa-chevron-right text-sm" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onToday}
          className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-700 shadow-sm transition hover:bg-slate-50 whitespace-nowrap flex-shrink-0"
        >
          today
        </button>
      </div>

      {/* Center - Date Range with reload */}
      {/* Desktop/tablet: absolute center; iPad (md-lg): static for stacked layout */}
      <div className="hidden sm:flex md:relative md:left-0 md:translate-x-0 lg:absolute lg:left-1/2 lg:-translate-x-1/2 items-center gap-1 md:justify-center z-20">
        <span className="pointer-events-none text-[10px] sm:text-xs md:text-sm font-semibold text-slate-800 whitespace-nowrap">
          {rangeLabel}
        </span>
        {onReload && (
          <button
            type="button"
            onClick={onReload}
            className="btn-circle pointer-events-auto"
            aria-label="Reload calendar"
          >
            <i className="fa-solid fa-rotate-right text-sm" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Mobile: date, next week, today, reload all in one line */}
      <div className="flex sm:hidden flex-1 items-center justify-center gap-2 order-2 sm:order-none z-20">
        <button
          type="button"
          onClick={
            onNextWeek
              ? onNextWeek
              : (e) => {
                  e.preventDefault();
                }
          }
          className="btn-circle"
        >
          <span className="sr-only">Next week</span>
          <i className="fa-solid fa-chevron-right text-sm" aria-hidden="true" />
        </button>
        <span className="text-[10px] font-semibold text-slate-800 whitespace-nowrap">
          {rangeLabel}
        </span>
        <button
          type="button"
          onClick={onToday}
          className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-700 shadow-sm transition hover:bg-slate-50 whitespace-nowrap flex-shrink-0"
        >
          today
        </button>
        {onReload && (
          <button
            type="button"
            onClick={onReload}
            className="btn-circle"
            aria-label="Reload calendar"
          >
            <i className="fa-solid fa-rotate-right text-sm" aria-hidden="true" />
          </button>
        )}
      </div>

    </div>
  );
}

export default React.memo(CalendarToolbar);

