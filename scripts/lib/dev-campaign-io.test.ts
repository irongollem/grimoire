import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyLocalSpeciesReferences, parseSkipped, pullCampaignTables, pullReferencedSpecies, pullSourceSpecies } from "./dev-campaign-io";
import * as db from "./dev-db";
import * as stack from "./dev-stack";

describe("parseSkipped", () => {
  it("reads a lenient import's dev-skip notices and ignores psql's other output", () => {
    const stderr = [
      "psql:/tmp/import.sql:12: NOTICE:  dev-skip|character_spells|1|srd_x is not on the Paladin spell list",
      "psql:/tmp/import.sql:12: NOTICE:  some other notice",
      "psql:/tmp/import.sql:12: NOTICE:  dev-skip|loot_placements|2|Item is not available | to this campaign",
      "",
    ].join("\n");
    expect(parseSkipped(stderr)).toEqual([
      { table: "character_spells", count: 1, reason: "srd_x is not on the Paladin spell list" },
      // A reason may itself contain the separator.
      { table: "loot_placements", count: 2, reason: "Item is not available | to this campaign" },
    ]);
  });

  it("is empty for a clean import", () => {
    expect(parseSkipped("")).toEqual([]);
  });
});


describe("pullCampaignTables ownership", () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([
    ["quest_threads", "created_by=eq."],
    ["quest_beats", "or=(created_by.eq."],
  ])("filters %s in the remote GET", async (table, creatorPrefix) => {
    const source = "12121212-3434-5656-7878-909090909090";
    const remote = new URL("https://example.invalid");
    const rows = vi.spyOn(stack, "remoteRows").mockResolvedValue([]);
    vi.spyOn(stack, "remoteCount").mockResolvedValue(0);
    await pullCampaignTables(remote, "synthetic-key", [
      { table, tier: 1, orderBy: "id", deferColumns: [], parentColumn: null, parentTable: null },
    ], new Map([[table, ["id", "created_by"]]]), "campaign-id", source);
    const creator = creatorPrefix + source + (table === "quest_beats" ? ",created_by.is.null)" : "");
    expect(rows).toHaveBeenCalledWith(remote, "synthetic-key", table, `campaign_id=eq.campaign-id&${creator}`, "id");
  });
});

