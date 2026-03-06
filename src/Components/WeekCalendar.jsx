import React, { useMemo, useState, useEffect } from 'react';
import {
  getWeekStart,
  getWeekDays,
  getWeekEndExclusive,
  formatWeekRangeLabel,
  parseISOToDate,
  isSameDay,
} from '../calendar';
import CalendarToolbar from './CalendarToolbar';
import SlotCalendar from './SlotCalendar';
import { subscribeToApprovedSlots, getLeaves } from '../firebase/slotsService';

// candidateIds: when provided (candidate dashboard), other slots show "Slot Booked" + blue; own slots show name + referrer color.
// onEventClick: optional handler when clicking an event (admin dashboard popup, etc.)
function WeekCalendar({ candidateIds = [], onEventClick }) {
  const today = useMemo(() => new Date(), []);
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [events, setEvents] = useState([]);
  const [leaveDates, setLeaveDates] = useState([]);

  useEffect(() => {
    const unsubscribe = subscribeToApprovedSlots((evts) => setEvents(evts));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    getLeaves().then((list) => setLeaveDates(list.map((l) => l.date).filter(Boolean)));
  }, []);

  const weekEnd = useMemo(() => getWeekDays(weekStart, 6)[5], [weekStart]);
  const weekEndExclusive = useMemo(() => getWeekEndExclusive(weekStart, 6), [weekStart]);

  const rangeLabel = useMemo(
    () => formatWeekRangeLabel(weekStart, weekEnd),
    [weekStart, weekEnd],
  );
  const todaysSlotsCount = useMemo(
    () =>
      events.filter((event) => {
        const eventDate = parseISOToDate(event.start);
        return isSameDay(eventDate, today);
      }).length,
    [today, events],
  );

  const weeklySlotsCount = useMemo(
    () =>
      events.filter((event) => {
        const eventDate = parseISOToDate(event.start);
        return eventDate >= weekStart && eventDate < weekEndExclusive;
      }).length,
    [weekStart, weekEndExclusive, events],
  );

  const weekEvents = useMemo(
    () =>
      events.filter((event) => {
        const eventDate = parseISOToDate(event.start);
        return eventDate >= weekStart && eventDate < weekEndExclusive;
      }),
    [weekStart, weekEndExclusive, events],
  );

  const handleToday = () => setWeekStart(getWeekStart(new Date()));

  const handleNextWeek = () => {
    setWeekStart((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() + 7);
      return next;
    });
  };

  return (
    <>
      <div className="mt-3">
        <CalendarToolbar
          today={today}
          rangeLabel={rangeLabel}
          onNextWeek={handleNextWeek}
          onToday={handleToday}
          todaysSlotsCount={todaysSlotsCount}
          weeklySlotsCount={weeklySlotsCount}
        />
      </div>
      <div className="mt-4 overflow-x-auto">
        <div className="min-w-[360px] sm:min-w-[720px]">
          <SlotCalendar
            today={today}
            weekStart={weekStart}
            events={weekEvents}
            leaveDates={leaveDates}
            candidateIds={candidateIds}
            onEventClick={onEventClick}
          />
        </div>
      </div>
    </>
  );
}

export default WeekCalendar;
