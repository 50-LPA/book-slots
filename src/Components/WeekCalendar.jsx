import React, { useMemo, useState, useEffect } from 'react';
import {
  getWeekStart,
  getWeekDays,
  getWeekEndExclusive,
  formatWeekRangeLabel,
  parseISOToDate,
} from '../calendar';
import CalendarToolbar from './CalendarToolbar';
import SlotCalendar from './SlotCalendar';
import {
  subscribeToApprovedSlots,
  subscribeToPublicSlots,
  slotOwnEvents,
  getLeaves,
  subscribeToSlotSettings,
  getStoredSlotSettings,
} from '../firebase/slotsService';

// candidateIds: when provided (candidate dashboard), other slots show "Slot Booked" + blue; own slots show name + referrer color.
// live (admin): every slot with its details, kept live. Otherwise only time + status come from the server and
// ownSlots (the candidate's own events, already loaded) put back the details of their own slots.
// onEventClick: optional handler when clicking an event (admin dashboard popup, etc.)
function WeekCalendar({ candidateIds = [], ownSlots = [], live = false, onEventClick, settings: settingsProp }) {
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
    const subscribe = live ? subscribeToApprovedSlots : subscribeToPublicSlots;
    const unsubscribe = subscribe(
      weekStart,
      getWeekEndExclusive(weekStart, dayCount),
      (evts) => setEvents(evts),
    );
    return () => unsubscribe();
  }, [weekStart, dayCount, live]);

  // Own approved slots in full, by id, over the public "Slot Booked" entries.
  const shownEvents = useMemo(() => {
    if (live || !ownSlots.length) return events;
    const own = slotOwnEvents(ownSlots);
    return events.map((e) => own.get(e.id) || e);
  }, [events, ownSlots, live]);

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


  const weekEvents = useMemo(
    () =>
      shownEvents.filter((event) => {
        const eventDate = parseISOToDate(event.start);
        return eventDate >= weekStart && eventDate < weekEndExclusive;
      }),
    [weekStart, weekEndExclusive, shownEvents],
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
