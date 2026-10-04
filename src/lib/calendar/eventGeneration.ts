/**
 * Pure helpers for "Draft with AI" on the calendar event form: the grounding
 * lines sent to the model, and the validation of what comes back. Model output
 * is untrusted, so the result is laundered here before it touches the form.
 */

export const CALENDAR_AI_EVENT_TYPES = ["festival", "world", "campaign"] as const;
export type CalendarAiEventType = (typeof CALENDAR_AI_EVENT_TYPES)[number];

const MAX_LINES = 12;
const MAX_LINE_CHARS = 400;
const MAX_NAMED = 10;

interface NamedDeity {
  name: string;
  domains?: string[] | null;
  portfolio?: string | null;
  pantheon_id?: string | null;
}

export interface CalendarConstraintInput {
  dateLabel: string;
  eventType: string;
  deities: readonly NamedDeity[];
  pantheons: readonly { id?: string; name: string }[];
  factions: readonly { name: string; faction_type?: string | null }[];
}

function clip(line: string): string {
  return line.length <= MAX_LINE_CHARS ? line : `${line.slice(0, MAX_LINE_CHARS - 1).trimEnd()}…`;
}

/** The date as the DM reads it: "3 Mirtul, 1492" or "Midwinter, 1492". */
export function formatEventDateLabel(args: {
  year: number;
  month: number | null;
  day: number | null;
  festivalDay: string | null;
  monthName: string | null;
}): string {
  const { year, month, day, festivalDay, monthName } = args;
  if (festivalDay) return `${festivalDay}, ${year}`;
  if (month !== null && day !== null && monthName) return `${day} ${monthName}, ${year}`;
  return String(year);
}

function kindWanted(eventType: string): string {
  if (eventType === "festival") return "festival (a recurring observance)";
  if (eventType === "world") return "world event (a historical or world happening)";
  return "festival or world event, whichever fits the date best";
}

export function buildCalendarEventConstraints(input: CalendarConstraintInput): string[] {
  const lines: string[] = [];
  if (input.dateLabel.trim()) lines.push(`Date: ${input.dateLabel.trim()}`);
  lines.push(`Kind wanted: ${kindWanted(input.eventType)}`);

  const deities = input.deities.slice(0, MAX_NAMED).map((d) => {
    const detail = d.domains?.length ? d.domains.slice(0, 3).join(", ") : d.portfolio?.trim();
    return detail ? `${d.name} (${detail})` : d.name;
  });
  if (deities.length) lines.push(`Deities: ${deities.join("; ")}`);

  const pantheons = input.pantheons.slice(0, MAX_NAMED).map((p) => p.name);
  if (pantheons.length) lines.push(`Pantheons: ${pantheons.join(", ")}`);

  const factions = input.factions.slice(0, MAX_NAMED).map((f) =>
    f.faction_type ? `${f.name} (${f.faction_type})` : f.name,
  );
  if (factions.length) lines.push(`Factions: ${factions.join("; ")}`);

  return lines.slice(0, MAX_LINES).map(clip);
}

export interface CalendarEventDraftResult {
  title: string;
  event_type: string;
  description: string;
}

function isAllowed(value: string, allowed: readonly string[]): boolean {
  return allowed.includes(value);
}

/**
 * Title and description are plain text; an unknown event type falls back to the
 * type the DM had selected. An empty title is a failed generation, not a blank.
 */
export function normalizeCalendarEventResult(
  raw: { title?: unknown; event_type?: unknown; description?: unknown },
  allowedTypes: readonly string[],
  selectedType: string,
): CalendarEventDraftResult {
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  if (!title) throw new Error("The model returned an event with no title. Try again.");
  const type = typeof raw.event_type === "string" ? raw.event_type.trim().toLowerCase() : "";
  const description = typeof raw.description === "string" ? raw.description.trim() : "";
  return {
    title,
    event_type: isAllowed(type, allowedTypes) ? type : selectedType,
    description,
  };
}
