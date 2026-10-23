/**
 * The Open Book (#1085): a campaign released as a public, read-only book.
 *
 * The snapshot types mirror `private.open_book_snapshot` (migration 20261023230210) field for field. That
 * function decides what a visitor may read; nothing on the client widens it. Rich-text fields arrive as the
 * stored string (Tiptap JSON, or plain text on old rows) with secret blocks already removed server-side.
 */

export const OPEN_BOOK_CHAPTERS = ["atlas", "folk", "factions", "pantheon", "lore", "chronicle"] as const;
export type OpenBookChapter = (typeof OPEN_BOOK_CHAPTERS)[number];

export const OPEN_BOOK_COVER_ARTS = ["tooled", "plate", "full"] as const;
export type OpenBookCoverArt = (typeof OPEN_BOOK_COVER_ARTS)[number];

export const OPEN_BOOK_LEATHERS = ["oxblood", "sea", "night", "walnut", "ash"] as const;
export type OpenBookLeather = (typeof OPEN_BOOK_LEATHERS)[number];

/** The kinds of entry a DM can put in or take out by hand (`open_book_entries.entity_type`). */
export const OPEN_BOOK_ENTITY_TYPES = ["location", "npc", "faction", "pantheon", "deity", "note"] as const;
export type OpenBookEntityType = (typeof OPEN_BOOK_ENTITY_TYPES)[number];

/** A row of `open_books`: the owner's settings for the campaign's book. */
export interface OpenBook {
  campaign_id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  cover_art: OpenBookCoverArt;
  cover_image_url: string | null;
  leather: OpenBookLeather;
  chapters: OpenBookChapter[];
  include_shared: boolean;
  allow_pdf: boolean;
  indexable: boolean;
  is_open: boolean;
  live_release_id: string | null;
  created_at: string;
  updated_at: string;
}

/** A row of `open_book_entries`: one entry the DM put in or took out by hand. */
export interface OpenBookEntry {
  campaign_id: string;
  entity_type: OpenBookEntityType;
  entity_id: string;
  included: boolean;
  created_at: string;
  updated_at: string;
}

export interface OpenBookStats {
  places: number;
  folk: number;
  factions: number;
  pantheons: number;
  deities: number;
  lore: number;
  sessions: number;
  events: number;
}

