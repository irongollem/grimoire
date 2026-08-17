import { LOCATION_TYPE_LABELS } from "@/types/location.types";
import type { Location, LocationType } from "@/types/location.types";

/**
 * Tags worth showing beside a location's type badge.
 *
 * Store, Tavern and Inn are relatively late additions — before they existed a
 * DM typed those places as `building` and said what they really were with a
 * tag. Those rows still exist and the tag is the only thing carrying the
 * meaning, so it has to stay: a `building` tagged "tavern" keeps its tag.
 *
 * What is redundant is the *other* case, where a place is typed `tavern` and
 * also tagged "tavern" — the badge and the tag then sit side by side saying the
 * same word, and one of them is doing no work.
 *
 * So the rule is deliberately narrow: drop a tag only when it restates the type
 * of the very location it is attached to. This is presentation only. The tag
 * stays in the database and keeps working in search and filters, because a
 * migration here would rewrite every user's rows to fix what is only ever a
 * visual duplication — and would be wrong for anyone using the tag on purpose.
 */
export function visibleTags(location: Pick<Location, "tags" | "location_type">): string[] {
  const own = normalise(LOCATION_TYPE_LABELS[location.location_type]);
  const key = normalise(location.location_type);
  return location.tags.filter((tag) => {
    const t = normalise(tag);
    return t !== own && t !== key;
  });
}

/** Case- and separator-insensitive: "Ten Towns", "ten-towns" and "ten_towns" match. */
function normalise(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

/** True when the tag would be hidden beside a badge for `type`. */
export function tagRestatesType(tag: string, type: LocationType): boolean {
  const t = normalise(tag);
  return t === normalise(LOCATION_TYPE_LABELS[type]) || t === normalise(type);
}
