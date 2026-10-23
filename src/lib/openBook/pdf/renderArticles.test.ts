// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { buildBookModel } from "@/lib/openBook/bookModel";
import type { OpenBookSnapshot } from "@/types/openBook.types";
import { prepareSectionHtml } from "./bookLinks";
import { renderArticles } from "./renderArticles";

const doc = (text: string) => JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });

const snapshot: OpenBookSnapshot = {
  v: 1,
  book: { title: "T", subtitle: null, cover_art: "tooled", cover_image_url: null, leather: "oxblood", chapters: ["atlas", "folk", "factions", "pantheon", "lore", "chronicle"], campaign_name: "C" },
  calendar: { calendar_id: "faerun", custom_calendar: null, current: { year: 1492, month: 1, day: 5 } },
  places: [
    { id: "town", parent_id: null, name: "Hollowmere", location_type: "city", player_summary: "A sunken town.", description: doc("Boats tie up."), image_url: null, tags: null, is_level: null, is_battle_map: null, npcs_shared: null, map: null, pins: [] },
    { id: "stair", parent_id: "town", name: "The Toll Stair", location_type: null, player_summary: null, description: null, image_url: null, tags: null, is_level: null, is_battle_map: null, npcs_shared: null, map: null, pins: [] },
  ],
  folk: [
    { id: "maren", name: "Maren Vell", race: "Human", occupation: "Harbourmaster", status: "dead", relationship: "friendly", portrait_url: null, portrait_focal_point: null, cutout_url: null, location_id: "town", former_name: "The Quiet One", former_portrait_url: null },
  ],
  factions: [{ id: "brine", name: "House Brine", faction_type: "noble_house", description: doc("Salt-lords."), emblem_url: null, alignment: "Lawful neutral", tags: null, party_standing: "wary", descent: null }],
  pantheons: [{ id: "reach", name: "Gods of the Reach", description: doc("Many."), emblem_url: null, tags: null }],
  deities: [{ id: "orla", pantheon_id: "reach", name: "Orla", titles: "Saint of the drowned", alternate_names: ["The Ringer"], alignment: "Neutral good", symbol: "A bell", symbol_image_url: null, portrait_url: null, portrait_focal_point: null, domains: ["Tempest", "Light"], portfolio: "Bells", description: doc("A ringer."), tags: null }],
  lore: [{ id: "tide", title: "The Long Tide", category: "history", content: doc("Water."), tags: null, is_pinned: null, created_at: "", updated_at: "" }],
  sessions: [
    { id: "s14", title: "The Lamp Goes Out", content: JSON.stringify({ type: "doc", content: [{ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "The climb" }] }, { type: "paragraph", content: [{ type: "entityMention", attrs: { id: "maren", entityType: "npc" } }] }] }), tags: null, session: { number: 14, title: null, played_on: "2026-10-22" }, date: { year: 1492, month: 1, day: 5, end_year: null, end_month: null, end_day: null }, real_date: null, created_at: "2026-10-22" },
  ],
  events: [{ id: "ev", title: "Feast of Orla", description: null, event_type: null, year: 1492, month: 1, day: 14, festival_day: null, is_multi_day: null, end_year: null, end_month: null, end_day: null, color: null }],
  names: {},
};

describe("renderArticles", () => {
  const model = buildBookModel(snapshot);

  it("draws every section but the contents, keyed as the reader keys them", async () => {
    const out = await renderArticles(model, "saltreach");
    const expected = ["almanac", "index", ...model.entries.map((e) => `entry:${e.id}`)];
    expect([...out.keys()].sort()).toEqual(expected.sort());
    expect(out.get("entry:town")).toContain("Hollowmere");
  });

  it("links with the book's own addresses, which the print pass then turns into anchors", async () => {
    const out = await renderArticles(model, "saltreach");
    const town = out.get("entry:town") ?? "";
    expect(town).toContain('href="/w/saltreach/atlas/stair"');
    const ctx = { slug: "saltreach", origin: "https://app.example", entryIds: new Set(model.entries.map((e) => e.id)) };
    expect(prepareSectionHtml(town, ctx)).toContain('href="#e-stair"');
  });

  it("draws a mention in a session as a link to the page it names", async () => {
    const out = await renderArticles(model, "saltreach");
    expect(out.get("entry:s14")).toContain('href="/w/saltreach/folk/maren"');
  });
});
