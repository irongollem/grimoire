import { beforeEach, describe, expect, it, vi } from "vitest";
import { pullAndCopy } from "./dev-campaigns";
import { importCampaign, pullCampaignTables, readExcludedTables, readForeignKeys } from "./lib/dev-campaign-io";
import { sql } from "./lib/dev-db";

vi.mock("./lib/dev-campaign-io", () => ({
  FIXTURE_EMAIL: "dm-fixture@example.invalid",
  PLAYER_EMAIL: "player-fixture@example.invalid",
  readCatalogue: vi.fn(() => []),
  readLocalColumns: vi.fn(() => new Map()),
  readExcludedTables: vi.fn(() => []),
  readForeignKeys: vi.fn(() => []),
  pullCampaignTables: vi.fn(async () => ({ tables: [], keptOut: {}, missingInProduction: [] })),
  pullReferences: vi.fn(async () => []),
  pullReferencedSpecies: vi.fn(async () => ({ pulled: 0, detached: {} })),
  pullSourceSpecies: vi.fn(async () => ({ reference: null, gone: [] })),
  emptyLocalSpeciesReferences: vi.fn(() => 0),
  importCampaign: vi.fn(() => []),
  runSqlFile: vi.fn(),
  seatPlayerFixture: vi.fn(),
}));
vi.mock("./lib/dev-db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./lib/dev-db")>()),
  sql: vi.fn(),
}));

const SOURCE = "12121212-3434-5656-7878-909090909090";
const OWNER = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const campaign = { id: "11111111-2222-3333-4444-555555555555", user_id: SOURCE, name: "Fixture campaign" };

const copy = () => pullAndCopy(
  { DB_URL: "postgresql://localhost/test" }, new URL("https://example.invalid"), "synthetic-key",
  SOURCE, OWNER, campaign, new Set(["fresh-copy"]),
);

describe("campaign replacement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(importCampaign).mockReturnValue([]);
    vi.mocked(sql).mockReturnValue("old-copy-1\nold-copy-2\nfresh-copy");
  });

  it("snapshots previous copies before import and purges only those after success", async () => {
    const events: string[] = [];
    vi.mocked(sql).mockImplementation((_db, query) => {
      if (query.includes("select id from public.campaigns")) {
        events.push("snapshot");
        return "old-copy-1\nold-copy-2\nfresh-copy";
      }
      events.push(query);
      return "";
    });
    vi.mocked(importCampaign).mockImplementation(() => {
      events.push("import");
      return [];
    });

    const result = await copy();
    expect(events).toEqual([
      "snapshot", "import",
      // The fixture's claim is released first, or the claimed character would
      // survive the purge as a stray in dm-fixture's pool (#1034).
      "update public.party_members set owner_user_id = null where campaign_id = 'old-copy-1'",
      "select private.purge_demo_campaign('old-copy-1')",
      "update public.party_members set owner_user_id = null where campaign_id = 'old-copy-2'",
      "select private.purge_demo_campaign('old-copy-2')",
    ]);
    expect(result.id).not.toBe(campaign.id);
    expect(importCampaign).toHaveBeenCalledWith(
      "postgresql://localhost/test", expect.objectContaining({ id: result.id, user_id: OWNER }),
      [], [], [], false,
    );
  });

  it("looks for previous copies among the fixture's own plain campaigns of the same name, never the source account's or a demo's", async () => {
    await copy();
    const query = String(vi.mocked(sql).mock.calls[0][1]);
    expect(query).toContain(`user_id = '${OWNER}'`);
    expect(query).toContain("demo_source is null");
    expect(query).toContain("demo_template is not true");
    expect(query).toContain("name = 'Fixture campaign'");
  });

  it("leaves every previous copy intact when import fails", async () => {
    vi.mocked(importCampaign).mockImplementation(() => { throw new Error("import failed"); });
    await expect(copy()).rejects.toThrow("import failed");
    expect(sql).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sql).mock.calls[0][1]).toContain("select id from public.campaigns");
  });
});

