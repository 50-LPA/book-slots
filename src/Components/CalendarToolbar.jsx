import React from 'react';

function CalendarToolbar({
  today,
  rangeLabel,
  onPrevWeek,
  onNextWeek,
  onToday,
  todaysSlotsCount,
  weeklySlotsCount,
  onOpenMobileCalendar,
  onReload,
}) {
  return (
    <div className="relative flex flex-col sm:flex-row md:flex-col lg:flex-row sm:items-center md:items-center lg:items-center sm:justify-between md:justify-center lg:justify-between border-b border-slate-200 bg-white px-1 sm:px-3 md:px-4 py-1.5 sm:py-2 md:py-3 gap-1 sm:gap-2 md:gap-3 min-h-12 sm:min-h-14">
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
          className="inline-flex h-7 md:h-8 w-7 md:w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 flex-shrink-0"
        >
          <span className="sr-only">Next week</span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="h-3.5 md:h-4 w-3.5 md:w-4"
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      </div>

      {/* Center - Date Range with reload */}
      {/* Desktop/tablet: absolute center; iPad (md-lg): static for stacked layout */}
      <div className="hidden sm:flex md:relative md:left-0 md:translate-x-0 lg:absolute lg:left-1/2 lg:-translate-x-1/2 items-center gap-1 md:justify-center">
        <span className="pointer-events-none text-[10px] sm:text-xs md:text-sm font-semibold text-slate-800 whitespace-nowrap">
          {rangeLabel}
        </span>
        {onReload && (
          <button
            type="button"
            onClick={onReload}
            className="inline-flex h-6 w-6 sm:h-7 sm:w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 pointer-events-auto"
            aria-label="Reload calendar"
          >
            <i className="fa-solid fa-rotate-right text-xs" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Mobile: date, next week, today, reload all in one line */}
      <div className="flex sm:hidden flex-1 items-center justify-center gap-2 order-2 sm:order-none">
        <button
          type="button"
          onClick={
            onNextWeek
              ? onNextWeek
              : (e) => {
                  e.preventDefault();
                }
          }
          className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 flex-shrink-0"
        >
          <span className="sr-only">Next week</span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="h-3 w-3"
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
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
            className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50"
            aria-label="Reload calendar"
          >
            <i className="fa-solid fa-rotate-right text-xs" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Right - Today & Weekly Slots summary */}
      <div className="flex flex-row items-center justify-center sm:justify-end md:justify-center lg:justify-end gap-3 sm:gap-6 flex-shrink-0 pr-2 z-10 text-[10px] sm:text-xs md:text-sm text-slate-700 mt-2 sm:mt-0 text-center sm:text-left md:text-center lg:text-left order-1 sm:order-none">
        <div className="flex flex-row items-baseline gap-1 whitespace-nowrap">
          <span className="font-semibold text-slate-900">
            {todaysSlotsCount}
          </span>
          <span className="leading-tight mt-[1px] sm:mt-0">Total Slots Today</span>
        </div>
        <span className="hidden sm:inline-block h-3 w-px bg-slate-300" />
        <div className="flex flex-row items-baseline gap-1 whitespace-nowrap">
          <span className="font-semibold text-slate-900">
            {weeklySlotsCount}
          </span>
          <span className="leading-tight mt-[1px] sm:mt-0">Total Slots This Week</span>
        </div>
      </div>
    </div>
  );
}

export default CalendarToolbar;

