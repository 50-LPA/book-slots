import React from 'react';
import { render, screen } from '@testing-library/react';
import SlotCalendar from './SlotCalendar';
import { getWeekStart } from '../calendar';

describe('SlotCalendar random-time slot display', () => {
  const baseDate = new Date('2026-03-02T12:00:00Z'); // A Monday
  const weekStart = getWeekStart(baseDate);

  test('Admin dashboard view: displays only bold candidate name without time for 5:45 PM to 6:45 PM slot', () => {
    // 5:45 PM = 17:45, 6:45 PM = 18:45
    const monday545PM = new Date(weekStart);
    monday545PM.setHours(17, 45, 0, 0);

    const monday645PM = new Date(weekStart);
    monday645PM.setHours(18, 45, 0, 0);

    const events = [
      {
        id: 'slot-1',
        title: 'Rahul Sharma',
        candidateName: 'Rahul Sharma',
        start: monday545PM.toISOString(),
        end: monday645PM.toISOString(),
      },
    ];

    render(
      <SlotCalendar
        weekStart={weekStart}
        events={events}
        candidateIds={[]} // Admin view: empty candidateIds
        startHour={11}
        endHour={19}
      />
    );

    // Candidate name must be visible and bold, and container must be rectangular (rounded-none) without tooltip
    const nameEl = screen.getByText('Rahul Sharma');
    expect(nameEl).toBeInTheDocument();
    expect(nameEl).toHaveClass('font-bold');
    const container = nameEl.closest('.rounded-none');
    expect(container).toBeInTheDocument();
    expect(container).not.toHaveAttribute('title');

    // Time must NOT be shown in the slot
    expect(screen.queryByText('5:45 PM - 6:45 PM')).not.toBeInTheDocument();
    expect(screen.queryByText('5:45 PM')).not.toBeInTheDocument();
  });

  test('Public / other calendar view: displays only bold "Slot Booked" without time for 5:45 PM to 6:45 PM slot', () => {
    const monday545PM = new Date(weekStart);
    monday545PM.setHours(17, 45, 0, 0);

    const monday645PM = new Date(weekStart);
    monday645PM.setHours(18, 45, 0, 0);

    const events = [
      {
        id: 'slot-2',
        title: 'Slot Booked',
        start: monday545PM.toISOString(),
        end: monday645PM.toISOString(),
      },
    ];

    render(
      <SlotCalendar
        weekStart={weekStart}
        events={events}
        candidateIds={['other-cand-id']} // Candidate view: other slot
        startHour={11}
        endHour={19}
      />
    );

    // "Slot Booked" must be visible and bold
    const slotEl = screen.getByText('Slot Booked');
    expect(slotEl).toBeInTheDocument();
    expect(slotEl).toHaveClass('font-bold');

    // Time must NOT be shown in the slot
    expect(screen.queryByText('5:45 PM - 6:45 PM')).not.toBeInTheDocument();
    expect(screen.queryByText('5:45 PM')).not.toBeInTheDocument();
  });

  test('Slot crossing boundary with 30 min duration (5:45 PM to 6:15 PM) displays only bold name without time', () => {
    const monday545PM = new Date(weekStart);
    monday545PM.setHours(17, 45, 0, 0);

    const monday615PM = new Date(weekStart);
    monday615PM.setHours(18, 15, 0, 0);

    const events = [
      {
        id: 'slot-3',
        title: 'Anjali Verma',
        candidateName: 'Anjali Verma',
        start: monday545PM.toISOString(),
        end: monday615PM.toISOString(),
      },
    ];

    render(
      <SlotCalendar
        weekStart={weekStart}
        events={events}
        candidateIds={[]} // Admin view
        startHour={11}
        endHour={19}
      />
    );

    // Name must be present and bold
    const nameEl = screen.getByText('Anjali Verma');
    expect(nameEl).toBeInTheDocument();
    expect(nameEl).toHaveClass('font-bold');

    // Time must NOT be shown
    expect(screen.queryByText('5:45 PM - 6:15 PM')).not.toBeInTheDocument();
  });

  test('Calendar column headers display date format without dashes (e.g. 2 Mar 2026)', () => {
    render(
      <SlotCalendar
        weekStart={weekStart}
        events={[]}
        candidateIds={[]}
        startHour={11}
        endHour={19}
      />
    );

    // Monday header should be "2 Mar 2026" without dashes
    const dateHeader = screen.getByText('2 Mar 2026');
    expect(dateHeader).toBeInTheDocument();
    expect(screen.queryByText('02-Mar-2026')).not.toBeInTheDocument();
    expect(screen.queryByText('2-Mar-2026')).not.toBeInTheDocument();
  });
});