/** A row of `open_book_releases`. `snapshot` is omitted from list reads; fetch it only when needed. */
export interface OpenBookRelease {
  id: string;
  campaign_id: string;
  created_by: string | null;
  number: number;
  note: string | null;
  stats: OpenBookStats;
  pdf_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface OpenBookFocalPoint {
  x: number;
  y: number;
}

export interface OpenBookPin {
  /** The stored pin object, already filtered to `visible_to_players`. Shape follows `MapPin` in location.types. */
  [key: string]: unknown;
}

export interface OpenBookPlaceMap {
  url: string | null;
  layer_url: string | null;
  layer_calibration: unknown;
  plan_size: unknown;
  scale: unknown;
}

export interface OpenBookPlace {
  id: string;
  /** May name a place that is not in the book; treat such a place as a root. */
  parent_id: string | null;
  name: string;
  location_type: string | null;
  player_summary: string | null;
  description: string | null;
  image_url: string | null;
  tags: string[] | null;
  is_level: boolean | null;
  is_battle_map: boolean | null;
  npcs_shared: boolean | null;
  map: OpenBookPlaceMap | null;
  pins: OpenBookPin[];
}

export interface OpenBookPerson {
  id: string;
  /** The cover name while a disguise holds. */
  name: string;
  race: string | null;
  occupation: string | null;
  status: string | null;
  relationship: string | null;
  portrait_url: string | null;
  portrait_focal_point: OpenBookFocalPoint | null;
  cutout_url: string | null;
  /** May name a place that is not in the book. */
  location_id: string | null;
  /** The cover the party knew, once it has fallen. */
  former_name: string | null;
  former_portrait_url: string | null;
}

export interface OpenBookFaction {
  id: string;
  name: string;
  faction_type: string | null;
  description: string | null;
  emblem_url: string | null;
  alignment: string | null;
  tags: string[] | null;
  party_standing: string | null;
  descent: string | null;
}

export interface OpenBookPantheon {
  id: string;
  name: string;
  description: string | null;
  emblem_url: string | null;
  tags: string[] | null;
}

export interface OpenBookDeity {
  id: string;
  /** May name a pantheon that is not in the book. */
  pantheon_id: string | null;
  name: string;
  titles: string | null;
  alternate_names: string[] | null;
  alignment: string | null;
  symbol: string | null;
  symbol_image_url: string | null;
  portrait_url: string | null;
  portrait_focal_point: OpenBookFocalPoint | null;
  domains: string[] | null;
  portfolio: string | null;
  description: string | null;
  tags: string[] | null;
}

export interface OpenBookLore {
  id: string;
  title: string;
  category: string | null;
  content: string | null;
  tags: string[] | null;
  is_pinned: boolean | null;
  created_at: string;
  updated_at: string;
}

export interface OpenBookCalendarDate {
  year: number | null;
  month: number | null;
  day: number | null;
  end_year: number | null;
  end_month: number | null;
  end_day: number | null;
}

export interface OpenBookSession {
  id: string;
  title: string;
  content: string | null;
  tags: string[] | null;
  session: { number: number | null; title: string | null; played_on: string | null } | null;
  date: OpenBookCalendarDate | null;
  real_date: string | null;
  created_at: string;
}

export interface OpenBookEvent {
  id: string;
  title: string;
  description: string | null;
  event_type: string | null;
  year: number | null;
  month: number | null;
  day: number | null;
  festival_day: string | null;
  is_multi_day: boolean | null;
  end_year: number | null;
  end_month: number | null;
  end_day: number | null;
  color: string | null;
}

export interface OpenBookSnapshot {
  v: 1;
  book: {
    title: string;
    subtitle: string | null;
    cover_art: OpenBookCoverArt;
    cover_image_url: string | null;
    leather: OpenBookLeather;
    chapters: OpenBookChapter[];
    campaign_name: string;
  };
  calendar: {
    calendar_id: string | null;
    custom_calendar: unknown;
    current: { year: number | null; month: number | null; day: number | null };
  };
  places: OpenBookPlace[];
  folk: OpenBookPerson[];
  factions: OpenBookFaction[];
  pantheons: OpenBookPantheon[];
  deities: OpenBookDeity[];
  lore: OpenBookLore[];
  sessions: OpenBookSession[];
  events: OpenBookEvent[];
  /**
   * Names for the ids the book's own text cites (entityMention stores no label), limited to names the whole
   * table can read: characters, people under their cover, places, factions. An id missing here stays unnamed.
   */
  names: Record<string, string>;
}

/** What `preview_open_book` returns: the snapshot plus its counts. */
export type OpenBookPreview = OpenBookSnapshot & { stats: OpenBookStats };

/** What the `open-book` Edge Function serves a visitor. */
export interface PublicOpenBook {
  slug: string;
  allow_pdf: boolean;
  indexable: boolean;
  release: {
    number: number;
    note: string | null;
    created_at: string;
    pdf_url: string | null;
    stats: OpenBookStats;
  };
  snapshot: OpenBookSnapshot;
}

/** `?part=meta` of the `open-book` function: the cover and calendar plus a session index, for titles and share cards. */
export interface PublicOpenBookMeta extends Omit<PublicOpenBook, "snapshot"> {
  snapshot: Pick<OpenBookSnapshot, "v" | "book" | "calendar">;
  /** `image`: the session report's first picture (https only), for its share card. */
  sessions: { id: string; title: string; number: number | null; image: string | null }[];
}
