// A Reaction spell that stops another creature's spell as it is cast (#1021 row 5b): Counterspell. How it is known is the library's
// structured `effects` (a `text` effect carrying `counters`), never the spell's name or prose. The decisions of who counters and what the
// edition's rule makes of it are the server's (`encounter-command/resolve.ts`); this only reads the record.
// Pure and edge-importable (relative `.ts` imports only).
//
// RULE counterspell (PHB 2014 "Counterspell": 3rd level, casting time a Reaction taken "when you see a creature within 60 feet of you
// casting a spell"; PHB 2024 "Counterspell": the same, the creature makes a Constitution saving throw).

import type { RulesetKey } from "../../../types/ruleset.types.ts";
import type { SpellRecord } from "./spellChoice.ts";

/** What a counter reaches and which edition's rule answers it: the record's own, since the fight's ruleset picked the record. */
export interface CounterEntry {
  rangeFeet: number;
  /** Null for a record that names no edition: the fight's own then. */
  ruleset: RulesetKey | null;
}

/** The counter a record is, or null for any other: its casting time is a Reaction and one structured effect carries `counters`. */
export function counterEntryFor(record: SpellRecord): CounterEntry | null {
  if (!/^(1 )?reaction\b/.test((record.casting_time ?? "").trim().toLowerCase())) return null;
  const carried = (record.effects ?? []).flatMap((e) => (e.counters === undefined || e.counters === null ? [] : [e.counters]));
  if (carried.length !== 1) return null;
  const [counters] = carried;
  if (!(counters.rangeFeet > 0)) return null;
  return { rangeFeet: counters.rangeFeet, ruleset: record.ruleset === undefined ? null : record.ruleset };
}
