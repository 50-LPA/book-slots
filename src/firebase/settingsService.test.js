import {
  DEFAULT_SLOT_SETTINGS,
  parseHourFromLabel,
  formatHourToLabel,
  formatHourTo24,
  normalizeSlotSettings,
  getStoredSlotSettings,
} from './settingsService';

describe('Admin Slot Booking Settings Service', () => {
  test('default settings have Saturday Active/Show, Start Time 11:00 AM, End Time 7:00 PM', () => {
    expect(DEFAULT_SLOT_SETTINGS.showSaturday).toBe(true);
    expect(DEFAULT_SLOT_SETTINGS.slotStartTime).toBe('11:00 AM');
    expect(DEFAULT_SLOT_SETTINGS.slotEndTime).toBe('07:00 PM');
    expect(DEFAULT_SLOT_SETTINGS.startHour).toBe(11);
    expect(DEFAULT_SLOT_SETTINGS.endHour).toBe(19);
    expect(DEFAULT_SLOT_SETTINGS.startTime).toBe('11:00');
    expect(DEFAULT_SLOT_SETTINGS.endTime).toBe('19:00');
  });

  test('parseHourFromLabel parses 12h AM/PM and 24h strings properly', () => {
    expect(parseHourFromLabel('11:00 AM')).toBe(11);
    expect(parseHourFromLabel('7:00 PM')).toBe(19);
    expect(parseHourFromLabel('07:00 PM')).toBe(19);
    expect(parseHourFromLabel('9:00 PM')).toBe(21);
    expect(parseHourFromLabel('09:00 PM')).toBe(21);
    expect(parseHourFromLabel('12:00 PM')).toBe(12);
    expect(parseHourFromLabel('12:00 AM')).toBe(0);
    expect(parseHourFromLabel('11:00')).toBe(11);
    expect(parseHourFromLabel('19:00')).toBe(19);
    expect(parseHourFromLabel('21:00')).toBe(21);
  });

  test('formatHourToLabel formats 24h numbers to standard 12h labels', () => {
    expect(formatHourToLabel(11)).toBe('11:00 AM');
    expect(formatHourToLabel(12)).toBe('12:00 PM');
    expect(formatHourToLabel(19)).toBe('07:00 PM');
    expect(formatHourToLabel(21)).toBe('09:00 PM');
  });

  test('formatHourTo24 formats 24h numbers to HH:00 strings', () => {
    expect(formatHourTo24(11)).toBe('11:00');
    expect(formatHourTo24(19)).toBe('19:00');
    expect(formatHourTo24(21)).toBe('21:00');
  });

  test('normalizeSlotSettings correctly reflects admin changing End Time to 9:00 PM', () => {
    const custom = {
      showSaturday: true,
      slotStartTime: '11:00 AM',
      slotEndTime: '09:00 PM',
    };
    const normalized = normalizeSlotSettings(custom);
    expect(normalized.showSaturday).toBe(true);
    expect(normalized.slotStartTime).toBe('11:00 AM');
    expect(normalized.startHour).toBe(11);
    expect(normalized.slotEndTime).toBe('09:00 PM');
    expect(normalized.endHour).toBe(21);
    expect(normalized.endTime).toBe('21:00');
  });

  test('normalizeSlotSettings correctly reflects admin disabling Saturday toggle', () => {
    const custom = {
      showSaturday: false,
      slotStartTime: '11:00 AM',
      slotEndTime: '07:00 PM',
    };
    const normalized = normalizeSlotSettings(custom);
    expect(normalized.showSaturday).toBe(false);
  });

  test('normalizeSlotSettings handles invalid or inverted times gracefully', () => {
    // endHour <= startHour: should adjust endHour
    const invalid = {
      slotStartTime: '05:00 PM',
      slotEndTime: '01:00 PM',
    };
    const normalized = normalizeSlotSettings(invalid);
    expect(normalized.startHour).toBe(17);
    expect(normalized.endHour).toBe(18);
  });

  test('normalizeSlotSettings correctly handles numeric startHour and endHour changes', () => {
    const custom = {
      ...DEFAULT_SLOT_SETTINGS,
      startHour: 9,
      endHour: 21,
    };
    const normalized = normalizeSlotSettings(custom);
    expect(normalized.startHour).toBe(9);
    expect(normalized.slotStartTime).toBe('09:00 AM');
    expect(normalized.startTime).toBe('09:00');
    expect(normalized.endHour).toBe(21);
    expect(normalized.slotEndTime).toBe('09:00 PM');
    expect(normalized.endTime).toBe('21:00');
  });
});
