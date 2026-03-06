import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import scrollGridPlugin from '@fullcalendar/scrollgrid';
import '../assets/css/calendar-responsive.css';
import Header from '../Components/Header';
import { subscribeToApprovedSlots, getLeaves } from '../firebase/slotsService';
import { toSafeDate, isSameDay } from '../utils/dateUtils';

const Calender = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [todayEventCount, setTodayEventCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState(new Date());
  const [refreshKey, setRefreshKey] = useState(0);
  const navigate = useNavigate();

  // Subscribe to approved slots (real-time, same logic as other calendars)
  useEffect(() => {
    setIsLoading(true);
    const unsubscribe = subscribeToApprovedSlots((approvedEvents) => {
      setEvents(approvedEvents);
      setIsLoading(false);
      setLastRefreshed(new Date());
    });
    return () => unsubscribe();
  }, [refreshKey]);

  // Load leaves
  useEffect(() => {
    getLeaves().then((list) => {
      setLeaves(
        list.map((l) => ({
          id: l.id,
          date: l.date,
        })),
      );
    });
  }, []);

  useEffect(() => {
    setTodayEventCount(getTodayEventCount(events));
  }, [events]);

  const formatDate = (date) => {
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  const getTodayEventCount = (evts) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return evts.filter((event) => {
      const eventDate = new Date(event.start);
      eventDate.setHours(0, 0, 0, 0);
      return eventDate.getTime() === today.getTime();
    }).length;
  };

  const formatEventDateTime = (start, end) => {
    const startTime = new Date(start).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
    const endTime = new Date(end).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
    const date = new Date(start).toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'short',
    });
    return `${date}, ${startTime} - ${endTime}`;
  };

  const isLeaveDay = useCallback(
    (date) => {
      if (!date) return false;

      return leaves.some((leave) => {
        const leaveDate = toSafeDate(leave.date);
        const checkDate = toSafeDate(date);
        return isSameDay(leaveDate, checkDate);
      });
    },
    [leaves],
  );

  const handleManualRefresh = () => {
    setRefreshKey((k) => k + 1);
  };

  const handleLoginClick = (e) => {
    e.preventDefault();
    navigate('/login');
  };

  // Map slot events to FullCalendar format (with extendedProps)
  // and restrict to current week + next week (same logic as reference)
  const fullCalendarEvents = useMemo(() => {
    if (!Array.isArray(events) || events.length === 0) return [];

    const startOfWeek = new Date();
    startOfWeek.setHours(0, 0, 0, 0);
    // Align to Monday as start of week
    const day = startOfWeek.getDay(); // 0 (Sun) - 6 (Sat)
    const diffToMonday = (day + 6) % 7; // 0 if Monday
    startOfWeek.setDate(startOfWeek.getDate() - diffToMonday);

    const endOfNextWeek = new Date(startOfWeek);
    endOfNextWeek.setDate(startOfWeek.getDate() + 13); // this week + next week

    const inRange = events.filter((ev) => {
      if (!ev.start || !ev.end) return false;
      const eventDate = new Date(ev.start);
      return eventDate >= startOfWeek && eventDate <= endOfNextWeek;
    });

    return inRange.map((ev) => ({
      id: ev.id,
      title: ev.title || 'Slot Booked',
      start: ev.start,
      end: ev.end,
      extendedProps: {
        company: ev.extendedProps?.company || '',
        technology: ev.extendedProps?.technology || '',
        candidateName: ev.extendedProps?.candidateName || '',
        status: ev.extendedProps?.status || '',
        interviewRound: ev.extendedProps?.interviewRound || '',
      },
    }));
  }, [events]);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 antialiased">
      <Header fullWidth />
      <main className="w-full mt-2 px-4 pb-6 sm:pb-10">
        <div className="min-h-[70vh] overflow-hidden rounded-lg sm:rounded-2xl bg-white shadow-sm px-4 py-6">
          <div className="flex justify-between items-center mb-2">
            <div className="flex items-center gap-2">
              <h5 className="text-lg font-semibold mb-0 text-purple-600">Slot Booking Calendar</h5>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleManualRefresh}
                className="text-purple-600 hover:text-purple-800 text-sm font-medium"
              >
                <i className="fa-solid fa-rotate-right text-sm mr-1" aria-hidden="true" />
                Refresh
              </button>
              <button
                type="button"
                onClick={handleLoginClick}
                className="rounded-lg bg-purple-600 px-4 py-1.5 text-sm font-semibold text-white shadow hover:bg-purple-700"
              >
                Login
              </button>
            </div>
          </div>
          <div className="row">
            <div className="col-12">
              <div className="card shadow-sm border border-slate-200">
                <div className="card-header flex justify-between items-center bg-white border-b border-slate-200 px-4 py-3">
                  <div className="flex items-center" style={{ width: '33%' }}>
                    <i className="fa-regular fa-calendar-days text-2xl text-purple-600 me-2" aria-hidden="true" />
                    <h5 className="text-base font-semibold mb-0">Today: {formatDate(currentDate)}</h5>
                  </div>
                  <div className="flex items-center justify-center" style={{ width: '33%' }}>
                    <a
                      href="https://virajkadam.in"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="no-underline text-slate-800 font-semibold"
                    >
                      virajkadam.in
                    </a>
                  </div>
                  <div className="flex items-center justify-end" style={{ width: '33%' }}>
                    <div className="flex items-center me-3">
                      <i className="fa-solid fa-calendar-check text-2xl text-emerald-600 me-2" aria-hidden="true" />
                      <h5 className="text-base font-semibold mb-0">
                        Today&apos;s Slots: <span className="text-emerald-600">{todayEventCount}</span>
                      </h5>
                    </div>
                  </div>
                </div>
                <div className="m-0 p-0">
                  <div className="calendar-container position-relative">
                    {isLoading && (
                      <div
                        className="absolute inset-0 flex justify-center items-center bg-white/80 z-[1000]"
                      >
                        <div className="animate-spin rounded-full h-10 w-10 border-2 border-purple-600 border-t-transparent" role="status">
                          <span className="sr-only">Loading...</span>
                        </div>
                      </div>
                    )}
                    <FullCalendar
                      plugins={[timeGridPlugin, interactionPlugin, scrollGridPlugin]}
                      initialView="timeGridWeek"
                      height="auto"
                      expandRows
                      nowIndicator
                      slotMinTime="11:00:00"
                      slotMaxTime="20:00:00"
                      hiddenDays={[0]}
                      headerToolbar={{
                        left: 'next today',
                        center: 'title',
                        right: '',
                      }}
                      events={fullCalendarEvents}
                      height="auto"
                      contentHeight="auto"
                      aspectRatio={1.8}
                      expandRows
                      slotDuration="00:30:00"
                      allDaySlot={false}
                      dayHeaderFormat={{ weekday: 'long' }}
                      handleWindowResize
                      dayMinWidth={100}
                      slotLabelFormat={{
                        hour: 'numeric',
                        minute: '2-digit',
                        meridiem: 'short',
                      }}
                      eventTimeFormat={{
                        hour: '2-digit',
                        minute: '2-digit',
                        meridiem: 'short',
                      }}
                      displayEventTime
                      displayEventEnd
                      eventOverlap={false}
                      selectOverlap={false}
                      eventDisplay="block"
                      eventColor="#3788d8"
                      eventTextColor="#ffffff"
                      eventDidMount={(info) => {
                        const { company, technology, candidateName } = info.event.extendedProps;
                        const eventEl = info.el;
                        const titleEl = eventEl.querySelector('.fc-event-title');
                        const startTime = new Date(info.event.start);
                        const endTime = new Date(info.event.end);
                        const dateTimeStr = formatEventDateTime(info.event.start, info.event.end);
                        const eventDuration = (endTime - startTime) / (60 * 1000);
                        let last20MinPercentage = ((eventDuration - 20) / eventDuration) * 100;
                        if (last20MinPercentage < 0) last20MinPercentage = 0;

                        eventEl.style.background = `linear-gradient(to bottom, #3788d8 ${last20MinPercentage}%, #3788d8 ${last20MinPercentage}%)`;
                        eventEl.style.borderColor = '#FFA500';
                        eventEl.style.color = '#ffffff';

                        if (titleEl) {
                          titleEl.innerHTML = `
                            <div class="event-content" style="font-size: 12px; line-height: 1.2;">
                              <div class="event-details">
                                <div style="font-weight:bold;">Slot Booked</div>
                                <div style="font-size: 10px; margin-top: 2px;">${dateTimeStr}</div>
                              </div>
                            </div>
                          `;
                        }
                      }}
                      eventContent={(arg) => ({
                        html: `
                          <div class="fc-event-main-frame">
                            <div class="fc-event-time"></div>
                            <div class="fc-event-title-container">
                              <div class="fc-event-title"></div>
                            </div>
                          </div>
                        `,
                      })}
                      dayCellClassNames={(arg) => {
                        const classes = [];
                        if (arg.date.getDay() === 0) classes.push('sunday-cell');
                        if (isLeaveDay(arg.date)) classes.push('leave-cell');
                        return classes;
                      }}
                      dayHeaderClassNames={(arg) => {
                        const classes = [];
                        if (arg.date.getDay() === 0) classes.push('sunday-header');
                        if (isLeaveDay(arg.date)) classes.push('leave-header');
                        return classes;
                      }}
                      slotLabelClassNames={(arg) => {
                        const classes = [];
                        if (arg.date.getDay() === 0) classes.push('sunday-slot');
                        if (isLeaveDay(arg.date)) classes.push('leave-slot');
                        return classes;
                      }}
                      views={{
                        timeGridWeek: {
                          titleFormat: {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          },
                          dayHeaderFormat: {
                            weekday: window.innerWidth < 768 ? 'short' : 'long',
                            day: 'numeric',
                            month: 'short',
                          },
                          slotLabelFormat: {
                            hour: 'numeric',
                            minute: '2-digit',
                            meridiem: window.innerWidth < 768 ? 'short' : 'long',
                          },
                          dayHeaderContent: (args) => {
                            const day = args.date.getDay();
                            const isLeave = isLeaveDay(args.date);
                            const options = {
                              weekday: window.innerWidth < 768 ? 'short' : 'long',
                              day: 'numeric',
                              month: 'short',
                            };
                            const element = document.createElement('span');
                            element.innerHTML = args.date.toLocaleDateString('en-US', options);
                            if (day === 0 || isLeave) {
                              element.style.color = '#dc3545';
                              element.style.fontWeight = 'bold';
                            }
                            if (isLeave) {
                              element.style.backgroundColor = '#fff1f0';
                              element.style.padding = '4px 8px';
                              element.style.borderRadius = '4px';
                              element.style.display = 'inline-block';
                              element.style.width = '100%';
                              element.style.textAlign = 'center';
                            }
                            return { domNodes: [element] };
                          },
                        },
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Calender;
