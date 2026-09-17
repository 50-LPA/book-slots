import React, { useMemo } from 'react';
import { getWeekDays, parseISOToDate, formatDayHeader } from '../calendar';
import { slotMatchesCandidateKeys } from '../utils/candidateIdentity';

function hourLabel(hour24) {
  const isPM = hour24 >= 12;
  const hour12 = ((hour24 + 11) % 12) + 1;
  return `${hour12}:00 ${isPM ? 'PM' : 'AM'}`;
}


function getBestHourForEvent(event, hoursList) {
  if (
    !(event.__startDate instanceof Date) ||
    Number.isNaN(event.__startDate.getTime()) ||
    !(event.__endDate instanceof Date) ||
    Number.isNaN(event.__endDate.getTime())
  ) {
    return { bestHour: null, maxDur: 0 };
  }

  const slotStartMins = event.__startDate.getHours() * 60 + event.__startDate.getMinutes();
  const slotEndMins = event.__endDate.getHours() * 60 + event.__endDate.getMinutes();

  let bestHour = null;
  let maxDur = -1;

  for (const h of hoursList) {
    const hStart = h * 60;
    const hEnd = (h + 1) * 60;
    if (slotEndMins > hStart && slotStartMins < hEnd) {
      const cStart = Math.max(slotStartMins, hStart);
      const cEnd = Math.min(slotEndMins, hEnd);
      const dur = cEnd - cStart;
      if (dur > maxDur) {
        maxDur = dur;
        bestHour = h;
      }
    }
  }

  return { bestHour, maxDur };
}

