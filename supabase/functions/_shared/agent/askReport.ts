// Ask drafts a bug report or a feature request from what the DM said (#1253 follow-up). Pure.
//
// THE RULE (maintainer, 23 Nov 2026): a report is NEVER sent by Ask. Nothing in this module or anywhere under
// `ask-turn/` or `_shared/agent/` calls `create-bug-report` or writes `bug_reports` (`askReport.test.ts` holds the
// files to it). The draft goes to the browser, which opens the existing report form pre-filled; the DM reads it,
// edits it and presses Send there. That press is the consent.

import type { AskContext, AskReportDraft } from "./askContract.ts";
import { isRecord } from "./parse.ts";
import type { AgentTool, ToolAnswer } from "./types.ts";

/** The longest `where` line, and the longest of every other field. The form has no cap of its own; these keep a runaway draft short. */
export const WHERE_MAX = 200;
export const FIELD_MAX = 2000;

/** The tool's name, shared with the tests and the prompt. */
export const DRAFT_REPORT_TOOL = "draft_report";

/**
 * A plain "where" for the report: the page's title, its route with every id replaced, and the kind of record open;
 * never a record's name or id. A filed report becomes an issue in a PUBLIC repository (`create-bug-report/issue.ts`),
 * so a campaign's names must not reach it by default: the DM can still add one in the form, knowingly. The title is the
 * route's own (`route.meta.title`: "Canon", "Quests"), never a record's name.
 */
export function whereFrom(context: AskContext | undefined): string {
  if (context === undefined) return "The main screen";
  const route = context.route
    .split("?")[0]
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ":id")
    .replace(/\/\d+(?=\/|$)/g, "/:n");
  const parts: string[] = [];
  if (context.title !== undefined && context.title.trim() !== "") parts.push(context.title.trim());
  parts.push(route);
  if (context.record !== undefined) parts.push(`with ${context.record.type.replace(/_/g, " ")} open`);
  return parts.join(", ").slice(0, WHERE_MAX);
}

/** The drafting instructions of the free report turn. The DM's words and where they are come in the message, never here. */
export function reportSystem(): string {
  return `You turn what a Dungeon Master said about a problem with the Grimoire app itself, or a feature they want, into a short report for the app's makers. You do not answer them and you write nothing but the report.

Call draft_report once. Rules:
- Write only from what the DM said and from where they were. Invent no steps, no error messages, no browsers, no causes and no details they did not give.
- The report is published openly. Leave out the names of their characters, places, factions and campaign, and anything else from their campaign; describe the kind of thing instead ("an NPC", "a quest").
- Keep their own words for what they saw or want. Tidy the grammar and the order, never the meaning, and drop anger without dropping the facts.
- One concise report: a sentence or two for each field.
- For a bug: where it happened, what they did, what they expected and what happened instead. If they did not say one of those, write "Not said" rather than guessing.
- For a feature: a short summary of what they want, and the problem it would solve for them in their words.
- You cannot send it. Never say it was sent or filed: the DM reads it and sends it themselves.`;
}

/** The draft_report tool: the report form's own fields. */
export function draftReportTool(): AgentTool {
  const text = (description: string) => ({ type: "string", description });
  return {
    name: DRAFT_REPORT_TOOL,
    description: "Draft a bug report or feature request about the Grimoire app, from what the DM said. Nothing is sent: the DM reads the draft in the report form and sends it themselves. Call it once. After calling it, stop.",
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["bug", "feature"], description: "A bug is something that should work and does not; a feature is something new or changed." },
        where: text("Where in the app it happened or applies: the page, and the record if one was open."),
        action: text("Bug only: what the DM did, in their words."),
        expected: text("Bug only: what they expected to happen."),
        actual: text("Bug only: what happened instead."),
        summary: text("Feature only: what they want, in a sentence."),
        problem: text("Feature only: the problem it would solve for them, in their words."),
      },
      required: ["kind", "where"],
      additionalProperties: false,
    },
  };
}

function field(raw: unknown, max: number): string {
  return typeof raw === "string" ? raw.trim().slice(0, max).trim() : "";
}

export type CheckedDraft = { ok: true; report: AskReportDraft } | { ok: false; error: string };

/** The model's tool input as a draft the form can take, or a sentence saying what is missing. Long fields are cut, never refused. */
export function checkDraft(args: unknown): CheckedDraft {
  if (!isRecord(args)) return { ok: false, error: "The report needs its fields." };
  const where = field(args.where, WHERE_MAX);
  if (args.kind === "bug") {
    const action = field(args.action, FIELD_MAX);
    const expected = field(args.expected, FIELD_MAX);
    const actual = field(args.actual, FIELD_MAX);
    const missing = (["where", "action", "expected", "actual"] as const).filter((k) => ({ where, action, expected, actual })[k] === "");
    if (missing.length > 0) return { ok: false, error: `A bug report needs ${missing.join(", ")}. Write "Not said" for what the DM did not say.` };
    return { ok: true, report: { kind: "bug", where, action, expected, actual } };
  }
  if (args.kind === "feature") {
    const summary = field(args.summary, FIELD_MAX);
    const problem = field(args.problem, FIELD_MAX);
    if (summary === "" || problem === "") return { ok: false, error: "A feature request needs a summary and a problem." };
    return { ok: true, report: { kind: "feature", where, summary, problem } };
  }
  return { ok: false, error: 'The kind is "bug" or "feature".' };
}

/**
 * The draft when the model produced none (a provider failure, or input that failed `checkDraft`): the DM's own words,
 * honestly placed, for them to complete in the form. Nothing is invented: a bug's expected and actual say to see the
 * action, and a feature's problem is the message itself.
 */
export function fallbackDraft(kind: "bug" | "feature", message: string, where: string): AskReportDraft {
  const words = message.trim().slice(0, FIELD_MAX);
  if (kind === "bug") {
    return { kind: "bug", where: where.slice(0, WHERE_MAX), action: words, expected: "See what I wrote above.", actual: "See what I wrote above." };
  }
  return { kind: "feature", where: where.slice(0, WHERE_MAX), summary: words.slice(0, 120).trim(), problem: words };
}

/** What the draft_report tool answers the model, and the draft when it was valid. One place, so both paths answer alike. */
export function answerDraft(args: unknown): { answer: ToolAnswer; report: AskReportDraft | null } {
  const checked = checkDraft(args);
  if (!checked.ok) return { answer: { content: checked.error, isError: true }, report: null };
  return {
    answer: { content: "Drafted. It is shown to the DM, who reads it in the report form and sends it themselves. Stop now and write nothing more in this turn.", isError: false },
    report: checked.report,
  };
}
