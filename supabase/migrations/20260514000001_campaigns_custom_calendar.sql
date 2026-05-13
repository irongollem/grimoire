-- Migration: campaigns_custom_calendar
-- Adds a per-campaign custom calendar definition (SettingCalendarDef JSON)
-- used when campaigns.calendar_id = 'custom'.

alter table campaigns
  add column if not exists custom_calendar jsonb;

comment on column campaigns.custom_calendar is
  'When calendar_id = ''custom'', this holds a SettingCalendarDef JSON (months, intercalary days, week style, leap rule, etc.) used to build a runtime CalendarAdapter for this campaign.';
