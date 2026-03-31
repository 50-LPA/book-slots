import React, { useMemo, useState, useEffect } from 'react';
import Header from '../Components/Header';
import CalendarToolbar from '../Components/CalendarToolbar';
import SlotCalendar from '../Components/SlotCalendar';
import { getWeekStart, getWeekEndExclusive, formatWeekRangeLabel, getWeekDays, parseISOToDate, isSameDay } from '../calendar';
import { subscribeToApprovedSlots, getLeaves } from '../firebase/slotsService';

export default function CalendarPage() {
  const [today, setToday] = useState(() => new Date());
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [showMobileCalendar, setShowMobileCalendar] = useState(false);
  const [events, setEvents] = useState([]);
  const [leaveDates, setLeaveDates] = useState([]);
  const [calendarRefreshKey, setCalendarRefreshKey] = useState(0);

  useEffect(() => {
    const unsubscribe = subscribeToApprovedSlots((approvedEvents) => setEvents(approvedEvents));
    return () => unsubscribe();
  }, [calendarRefreshKey]);

  useEffect(() => {
    getLeaves().then((list) => setLeaveDates(list.map((l) => l.date).filter(Boolean)));
  }, [calendarRefreshKey]);

  useEffect(() => {
    const syncToToday = () => {
      const now = new Date();
      setToday(now);
    };
    // Keep week navigation stable: do a one-time sync.
    syncToToday();
    return undefined;
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

  // Public home calendar should only show generic label "Slot Booked"
  const displayWeekEvents = useMemo(
    () =>
      weekEvents.map((event) => ({
        ...event,
        title: 'Slot Booked',
      })),
    [weekEvents],
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
    <div className="min-h-screen bg-slate-100 text-slate-900 antialiased">
      <Header fullWidth />
      <main className="w-full mt-2 px-4 pb-6 sm:pb-10">
        <div className="min-h-[70vh] overflow-hidden rounded-lg sm:rounded-2xl bg-white shadow-sm border border-slate-300 px-4 py-6">
          <CalendarToolbar
            today={today}
            rangeLabel={rangeLabel}
            onNextWeek={handleNextWeek}
            onToday={handleToday}
            todaysSlotsCount={todaysSlotsCount}
            weeklySlotsCount={weeklySlotsCount}
            onReload={() => setCalendarRefreshKey((k) => k + 1)}
          />
          <div className="mt-4 overflow-x-auto">
            <div className="min-w-[720px]">
              <SlotCalendar
                today={today}
                weekStart={weekStart}
                events={displayWeekEvents}
                leaveDates={leaveDates}
                colorByReferrer={false}
              />
            </div>
          </div>
        </div>
      </main>
      {showMobileCalendar && (
        <div className="fixed inset-0 z-50 bg-white">
          <div className="h-full flex flex-col">
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="text-sm font-semibold">Select date</h3>
              <button
                type="button"
                onClick={() => setShowMobileCalendar(false)}
                className="px-3 py-1 rounded bg-gray-100"
              >
                Close
              </button>
            </div>
            <div className="flex-1 p-6 flex items-center justify-center">
              <input type="date" className="w-full max-w-md border border-gray-200 rounded-md p-3 text-lg" />
            </div>
            <div className="p-4 border-t">
              <button
                type="button"
                onClick={() => setShowMobileCalendar(false)}
                className="w-full inline-flex items-center justify-center px-4 py-2 rounded bg-purple-600 text-white"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
