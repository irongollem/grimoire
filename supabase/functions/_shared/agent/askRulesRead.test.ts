import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseFake } from "@/test/supabaseFake";
import { readRulesFrom } from "./askRulesRead";

const C = "c1";

function world(enabled: string[]) {
  const fake = createSupabaseFake();
  fake.seed("campaign_enabled_sources", enabled.map((s) => ({ campaign_id: C, source_slug: s })));
  fake.seed("content_sources", [
    { key: "srd-2014", title: "Grimoire Rules 2014" },
    { key: "srd-2024", title: "Grimoire Rules 2024" },
    { key: "kobold", title: "Kobold Book" },
  ]);
  fake.seed("library_rules", [
    { name: "Grappling", content: "2014 grapple text", doc_slug: "srd-2014", ruleset: "2014" },
    { name: "Grappling", content: "2024 grapple text", doc_slug: "srd-2024", ruleset: "2024" },
    { name: "Grappling", content: "kobold grapple text", doc_slug: "kobold", ruleset: "2024" },
  ]);
  fake.seed("library_spells", [
    { name: "Hold Person", description: "kobold spell", source: "kobold", ruleset: "2024" },
    { name: "Hold Person", description: "2014 spell", source: "srd-2014", ruleset: "2014" },
  ]);
  return { fake, client: fake.client as unknown as SupabaseClient };
}
const read = (client: SupabaseClient, gameSystem: string | null, query: string, kind: Parameters<typeof readRulesFrom>[1]["kind"] = "rule") =>
  readRulesFrom(client, { campaignId: C, gameSystem, query, kind });

describe("readRulesFrom", () => {
  // Bug caught: the edition filter dropped, so a 2024 campaign was taught a 2014 rule.
  it("gives a 2024 campaign only 2024 rules", async () => {
    const { client } = world(["srd-2014", "srd-2024"]);
    const out = await read(client, "dnd5e-2024", "grappling");
    if (out.status !== "ok") throw new Error("expected a read");
    expect(out.edition).toBe("2024");
    expect(out.hits.map((h) => h.text)).toEqual(["2024 grapple text"]);
  });

  // Bug caught: the opt-in filter dropped, forcing a book on a campaign that never enabled it.
  it("never returns a book the campaign has not enabled", async () => {
    const { client } = world(["srd-2024"]);
    const out = await read(client, "dnd5e-2024", "grappling");
    if (out.status !== "ok") throw new Error("expected a read");
    expect(out.hits.map((h) => h.source)).toEqual(["srd-2024"]);
    expect(out.hits[0].sourceTitle).toBe("Grimoire Rules 2024");
  });

  // Bug caught: a spell read without its source filter, returning another book's text to a campaign that left it out.
  it("filters spells by edition and enabled source too", async () => {
    const { client } = world(["srd-2024"]);
    const out = await read(client, "dnd5e-2024", "hold person", "spell");
    if (out.status !== "ok") throw new Error("expected a read");
    expect(out.hits).toEqual([]);
  });

  // Bug caught: the spell read without its edition filter, handing a 2024 campaign the 2014 spell text.
  it("gives a 2024 campaign only the 2024 spell", async () => {
    const { client } = world(["srd-2014", "kobold"]);
    const out = await read(client, "dnd5e-2024", "hold person", "spell");
    if (out.status !== "ok") throw new Error("expected a read");
    expect(out.hits.map((h) => h.text)).toEqual(["kobold spell"]);
  });

  // Bug caught: a campaign with no rules system hitting the library anyway.
  it("answers no_system for a campaign that is not 5e, and queries nothing", async () => {
    const { client, fake } = world(["srd-2024"]);
    expect(await read(client, "generic", "grappling")).toEqual({ status: "no_system" });
    expect(fake.calls).toEqual([]);
  });

  // Bug caught: the condition data reaching a campaign that never enabled that edition's SRD.
  it("reads the edition's condition text only when its SRD is enabled", async () => {
    const off = await read(world(["kobold"]).client, "dnd5e-2024", "grappled", "condition");
    const on = await read(world(["srd-2024"]).client, "dnd5e-2024", "grappled", "condition");
    if (off.status !== "ok" || on.status !== "ok") throw new Error("expected a read");
    expect(off.hits).toEqual([]);
    expect(on.hits.map((h) => h.name)).toEqual(["Grappled"]);
  });
});