describe("what the copy carries into the local database", () => {
  const rows = (table: string, data: Record<string, unknown>[]) => ({
    table, tier: 1 as const, parentColumn: null, parentTable: null, deferColumns: [], columns: [], rows: data,
  });
  const imported = () => {
    const [, campaignArg, , tablesArg] = vi.mocked(importCampaign).mock.calls[0];
    return { campaign: campaignArg, tables: tablesArg };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(importCampaign).mockReturnValue([]);
    vi.mocked(sql).mockReturnValue("");
    vi.mocked(pullCampaignTables).mockResolvedValue({ tables: [], keptOut: {}, missingInProduction: [] });
    vi.mocked(readForeignKeys).mockReturnValue([]);
    vi.mocked(readExcludedTables).mockReturnValue([]);
  });

  it("drops the author's API keys, secrets and feed token from the campaign row, and keeps the rest", async () => {
    const row = {
      ...campaign,
      description: "kept",
      anthropic_api_key: "k1",
      openai_api_key: "k2",
      webhook_secret: "s",
      calendar_feed_token: "t",
    };
    await pullAndCopy({ DB_URL: "postgresql://localhost/test" }, new URL("https://example.invalid"), "synthetic-key", SOURCE, OWNER, row, new Set());
    const written = imported().campaign;
    expect(Object.keys(written).sort()).toEqual(["description", "id", "name", "user_id"]);
  });

  it("hands the fixture the rows and nobody else's account: pulled rows move to the fixture, a foreign account is emptied", async () => {
    const STRANGER = "99999999-0000-4000-8000-000000000000";
    vi.mocked(pullCampaignTables).mockResolvedValue({
      tables: [rows("party_members", [
        { id: "pm1", campaign_id: campaign.id, user_id: SOURCE, owner_user_id: STRANGER },
        { id: "pm2", campaign_id: campaign.id, user_id: SOURCE, owner_user_id: SOURCE },
      ])],
      keptOut: {},
      missingInProduction: [],
    });
    vi.mocked(readForeignKeys).mockReturnValue([
      { table: "party_members", column: "owner_user_id", refSchema: "auth", refTable: "users", refColumn: "id", nullable: true },
    ]);
    await pullAndCopy({ DB_URL: "postgresql://localhost/test" }, new URL("https://example.invalid"), "synthetic-key", SOURCE, OWNER, campaign, new Set());
    const members = imported().tables[0].rows;
    expect(members.map((r) => r.owner_user_id)).toEqual([null, OWNER]);
    expect(members.map((r) => r.user_id)).toEqual([OWNER, OWNER]);
    expect(JSON.stringify(imported())).not.toContain(STRANGER);
    expect(JSON.stringify(imported())).not.toContain(SOURCE);
  });

  it("empties a reference into campaign state the copy leaves out, and prunes a required reference to a row not kept", async () => {
    vi.mocked(pullCampaignTables).mockResolvedValue({
      tables: [
        rows("minis", [{ id: "m1", campaign_id: campaign.id, session_id: "s1" }]),
        rows("npcs", [{ id: "n1", campaign_id: campaign.id, faction_id: "gone" }, { id: "n2", campaign_id: campaign.id, faction_id: null }]),
        rows("factions", []),
      ],
      keptOut: {},
      missingInProduction: [],
    });
    vi.mocked(readExcludedTables).mockReturnValue(["campaign_sessions"]);
    vi.mocked(readForeignKeys).mockReturnValue([
      { table: "minis", column: "session_id", refSchema: "public", refTable: "campaign_sessions", refColumn: "id", nullable: true },
      { table: "npcs", column: "faction_id", refSchema: "public", refTable: "factions", refColumn: "id", nullable: false },
    ]);
    const result = await pullAndCopy({ DB_URL: "postgresql://localhost/test" }, new URL("https://example.invalid"), "synthetic-key", SOURCE, OWNER, campaign, new Set());
    const [minis, npcs] = imported().tables;
    expect(minis.rows.map((r) => r.session_id)).toEqual([null]);
    expect(npcs.rows.map((r) => r.id).length).toBe(1);
    expect(result.pruned).toEqual({ npcs: 1 });
    expect(result.detached).toEqual({ "minis.session_id": 1 });
  });
});