function dayToYYYYMMDD(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function SlotCalendar({
  today: todayProp,
  weekStart,
  events,
  leaveDates = [],
  colorByReferrer = true,
  candidateIds = [],
  onEventClick,
  showSaturday = true,
  startHour = 11,
  endHour = 19,
}) {
  const today = todayProp ?? new Date();
  const todayString = today.toDateString();
  const days = useMemo(
    () => getWeekDays(weekStart, showSaturday ? 6 : 5),
    [weekStart, showSaturday],
  );
  const leaveSet = useMemo(() => new Set(leaveDates), [leaveDates]);

  const hours = useMemo(() => {
    const list = [];
    const s =
      typeof startHour === 'number' && !Number.isNaN(startHour)
        ? startHour
        : 11;
    const e =
      typeof endHour === 'number' && !Number.isNaN(endHour)
        ? endHour
        : 19;
    for (let h = s; h <= e; h += 1) {
      list.push(h);
    }
    return list.length > 0 ? list : [11, 12, 13, 14, 15, 16, 17, 18, 19];
  }, [startHour, endHour]);

  const eventsByDay = useMemo(() => {
    return days.map((day) => {
      const dayEvents = events
        .map((event) => {
          const start = parseISOToDate(event.start);
          const end = parseISOToDate(event.end);
          return {
            ...event,
            __startDate: start,
            __endDate: end,
            // Normalise candidateName from either top-level or extendedProps
            candidateName:
              (event.candidateName ||
                event.extendedProps?.candidateName ||
                '').trim(),
          };
        })
        .filter(
          (event) =>
            event.__startDate.toDateString() === day.toDateString(),
        );

      return dayEvents;
    });
  }, [events, days]);

  const todayIndex = days.findIndex(
    (d) => d.toDateString() === todayString,
  );
  const currentHour = today.getHours();
  const currentMinutes = today.getMinutes();
  const withinHoursRange =
    hours.length > 0 &&
    currentHour >= hours[0] &&
    currentHour <= hours[hours.length - 1];

  return (
    <div className="sb-slot-calendar relative bg-white">
      <div>
        <table
          className="w-full border-separate border-spacing-0 text-[11px] sm:text-[0.9rem]"
          style={{ tableLayout: 'fixed' }}
        >
          <colgroup>
            <col style={{ width: 'var(--sb-slot-time-w)' }} />
            {days.map((day) => (
              <col key={day.toISOString()} style={{ minWidth: 'var(--sb-slot-day-min-w)' }} />
            ))}
            <col style={{ width: 'var(--sb-slot-time-w)' }} />
          </colgroup>
          <thead>
            <tr>
              {/* Top-left corner: empty so time column and day headers align */}
              <th
                className="border border-slate-300 bg-slate-50 align-middle"
                style={{ height: 'var(--sb-slot-row-h)' }}
              />
              {days.map((day, dayIdx) => {
                const isToday = dayIdx === todayIndex;
                const isLeaveDay = leaveSet.has(dayToYYYYMMDD(day));
                const dayHeader = formatDayHeader(day);
                return (
                  <th
                    key={day.toISOString()}
                    className={`border px-1 py-1 sm:px-2 sm:py-2 text-center ${
                      isLeaveDay
                        ? 'bg-red-100 text-red-800 border-red-300'
                        : isToday
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        : 'bg-slate-50 text-slate-700 border-slate-300'
                    }`}
                    style={{ height: 'var(--sb-slot-row-h)' }}
                  >
                    {/* Mobile: match home calendar day + date format (e.g. Mon 24 Feb) */}
                    <div className="sm:hidden flex items-center justify-center leading-tight">
                      <span className="text-[10px] font-semibold text-slate-800">
                        {day.toLocaleDateString('en-GB', {
                          weekday: 'short',
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>
                    </div>
                    {/* Desktop / tablet: two-line compact header to avoid overlap when zoomed */}
                    <div className="hidden sm:block leading-tight">
                      <span className="block text-[14px] font-semibold uppercase tracking-[0.12em]">
                        {dayHeader.weekday}
                      </span>
                      <span className="block text-[14px] break-words">
                        {dayHeader.label.replace(`${dayHeader.weekday}, `, '')}
                      </span>
                    </div>
                  </th>
                );
              })}
              {/* Top-right corner: empty for right-side time column */}
              <th
                className="border border-slate-300 bg-slate-50 align-middle"
                style={{ height: 'var(--sb-slot-row-h)' }}
              />
            </tr>
          </thead>
          <tbody>
            {hours.map((hour) => {
              const isCurrentHour = hour === currentHour;
              const minuteOffset = (currentMinutes / 60) * 100;
              return (
              <tr key={hour}>
                {/* Time label cell - same row as the slot row */}
                <td
                  className="relative border border-slate-300 bg-slate-50 text-right pr-2 sm:pr-3 text-[10px] sm:text-[14px] font-medium text-slate-500 align-top overflow-visible"
                  style={{ height: 'var(--sb-slot-row-h)' }}
                >
                  {hourLabel(hour)}
                  <div className="absolute left-0 right-0 top-1/2 h-px bg-slate-300/40 pointer-events-none -translate-y-px" />
                </td>
                {days.map((day, dayIdx) => {
                  const isToday = dayIdx === todayIndex;
                  const isLeaveDay = leaveSet.has(dayToYYYYMMDD(day));
                  const dayEvents = eventsByDay[dayIdx] || [];
                  // Include any event whose time range overlaps this hour block
                  const hourStartMinutes = hour * 60;
                  const hourEndMinutes = (hour + 1) * 60;
                  const hourEvents =
                    dayEvents.filter((event) => {
                      if (!(event.__startDate instanceof Date) || !(event.__endDate instanceof Date)) {
                        return false;
                      }
                      if (Number.isNaN(event.__startDate.getTime()) || Number.isNaN(event.__endDate.getTime())) {
                        return false;
                      }
                      const slotStartMinutes =
                        event.__startDate.getHours() * 60 + event.__startDate.getMinutes();
                      const slotEndMinutes =
                        event.__endDate.getHours() * 60 + event.__endDate.getMinutes();
                      return slotEndMinutes > hourStartMinutes && slotStartMinutes < hourEndMinutes;
                    }) || [];

                  // Special case: hide the horizontal gap ONLY when a single event
                  // crosses the boundary between this hour and the next (for the row
                  // above) or between the previous hour and this one (for the row below).
                  const crossingDown = dayEvents.filter((event) => {
                    if (!(event.__startDate instanceof Date) || !(event.__endDate instanceof Date)) {
                      return false;
                    }
                    if (Number.isNaN(event.__startDate.getTime()) || Number.isNaN(event.__endDate.getTime())) {
                      return false;
                    }
                    const slotStartMinutes =
                      event.__startDate.getHours() * 60 + event.__startDate.getMinutes();
                    const slotEndMinutes =
                      event.__endDate.getHours() * 60 + event.__endDate.getMinutes();
                    // crosses this hour's bottom boundary (e.g. 2:30–3:30 crosses 3:00 for hour=14)
                    return slotStartMinutes < hourEndMinutes && slotEndMinutes > hourEndMinutes;
                  });

                  const crossingUp = dayEvents.filter((event) => {
                    if (!(event.__startDate instanceof Date) || !(event.__endDate instanceof Date)) {
                      return false;
                    }
                    if (Number.isNaN(event.__startDate.getTime()) || Number.isNaN(event.__endDate.getTime())) {
                      return false;
                    }
                    const slotStartMinutes =
                      event.__startDate.getHours() * 60 + event.__startDate.getMinutes();
                    const slotEndMinutes =
                      event.__endDate.getHours() * 60 + event.__endDate.getMinutes();
                    // crosses this hour's top boundary (e.g. 2:30–3:30 crosses 3:00 for hour=15)
                    return slotStartMinutes < hourStartMinutes && slotEndMinutes > hourStartMinutes;
                  });

                  const shouldHideBottomBorder =
                    crossingDown.length === 1 && hourEvents.length === 1;
                  const shouldHideTopBorder =
                    crossingUp.length === 1 && hourEvents.length === 1;

                  return (
                    <td
                      key={day.toISOString()}
                      className={`border align-top ${
                        isLeaveDay
                          ? 'bg-red-50 border-red-200'
                          : isToday
                          ? 'bg-emerald-50 border-emerald-200'
                          : 'bg-white border-slate-300'
                      }`}
                      style={{
                        height: 'var(--sb-slot-row-h)',
                        padding: 0,
                        // Only hide this cell's border when exactly one slot crosses
                        // this hour boundary (e.g. 2:30–3:30 over 3:00). For all
                        // other cases (multiple slots, or clean hour slots),
                        // keep the normal gray line so slots stay separated.
                        borderBottom: shouldHideBottomBorder ? 'none' : undefined,
                        borderTop: shouldHideTopBorder ? 'none' : undefined,
                      }}
                    >
                      <div className="relative h-full px-0 py-0">
                        {/* 1/2 hour faint line - only when there are no events in this cell */}
                        {hourEvents.length === 0 && (
                          <div className="absolute left-0 right-0 top-1/2 h-px bg-slate-300/40 pointer-events-none -translate-y-px" />
                        )}
                        {hourEvents.map((event, idx) => {
                          const isCandidateView = candidateIds.length > 0;
                          const isOwnSlot =
                            isCandidateView &&
                            slotMatchesCandidateKeys(event, candidateIds);

                          let mainLabel = '';
                          if (event.title === 'Slot Booked') {
                            mainLabel = 'Slot Booked';
                          } else if (isCandidateView) {
                            if (isOwnSlot) {
                              const name = (event.candidateName || '').trim();
                              mainLabel = name || 'You';
                            } else {
                              mainLabel = 'Slot Booked';
                            }
                          } else {
                            // Admin view: show candidate name
                            mainLabel = (event.candidateName || event.title || 'Slot Booked').trim();
                          }

                          // Compute vertical position and height within this hour cell
                          let topPct = 0;
                          let heightPct = 100;
                          let visibleDurationMinutes = 60;
                          let slotStartMinutesTotal = hourStartMinutes;
                          let slotEndMinutesTotal = hourEndMinutes;

                          if (
                            event.__startDate instanceof Date &&
                            !Number.isNaN(event.__startDate.getTime()) &&
                            event.__endDate instanceof Date &&
                            !Number.isNaN(event.__endDate.getTime())
                          ) {
                            slotStartMinutesTotal =
                              event.__startDate.getHours() * 60 + event.__startDate.getMinutes();
                            slotEndMinutesTotal =
                              event.__endDate.getHours() * 60 + event.__endDate.getMinutes();

                            const clippedStart = Math.max(slotStartMinutesTotal, hourStartMinutes);
                            const clippedEnd = Math.min(slotEndMinutesTotal, hourEndMinutes);
                            const visibleStartWithinHour = clippedStart - hourStartMinutes; // 0–60
                            visibleDurationMinutes = Math.max(
                              5,
                              clippedEnd - clippedStart,
                            );
                            topPct = Math.min(
                              100,
                              Math.max(0, (visibleStartWithinHour / 60) * 100),
                            );
                            heightPct = Math.min(
                              100 - topPct,
                              (visibleDurationMinutes / 60) * 100,
                            );
                          }

                          const { bestHour } = getBestHourForEvent(event, hours);
                          const isPrimary = hour === bestHour;

                          let sliceContent = null;
                          if (isPrimary) {
                            sliceContent = (
                              <div className="font-bold truncate text-[11px] sm:text-[13px] leading-tight">
                                {mainLabel}
                              </div>
                            );
                          }

                          let colorClass = 'bg-indigo-600';
                          if (isCandidateView) {
                            // Candidate dashboard: all slots same color
                            colorClass = 'bg-blue-600';
                          } else if ((!isCandidateView || isOwnSlot) && colorByReferrer) {
                            const ref = String(event.referredBy || '').toLowerCase();
                            if (ref.includes('anil')) {
                              colorClass = 'bg-blue-600';
                            } else if (ref.includes('viraj')) {
                              colorClass = 'bg-emerald-600';
                            } else if (ref.includes('nilesh')) {
                              colorClass = 'bg-red-600';
                            } else if (ref.includes('vishal')) {
                              colorClass = 'bg-orange-500';
                            }
                          }

                          const paddingClasses =
                            visibleDurationMinutes < 20
                              ? 'px-1 sm:px-1.5 py-0 flex flex-col justify-center'
                              : visibleDurationMinutes < 35
                              ? 'px-1.5 sm:px-2 py-0.5 flex flex-col justify-center'
                              : 'px-1.5 sm:px-2.5 py-1 sm:py-1.5 flex flex-col justify-start';

                          const eventKey = event.id ? `${event.id}-${hour}-${idx}` : `${event.title}-${hour}-${idx}`;
                          const eventCount = hourEvents.length;
                          return (
                            <div
                              key={eventKey}
                              className={`absolute inset-x-0.5 sm:inset-x-1 ${colorClass} text-white shadow-sm w-auto max-w-full overflow-hidden cursor-pointer hover:brightness-95 transition-all select-none rounded-none ${paddingClasses}`}
                              onClick={() => {
                                if (onEventClick) {
                                  onEventClick(event);
                                }
                              }}
                              style={{
                                top: `${topPct}%`,
                                height: `${heightPct}%`,
                                zIndex: isPrimary ? 2 : 1,
                              }}
                            >
                              {sliceContent}
                              {eventCount > 1 && idx < eventCount - 1 && (
                                <div className="absolute left-0 right-0 bottom-0 h-px bg-slate-300" />
                              )}
                            </div>
                          );
                        })}
                        {/* Today red line - only in today column and current hour row */}
                        {isToday && withinHoursRange && isCurrentHour && (
                          <div
                            className="pointer-events-none absolute left-0 right-0"
                            style={{ top: `${minuteOffset}%` }}
                          >
                            <div className="h-[1.5px] w-full bg-red-500" />
                          </div>
                        )}
                      </div>
                    </td>
                  );
                })}
                {/* Time label on right side */}
                <td
                  className="relative border border-slate-300 bg-slate-50 text-left pl-2 sm:pl-3 text-[10px] sm:text-[14px] font-medium text-slate-500 align-top overflow-visible"
                  style={{ height: 'var(--sb-slot-row-h)' }}
                >
                  {hourLabel(hour)}
                  <div className="absolute left-0 right-0 top-1/2 h-px bg-slate-300/40 pointer-events-none -translate-y-px" />
                </td>
              </tr>
            );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default React.memo(SlotCalendar);
