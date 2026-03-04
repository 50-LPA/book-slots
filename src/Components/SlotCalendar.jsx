import React, { useMemo } from 'react';
import { getWeekDays, parseISOToDate, formatDayHeader } from '../calendar';

// Time slots from 11:00 AM to 7:00 PM (inclusive)
const HOURS = [11, 12, 13, 14, 15, 16, 17, 18, 19];
const ROW_HEIGHT = '4rem'; // h-16 = 4rem, same for header and every slot row

function hourLabel(hour24) {
  const isPM = hour24 >= 12;
  const hour12 = ((hour24 + 11) % 12) + 1;
  return `${hour12}:00 ${isPM ? 'PM' : 'AM'}`;
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
}) {
  const today = todayProp ?? new Date();
  const todayString = today.toDateString();
  const days = useMemo(() => getWeekDays(weekStart, 6), [weekStart]);
  const leaveSet = useMemo(() => new Set(leaveDates), [leaveDates]);

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
    currentHour >= HOURS[0] && currentHour <= HOURS[HOURS.length - 1];

  return (
    <div className="relative bg-white">
      <div>
        <table
          className="w-full border-collapse text-[0.9rem]"
          style={{ tableLayout: 'fixed' }}
        >
          <colgroup>
            <col className="w-24" />
            {days.map((day) => (
              <col key={day.toISOString()} className="min-w-[120px] sm:min-w-[100px]" />
            ))}
            <col className="w-24" />
          </colgroup>
          <thead>
            <tr>
              {/* Top-left corner: empty so time column and day headers align */}
              <th
                className="border border-slate-300 bg-slate-50 align-middle"
                style={{ height: ROW_HEIGHT }}
              />
              {days.map((day, dayIdx) => {
                const isToday = dayIdx === todayIndex;
                const isLeaveDay = leaveSet.has(dayToYYYYMMDD(day));
                const dayHeader = formatDayHeader(day);
                return (
                  <th
                    key={day.toISOString()}
                    className={`border px-2 py-2 text-center ${
                      isLeaveDay
                        ? 'bg-red-100 text-red-800 border-red-300'
                        : isToday
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        : 'bg-slate-50 text-slate-700 border-slate-300'
                    }`}
                    style={{ height: ROW_HEIGHT }}
                  >
                    {/* Mobile: stack weekday and date to avoid mixing/overlap */}
                    <div className="sm:hidden flex flex-col items-center leading-tight">
                      <span className="text-[14px] font-semibold uppercase tracking-[0.12em]">
                        {dayHeader.weekday}
                      </span>
                      <span className="text-[14px] text-slate-700">
                        {dayHeader.label.replace(`${dayHeader.weekday}, `, '')}
                      </span>
                    </div>
                    {/* Desktop / tablet: keep single-line compact header */}
                    <div className="hidden sm:block">
                      <span className="text-[14px] font-semibold uppercase tracking-[0.16em] whitespace-nowrap">
                        {dayHeader.weekday}{' '}
                        {dayHeader.label.replace(`${dayHeader.weekday}, `, '')}
                      </span>
                    </div>
                  </th>
                );
              })}
              {/* Top-right corner: empty for right-side time column */}
              <th
                className="border border-slate-300 bg-slate-50 align-middle"
                style={{ height: ROW_HEIGHT }}
              />
            </tr>
          </thead>
          <tbody>
            {HOURS.map((hour) => {
              const isCurrentHour = hour === currentHour;
              const minuteOffset = (currentMinutes / 60) * 100;
              return (
              <tr key={hour}>
                {/* Time label cell - same row as the slot row */}
                <td
                  className="relative border border-slate-300 bg-slate-50 text-right pr-3 text-[14px] font-medium text-slate-500 align-top overflow-visible"
                  style={{ height: ROW_HEIGHT }}
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
                      style={{ height: ROW_HEIGHT, padding: 0 }}
                    >
                      <div className="relative h-full px-0 py-0">
                        {/* 1/2 hour faint line */}
                        <div className="absolute left-0 right-0 top-1/2 h-px bg-slate-300/40 pointer-events-none -translate-y-px" />
                        {hourEvents.map((event, idx) => {
                          const isCandidateView = candidateIds.length > 0;
                          const isOwnSlot =
                            isCandidateView &&
                            event.candidateId &&
                            candidateIds.includes(event.candidateId);

                          let mainLabel = event.title;
                          let timeLabel = '';

                          // Candidate calendar:
                          // - Own slots: "<Name or You>" on first line, time on second line
                          // - Other slots: "Slot Booked" on first line, time on second line (no other name)
                          if (isCandidateView && event.__startDate && event.__endDate) {
                            const startLabel = event.__startDate.toLocaleTimeString('en-US', {
                              hour: '2-digit',
                              minute: '2-digit',
                              hour12: true,
                            });
                            const endLabel = event.__endDate.toLocaleTimeString('en-US', {
                              hour: '2-digit',
                              minute: '2-digit',
                              hour12: true,
                            });
                            timeLabel = `${startLabel} - ${endLabel}`;

                            if (isOwnSlot) {
                              const name = (event.candidateName || '').trim();
                              mainLabel = name || 'You';
                            } else {
                              mainLabel = 'Slot Booked';
                            }
                          } else if (isCandidateView && !isOwnSlot) {
                            // Fallback when we don't have parsed dates: no name, generic label
                            mainLabel = 'Slot Booked';
                          }

                          if (!isCandidateView) {
                            mainLabel = event.title;
                            timeLabel = '';
                          }

                          // Compute vertical position and height within this hour cell
                          let topPct = 0;
                          let heightPct = 100;
                          if (
                            event.__startDate instanceof Date &&
                            !Number.isNaN(event.__startDate.getTime()) &&
                            event.__endDate instanceof Date &&
                            !Number.isNaN(event.__endDate.getTime())
                          ) {
                            const slotStartMinutesTotal =
                              event.__startDate.getHours() * 60 + event.__startDate.getMinutes();
                            const slotEndMinutesTotal =
                              event.__endDate.getHours() * 60 + event.__endDate.getMinutes();
                            const clippedStart = Math.max(slotStartMinutesTotal, hourStartMinutes);
                            const clippedEnd = Math.min(slotEndMinutesTotal, hourEndMinutes);
                            const visibleStartWithinHour = clippedStart - hourStartMinutes; // 0–60
                            const visibleDurationMinutes = Math.max(
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
                          return (
                            <div
                              key={`${event.title}-${idx}`}
                              className={`absolute inset-x-1 rounded-lg border border-amber-200 ${colorClass} px-2 py-1.5 sm:px-3 sm:py-2 text-[14px] text-white shadow-sm w-auto max-w-full break-words overflow-hidden`}
                              onClick={() => {
                                if (onEventClick) {
                                  onEventClick(event);
                                }
                              }}
                              style={{ top: `${topPct}%`, height: `${heightPct}%` }}
                            >
                              <div className="text-[14px] font-semibold">
                                {mainLabel}
                              </div>
                              {timeLabel && (
                                <div className="text-[14px] opacity-80">
                                  {timeLabel}
                                </div>
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
                  className="relative border border-slate-300 bg-slate-50 text-left pl-3 text-[14px] font-medium text-slate-500 align-top overflow-visible"
                  style={{ height: ROW_HEIGHT }}
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

export default SlotCalendar;
