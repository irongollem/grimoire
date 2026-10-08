import { beforeEach, describe, expect, it, vi } from "vitest";
import { pullAndCopy } from "./dev-campaigns";
import { importCampaign } from "./lib/dev-campaign-io";
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
      "select private.purge_demo_campaign('old-copy-1')",
      "select private.purge_demo_campaign('old-copy-2')",
    ]);
    expect(result.id).not.toBe(campaign.id);
    expect(importCampaign).toHaveBeenCalledWith(
      "postgresql://localhost/test", expect.objectContaining({ id: result.id, user_id: OWNER }),
      [], [], [], false,
    );
  });

  it("leaves every previous copy intact when import fails", async () => {
    vi.mocked(importCampaign).mockImplementation(() => { throw new Error("import failed"); });
    await expect(copy()).rejects.toThrow("import failed");
    expect(sql).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sql).mock.calls[0][1]).toContain("select id from public.campaigns");
  });
});
