/**
 * Ask Grimoire (#1253): where the DM was when they asked, as the `context` of an `ask-turn` body.
 * `record` is set only when the page is one record's own page; the server checks the id against the campaign.
 */
import type { AskContext, AskRecordType } from "@edge-shared/agent/askContract";

interface RouteLike {
  path: string;
  query?: Record<string, unknown>;
}

/** List sub-pages that share a detail route's shape but are not a record. */
const NOT_A_RECORD = new Set(["new", "fallen", "web", "family-links", "sets"]);

const DETAIL: readonly { prefix: string; type: AskRecordType }[] = [
  { prefix: "/npcs/", type: "npc" },
  { prefix: "/monsters/", type: "monster" },
  { prefix: "/vault/", type: "item" },
  { prefix: "/spells/", type: "spell" },
  { prefix: "/factions/", type: "faction" },
  { prefix: "/quests/", type: "quest" },
  { prefix: "/party/", type: "party_member" },
];

/**
 * `title` is the page's own title (`route.meta.title`), so a bug report Ask drafts can say which page the DM was on
 * in the page's words, not only its address.
 */
export function askContextFor(route: RouteLike, title?: unknown): AskContext {
  const base: AskContext = { route: route.path, ...(typeof title === "string" && title.trim() !== "" ? { title } : {}) };
  // The Atlas selects a place in the address, not in the path.
  if (route.path === "/locations") {
    const at = route.query?.at;
    return typeof at === "string" && at !== "" ? { ...base, record: { type: "location", id: at } } : base;
  }
  for (const { prefix, type } of DETAIL) {
    if (!route.path.startsWith(prefix)) continue;
    const id = route.path.slice(prefix.length).split("/")[0];
    if (id === undefined || id === "" || NOT_A_RECORD.has(id)) return base;
    return { ...base, record: { type, id } };
  }
  return base;
}
