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

describe("pullCampaignTables against a production that holds other people's rows", () => {
  afterEach(() => vi.restoreAllMocks());

  const SOURCE = "12121212-3434-5656-7878-909090909090";
  const STRANGER = "99999999-3434-5656-7878-909090909090";
  const remote = new URL("https://example.invalid");
  type Row = Record<string, unknown>;

  /** Answers `col=eq.v` and `col=in.(a,b)` filters from a row set, as PostgREST would. */
  function production(data: Record<string, Row[]>, missing: string[] = []) {
    const asked: { table: string; filter: string }[] = [];
    const matches = (filter: string) => {
      const tests = filter.split("&").filter(Boolean).map((f) => {
        const [column, op] = [f.slice(0, f.indexOf("=")), f.slice(f.indexOf("=") + 1)];
        if (op.startsWith("eq.")) return (r: Row) => r[column] === op.slice(3);
        const list = /^in\.\((.*)\)$/.exec(op)?.[1];
        if (list === undefined) throw new Error(`unmodelled filter ${f}`);
        const wanted = list.split(",");
        return (r: Row) => wanted.includes(String(r[column]));
      });
      return (r: Row) => tests.every((t) => t(r));
    };
    vi.spyOn(stack, "remoteRows").mockImplementation(async (_u, _k, table, filter) => {
      asked.push({ table, filter });
      if (missing.includes(table)) throw new stack.MissingRemoteTable(table);
      return (data[table] ?? []).filter(matches(filter));
    });
    vi.spyOn(stack, "remoteCount").mockImplementation(async (_u, _k, table, filter) => {
      if (missing.includes(table)) throw new stack.MissingRemoteTable(table);
      return (data[table] ?? []).filter(matches(filter)).length;
    });
    return asked;
  }

  const entry = (table: string, tier: 1 | 2, parent?: [string, string]) => ({
    table, tier, orderBy: "id", deferColumns: [], parentColumn: parent?.[0] ?? null, parentTable: parent?.[1] ?? null,
  });
  const columns = new Map([
    ["npcs", ["id", "campaign_id", "user_id"]],
    ["quests", ["id", "campaign_id", "user_id"]],
    ["quest_notes", ["id", "quest_id", "user_id"]],
  ]);

  it("never takes a stranger's row, and reports how many it kept out", async () => {
    production({
      npcs: [
        { id: "n1", campaign_id: "c1", user_id: SOURCE },
        { id: "n2", campaign_id: "c1", user_id: STRANGER },
        { id: "n3", campaign_id: "c2", user_id: SOURCE },
      ],
    });
    const result = await pullCampaignTables(remote, "k", [entry("npcs", 1)], columns, "c1", SOURCE);
    expect(result.tables[0].rows.map((r) => r.id)).toEqual(["n1"]);
    expect(result.keptOut).toEqual({ npcs: 1 });
  });

  it("reports nothing kept out when every row in the campaign is the source's own", async () => {
    production({ npcs: [{ id: "n1", campaign_id: "c1", user_id: SOURCE }, { id: "n2", campaign_id: "c1", user_id: SOURCE }] });
    const result = await pullCampaignTables(remote, "k", [entry("npcs", 1)], columns, "c1", SOURCE);
    expect(result.tables[0].rows).toHaveLength(2);
    expect(result.keptOut).toEqual({});
  });

  it("reads a tier-2 table only for the parents that were kept, and only the source's own rows of it", async () => {
    const asked = production({
      quests: [
        { id: "q1", campaign_id: "c1", user_id: SOURCE },
        { id: "q2", campaign_id: "c1", user_id: STRANGER },
      ],
      quest_notes: [
        { id: "a", quest_id: "q1", user_id: SOURCE },
        { id: "b", quest_id: "q1", user_id: STRANGER },
        { id: "c", quest_id: "q2", user_id: SOURCE },
      ],
    });
    const result = await pullCampaignTables(remote, "k", [entry("quests", 1), entry("quest_notes", 2, ["quest_id", "quests"])], columns, "c1", SOURCE);
    expect(result.tables[1].rows.map((r) => r.id)).toEqual(["a"]);
    expect(result.keptOut).toEqual({ quests: 1, quest_notes: 1 });
    expect(asked.filter((a) => a.table === "quest_notes").map((a) => a.filter)).toEqual([`quest_id=in.(q1)&user_id=eq.${SOURCE}`]);
  });

  it("splits a long parent list so no request outgrows a URL, and loses no child", async () => {
    const parents = Array.from({ length: 130 }, (_, i) => ({ id: `q${i}`, campaign_id: "c1", user_id: SOURCE }));
    const asked = production({ quests: parents, quest_notes: parents.map((p, i) => ({ id: `a${i}`, quest_id: p.id, user_id: SOURCE })) });
    const result = await pullCampaignTables(remote, "k", [entry("quests", 1), entry("quest_notes", 2, ["quest_id", "quests"])], columns, "c1", SOURCE);
    expect(result.tables[1].rows).toHaveLength(130);
    const requests = asked.filter((a) => a.table === "quest_notes");
    expect(requests).toHaveLength(3);
    for (const r of requests) expect(/in\.\((.*?)\)/.exec(r.filter)![1].split(",").length).toBeLessThanOrEqual(60);
  });

  it("treats a table production lacks as empty, so its children ask for nothing", async () => {
    const asked = production({ quest_notes: [{ id: "a", quest_id: "q1", user_id: SOURCE }] }, ["quests"]);
    const result = await pullCampaignTables(remote, "k", [entry("quests", 1), entry("quest_notes", 2, ["quest_id", "quests"])], columns, "c1", SOURCE);
    expect(result.missingInProduction).toEqual(["quests"]);
    expect(result.tables.map((t) => t.rows.length)).toEqual([0, 0]);
    expect(asked.some((a) => a.table === "quest_notes")).toBe(false);
  });

  it("lets any other failure through rather than copy a partial campaign", async () => {
    vi.spyOn(stack, "remoteRows").mockRejectedValue(new Error("Could not read npcs from production (500)"));
    await expect(pullCampaignTables(remote, "k", [entry("npcs", 1)], columns, "c1", SOURCE)).rejects.toThrow(/500/);
  });
});
