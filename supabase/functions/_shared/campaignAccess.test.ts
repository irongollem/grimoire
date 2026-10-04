import { describe, expect, it, vi } from "vitest";
import { isCampaignDm } from "./campaignAccess";

/**
 * A stub that answers like the real table: the query only matches a row whose
 * role is the one asked for, so a player's membership row is invisible to an
 * `.eq("role", "dm")` lookup exactly as it is in Postgres.
 */
function stubMembers(rows: { user_id: string; role: "dm" | "player" }[]) {
  const from = vi.fn(() => {
    const filters: Record<string, string> = {};
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn((column: string, value: string) => {
        filters[column] = value;
        return query;
      }),
      maybeSingle: vi.fn(async () => {
        const row = rows.find((r) =>
          r.user_id === filters.user_id && (!filters.role || r.role === filters.role));
        return { data: row ? { role: row.role } : null, error: null };
      }),
    };
    return query;
  });
  return { client: { from } as never, from };
}

const campaign = { id: "c1", user_id: "owner" };

describe("isCampaignDm", () => {
  it("admits the owner without a lookup", async () => {
    const { client, from } = stubMembers([]);
    await expect(isCampaignDm(client, campaign, "owner")).resolves.toBe(true);
    expect(from).not.toHaveBeenCalled();
  });

  it("admits a co-DM", async () => {
    const { client } = stubMembers([{ user_id: "co", role: "dm" }]);
    await expect(isCampaignDm(client, campaign, "co")).resolves.toBe(true);
  });

  it("refuses a player member: the case the old 'any member' check let through", async () => {
    const { client } = stubMembers([{ user_id: "p1", role: "player" }]);
    await expect(isCampaignDm(client, campaign, "p1")).resolves.toBe(false);
  });

  it("refuses a stranger", async () => {
    const { client } = stubMembers([{ user_id: "co", role: "dm" }]);
    await expect(isCampaignDm(client, campaign, "nobody")).resolves.toBe(false);
  });

  it("throws on a read error rather than answering no", async () => {
    const from = vi.fn(() => {
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: new Error("boom") }),
      };
      return query;
    });
    await expect(isCampaignDm({ from } as never, campaign, "co")).rejects.toThrow("boom");
  });
});
