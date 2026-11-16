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
import {
  subscribeToApprovedSlots,
  getLeaves,
  subscribeToSlotSettings,
  getStoredSlotSettings,
} from '../firebase/slotsService';

// candidateIds: when provided (candidate dashboard), other slots show "Slot Booked" + blue; own slots show name + referrer color.
// onEventClick: optional handler when clicking an event (admin dashboard popup, etc.)
function WeekCalendar({ candidateIds = [], onEventClick, settings: settingsProp }) {
  const today = useMemo(() => new Date(), []);
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [events, setEvents] = useState([]);
  const [leaveDates, setLeaveDates] = useState([]);
  const [settings, setSettings] = useState(() => settingsProp || getStoredSlotSettings());

  useEffect(() => {
    if (settingsProp) {
      setSettings(settingsProp);
      return;
    }
    const unsubscribe = subscribeToSlotSettings((s) => setSettings(s));
    return () => unsubscribe();
  }, [settingsProp]);

  const activeSettings = settingsProp || settings;
  const showSaturday = activeSettings?.showSaturday !== false;
  const startHour = activeSettings?.startHour ?? 11;
  const endHour = activeSettings?.endHour ?? 19;
  const dayCount = showSaturday ? 6 : 5;

  useEffect(() => {
    const unsubscribe = subscribeToApprovedSlots((evts) => setEvents(evts));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    getLeaves().then((list) => setLeaveDates(list.map((l) => l.date).filter(Boolean)));
  }, []);

  const weekEnd = useMemo(
    () => getWeekDays(weekStart, dayCount)[dayCount - 1],
    [weekStart, dayCount],
  );
  const weekEndExclusive = useMemo(
    () => getWeekEndExclusive(weekStart, dayCount),
    [weekStart, dayCount],
  );

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

  const handleToday = React.useCallback(() => setWeekStart(getWeekStart(new Date())), []);

  const handleNextWeek = React.useCallback(() => {
    setWeekStart((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() + 7);
      return next;
    });
  }, []);

  return (
    <>
      <div className="mt-0">
        <CalendarToolbar
          today={today}
          rangeLabel={rangeLabel}
          onNextWeek={handleNextWeek}
          onToday={handleToday}
          todaysSlotsCount={todaysSlotsCount}
          weeklySlotsCount={weeklySlotsCount}
        />
      </div>
      <div className="mt-0 overflow-x-auto">
        <div className="min-w-[720px]">
          <SlotCalendar
            today={today}
            weekStart={weekStart}
            events={weekEvents}
            leaveDates={leaveDates}
            candidateIds={candidateIds}
            onEventClick={onEventClick}
            showSaturday={showSaturday}
            startHour={startHour}
            endHour={endHour}
          />
        </div>
      </div>
    </>
  );
}

export default React.memo(WeekCalendar);
