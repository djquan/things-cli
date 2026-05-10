const THINGS_DATE_YEAR_MASK = 0b111111111110000000000000000;
const THINGS_DATE_MONTH_MASK = 0b000000000001111000000000000;
const THINGS_DATE_DAY_MASK = 0b000000000000000111110000000;

const THINGS_TIME_HOUR_MASK = 0b1111100000000000000000000000000;
const THINGS_TIME_MINUTE_MASK = 0b0000011111100000000000000000000;

export function unixSecondsToIso(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return new Date(value * 1000).toISOString();
}

export function thingsDateToIsoDate(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  const year = (value & THINGS_DATE_YEAR_MASK) >> 16;
  const month = (value & THINGS_DATE_MONTH_MASK) >> 12;
  const day = (value & THINGS_DATE_DAY_MASK) >> 7;

  if (year < 1900 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day
    .toString()
    .padStart(2, "0")}`;
}

export function isoDateToThingsDate(value: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new Error(`Expected ISO date YYYY-MM-DD, got ${value}`);
  }

  const [, year, month, day] = match;
  return Number(year) << 16 | Number(month) << 12 | Number(day) << 7;
}

export function thingsTimeToClock(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  const hours = (value & THINGS_TIME_HOUR_MASK) >> 26;
  const minutes = (value & THINGS_TIME_MINUTE_MASK) >> 20;

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
}

export function clockToThingsTime(value: string): number {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) {
    throw new Error(`Expected clock time HH:MM, got ${value}`);
  }

  const [, hours, minutes] = match;
  return Number(hours) << 26 | Number(minutes) << 20;
}

export function todayIsoDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day
    .toString()
    .padStart(2, "0")}`;
}
