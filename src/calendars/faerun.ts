import type { CalendarAdapter, CalendarMonth, IntercalaryDay } from '@/types/calendar.types'

const MONTHS: CalendarMonth[] = [
  { num: 1,  name: 'Hammer',    alias: 'Deepwinter',              days: 30 },
  { num: 2,  name: 'Alturiak',  alias: 'The Claw of Winter',      days: 30 },
  { num: 3,  name: 'Ches',      alias: 'The Claw of the Sunsets', days: 30 },
  { num: 4,  name: 'Tarsakh',   alias: 'The Claw of the Storms',  days: 30 },
  { num: 5,  name: 'Mirtul',    alias: 'The Melting',             days: 30 },
  { num: 6,  name: 'Kythorn',   alias: 'The Time of Flowers',     days: 30 },
  { num: 7,  name: 'Flamerule', alias: 'Summertide',              days: 30 },
  { num: 8,  name: 'Eleasias',  alias: 'Highsun',                 days: 30 },
  { num: 9,  name: 'Eleint',    alias: 'The Fading',              days: 30 },
  { num: 10, name: 'Marpenoth', alias: 'Leaffall',                days: 30 },
  { num: 11, name: 'Uktar',     alias: 'The Rotting',             days: 30 },
  { num: 12, name: 'Nightal',   alias: 'The Drawing Down',        days: 30 },
]

const INTERCALARY_DAYS: IntercalaryDay[] = [
  {
    name: 'Midwinter',
    afterMonth: 1,
    description: 'A mid-winter festival of introspection and planning for the year ahead.',
  },
  {
    name: 'Greengrass',
    afterMonth: 4,
    description: 'A spring celebration welcoming warmer weather and new beginnings.',
  },
  {
    name: 'Midsummer',
    afterMonth: 7,
    description: 'A summer festival of revelry, romance, and celebration.',
  },
  {
    name: 'Shieldmeet',
    afterMonth: 7,
    description: 'A leap day occurring every four years, immediately after Midsummer. A time for solemn oaths and great deeds.',
    isLeapOnly: true,
  },
  {
    name: 'Highharvestide',
    afterMonth: 9,
    description: 'An autumn harvest festival of feasting and thanks.',
  },
  {
    name: 'Feast of the Moon',
    afterMonth: 11,
    description: 'A solemn festival to honour the dead and remember those who have passed.',
  },
]

export const faerunAdapter: CalendarAdapter = {
  id: 'faerun',
  name: 'Faerûn (Calendar of Harptos)',
  epochName: 'DR',
  defaultYear: 1495,
  months: MONTHS,
  intercalaryDays: INTERCALARY_DAYS,

  isLeapYear: (year: number) => year % 4 === 0,

  formatDate: (year, month, day, festivalDay) => {
    if (festivalDay) {
      return `${festivalDay}, ${year} DR`
    }
    if (month !== null && day !== null) {
      const m = MONTHS.find(mo => mo.num === month)
      const monthName = m ? m.name : `Month ${month}`
      const tenday = Math.ceil(day / 10)
      const dayInTenday = day - (tenday - 1) * 10
      return `Day ${dayInTenday} of Tenday ${tenday}, ${monthName}, ${year} DR`
    }
    return `${year} DR`
  },
}
