/**
 * What has shipped, one line each, for the admin's "we've changed since you
 * left" email to an account that went quiet (Admin → Users). The outreach
 * draft lists the entries released after that account's last activity, newest
 * first.
 *
 * Written for someone who used the app once and never came back: what they
 * would notice, in their words, never an issue number or a code name. Add a
 * line when something worth coming back for is released; the /whats-new skill
 * does this as part of each Discord post. Old lines can stay: an account only
 * ever sees the ones after its own last visit.
 */
export interface ReleaseHighlight {
  /** ISO date it reached production. */
  releasedAt: string;
  line: string;
}

export const RELEASE_HIGHLIGHTS: readonly ReleaseHighlight[] = [
  { releasedAt: "2026-06-17", line: "The Scriptorium starts a book from a finished template, and you can click any block on the page to edit it" },
  { releasedAt: "2026-06-23", line: "Experience points, with levelling by XP" },
  { releasedAt: "2026-07-13", line: "The Interlude, a downtime card deck you can switch on as an optional rule and print" },
  { releasedAt: "2026-07-22", line: "The 2024 rules alongside 2014: conditions, exhaustion, and backgrounds with an Origin feat" },
  { releasedAt: "2026-07-25", line: "Players manage their own companions, and Armor Class follows the armor you wear" },
  { releasedAt: "2026-08-05", line: "Mid-fight complications and reinforcements for the encounter you are running" },
  { releasedAt: "2026-09-08", line: "Quests rebuilt: several threads at once, a story flow you can see, and a view for running it at the table" },
  { releasedAt: "2026-09-09", line: "Sites: draw a dungeon in the Cartographer and run it room by room" },
  { releasedAt: "2026-09-11", line: "Move content between campaigns, and copy NPCs and factions to another campaign" },
  { releasedAt: "2026-09-25", line: "A ready-made demo campaign to look around in before you build your own" },
  { releasedAt: "2026-10-01", line: "Vellum, a new look for the whole app" },
  { releasedAt: "2026-10-04", line: "Handouts your players read in their journal, and AI help wherever you write" },
  { releasedAt: "2026-10-05", line: "Hearth, a home for players, with a character sheet built for the table" },
  { releasedAt: "2026-10-06", line: "A session log, a scratchpad on every page, and a real PDF export from the Scriptorium" },
  { releasedAt: "2026-10-08", line: "Quest clocks and deadlines, and search across a whole campaign by meaning" },
  { releasedAt: "2026-10-10", line: "The combat runner rolls monster attacks and saves, and tracks how long conditions last" },
  { releasedAt: "2026-10-12", line: "NPCs remember what they and the party told each other" },
];