describe("pullReferencedSpecies (#1034)", () => {
  afterEach(() => vi.restoreAllMocks());

  const SOURCE = "12121212-3434-5656-7878-909090909090";
  const CAMPAIGN = "c0c0c0c0-0000-4000-8000-000000000001";
  const IN_CAMPAIGN = "a0a0a0a0-0000-4000-8000-000000000001";
  const ACCOUNT_LEVEL = "a0a0a0a0-0000-4000-8000-000000000002";
  const SOMEONE_ELSES = "a0a0a0a0-0000-4000-8000-000000000003";

  it("pulls the source account's species the campaign names but does not hold, and empties the rest", async () => {
    const remote = new URL("https://example.invalid");
    const rows = vi.spyOn(stack, "remoteRows").mockResolvedValue([{ id: ACCOUNT_LEVEL, user_id: SOURCE, campaign_id: null, name: "Moth-folk" }]);
    const campaign: Record<string, unknown> = { id: CAMPAIGN, disabled_species_ids: [SOMEONE_ELSES, "srd_srd_2024_dwarf", ACCOUNT_LEVEL] };
    const tables = [
      { table: "species", tier: 1 as const, parentColumn: null, parentTable: null, deferColumns: [], columns: ["id", "user_id", "campaign_id", "name"], rows: [{ id: IN_CAMPAIGN }] },
      {
        table: "party_members", tier: 1 as const, parentColumn: null, parentTable: null, deferColumns: [], columns: ["id", "species_id", "disguise_species_id"],
        rows: [
          { id: "pm1", species_id: IN_CAMPAIGN, disguise_species_id: ACCOUNT_LEVEL },
          { id: "pm2", species_id: SOMEONE_ELSES, disguise_species_id: "srd_srd_2024_elf" },
        ],
      },
    ];

    const result = await pullReferencedSpecies(remote, "synthetic-key", campaign, tables, SOURCE);

    // Only the two it does not hold are asked for, and only the source account's.
    const filter = rows.mock.calls[0]![3];
    expect(filter).toContain(`user_id=eq.${SOURCE}`);
    expect(filter.match(/id=in\.\((.*)\)/)![1]!.split(",").sort()).toEqual([ACCOUNT_LEVEL, SOMEONE_ELSES]);
    // The pulled species is filed under this campaign, so the copy remaps it with the rest.
    expect(tables[0]!.rows).toContainEqual({ id: ACCOUNT_LEVEL, user_id: SOURCE, campaign_id: CAMPAIGN, name: "Moth-folk" });
    expect(result.pulled).toBe(1);
    // Another account's species never arrives, so every reference to it is emptied; slugs stay.
    expect(tables[1]!.rows[1]).toMatchObject({ species_id: null, disguise_species_id: "srd_srd_2024_elf" });
    expect(tables[1]!.rows[0]).toMatchObject({ species_id: IN_CAMPAIGN, disguise_species_id: ACCOUNT_LEVEL });
    expect(campaign.disabled_species_ids).toEqual(["srd_srd_2024_dwarf", ACCOUNT_LEVEL]);
    expect(result.detached).toEqual({ "party_members.species_id": 1, "campaigns.disabled_species_ids": 1 });
  });

  it("asks production for nothing when the campaign holds every species it names", async () => {
    const rows = vi.spyOn(stack, "remoteRows").mockResolvedValue([]);
    const tables = [
      { table: "species", tier: 1 as const, parentColumn: null, parentTable: null, deferColumns: [], columns: ["id", "user_id"], rows: [{ id: IN_CAMPAIGN }] },
      { table: "party_members", tier: 1 as const, parentColumn: null, parentTable: null, deferColumns: [], columns: ["id"], rows: [{ id: "pm1", species_id: IN_CAMPAIGN }] },
    ];
    const result = await pullReferencedSpecies(new URL("https://example.invalid"), "k", { id: CAMPAIGN, disabled_species_ids: [] }, tables, SOURCE);
    expect(rows).not.toHaveBeenCalled();
    expect(result).toEqual({ pulled: 0, detached: {} });
  });
});

describe("pullSourceSpecies (#1034)", () => {
  afterEach(() => vi.restoreAllMocks());
  const SOURCE = "12121212-3434-5656-7878-909090909090";
  const KEPT = "b0b0b0b0-0000-4000-8000-000000000001";
  const GONE = "b0b0b0b0-0000-4000-8000-000000000002";

  it("reads the missing species unchanged under the ownership rule, and lists what production no longer has", async () => {
    vi.spyOn(db, "sql").mockImplementation((_url, query) => {
      if (query.includes("pg_attribute")) return "species\tid,user_id,campaign_id,name";
      return `${KEPT}\n${GONE}`;
    });
    const rows = vi.spyOn(stack, "remoteRows").mockResolvedValue([{ id: KEPT, user_id: SOURCE, campaign_id: null, name: "Moth-folk" }]);
    const result = await pullSourceSpecies(new URL("https://example.invalid"), "k", "postgresql://local", "c1", SOURCE);
    expect(rows.mock.calls[0]![3]).toContain(`user_id=eq.${SOURCE}`);
    expect(result.reference).toEqual({ table: "species", rows: [{ id: KEPT, user_id: SOURCE, campaign_id: null, name: "Moth-folk" }], columns: ["id", "user_id", "campaign_id", "name"] });
    expect(result.gone).toEqual([GONE]);
  });

  it("asks production nothing when the local rows name no missing species", async () => {
    vi.spyOn(db, "sql").mockReturnValue("");
    const rows = vi.spyOn(stack, "remoteRows");
    expect(await pullSourceSpecies(new URL("https://example.invalid"), "k", "postgresql://local", "c1", SOURCE)).toEqual({ reference: null, gone: [] });
    expect(rows).not.toHaveBeenCalled();
  });

  it("clears nothing, and runs nothing, when nothing is gone", () => {
    const sql = vi.spyOn(db, "sql");
    expect(emptyLocalSpeciesReferences("postgresql://local", "c1", [])).toBe(0);
    expect(sql).not.toHaveBeenCalled();
  });
});
