import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseFake, type SupabaseFake } from "@/test/supabaseFake";
import { settleHandedOff, withCreditHold, type CreditHold } from "./creditHold";

// The ledger, as the RPCs leave it: holds taken and not yet released, and settled spends.
let fake: SupabaseFake;
let held: Set<string>;
let releaseCalls: number;
let spends: { reason: string; cost: number }[];
const admin = () => fake.client as unknown as SupabaseClient;

const opts = { payerId: "dm-1", reason: "trap_generation", cost: 3 };
const ok = () => new Response("made", { status: 200 });

beforeEach(() => {
  fake = createSupabaseFake();
  held = new Set();
  releaseCalls = 0;
  spends = [];
  let next = 0;
  fake.onRpc("reserve_credits", () => {
    const id = `hold-${++next}`;
    held.add(id);
    return { ok: true, ids: [id] };
  });
  fake.onRpc("release_credits", (args) => {
    releaseCalls++;
    for (const id of args.p_ids as string[]) held.delete(id);
    return null;
  });
  fake.onRpc("spend_credits", (args) => {
    spends.push({ reason: args.p_reason as string, cost: args.p_cost as number });
    return { ok: true, balance: 10 };
  });
});

const freeRows = () => fake.rows("ai_credit_ledger").filter((r) => r.is_byok === false && r.delta === 0);

describe("withCreditHold", () => {
  it("#1234 releases the hold when the work throws after the reserve (a model reply that will not parse)", async () => {
    await expect(
      withCreditHold(admin(), opts, async () => {
        JSON.parse("not json");
        return ok();
      }),
    ).rejects.toThrow();
    expect(held.size).toBe(0);
  });

  it("#1234 answers with the work's result and releases once when a ledger write fails after it", async () => {
    fake.onRpc("spend_credits", () => {
      throw new Error("ledger down");
    });
    const report = vi.fn();
    const res = await withCreditHold(admin(), { ...opts, report }, async (hold) => {
      hold.charge("trap_generation", { cost: 3, isByok: false });
      return ok();
    });
    expect(res.status).toBe(200);
    expect(releaseCalls).toBe(1);
    expect(report).toHaveBeenCalledOnce();
  });

  it("charges each line of a successful request, after the hold is released", async () => {
    await withCreditHold(admin(), { ...opts, cost: 5 }, async (hold) => {
      hold.charge("trap_generation", { cost: 3, isByok: false });
      hold.charge("entity_image", { cost: 2, isByok: false });
      expect(held.size).toBe(1);
      return ok();
    });
    expect(held.size).toBe(0);
    expect(spends).toEqual([{ reason: "trap_generation", cost: 3 }, { reason: "entity_image", cost: 2 }]);
  });

  it("does not charge for work that threw, and keeps the platform's spend visible as a free line", async () => {
    await expect(
      withCreditHold(admin(), opts, async (hold) => {
        hold.charge("trap_generation", { cost: 3, isByok: false });
        throw new Error("image upload failed");
      }),
    ).rejects.toThrow("image upload failed");
    expect(spends).toEqual([]);
    expect(freeRows().map((r) => r.reason)).toEqual(["trap_generation"]);
  });

  it("#1234 records a zero-cost platform line, which a zero spend would drop (entity_image_prompt)", async () => {
    await withCreditHold(admin(), opts, async (hold) => {
      hold.charge("entity_image_prompt", { cost: 0, isByok: false, log: { model: "m" } });
      return ok();
    });
    expect(freeRows().map((r) => r.reason)).toEqual(["entity_image_prompt"]);
  });

  it("records a BYOK line as a zero row marked BYOK and charges nothing", async () => {
    await withCreditHold(admin(), { ...opts, cost: 0 }, async (hold) => {
      hold.charge("trap_generation", { cost: 3, isByok: true });
      return ok();
    });
    expect(spends).toEqual([]);
    expect(fake.rows("ai_credit_ledger")).toMatchObject([{ reason: "trap_generation", delta: 0, is_byok: true }]);
  });

  it("does not run the work when the hold is refused for want of credits", async () => {
    fake.onRpc("reserve_credits", () => ({ ok: false, insufficient: true, balance: 1 }));
    const work = vi.fn(async () => ok());
    const res = await withCreditHold(admin(), opts, work);
    expect(work).not.toHaveBeenCalled();
    expect(res.status).toBe(402);
  });

  it("#1234 answers a metering failure with 503, not 'insufficient credits' with a balance of 0", async () => {
    fake.failNext("reserve_credits", { message: "connection reset" });
    const work = vi.fn(async () => ok());
    const res = await withCreditHold(admin(), opts, work);
    expect(work).not.toHaveBeenCalled();
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: "metering_unavailable" });
  });

  it("leaves a handed-off hold for the background job to settle", async () => {
    let ids: string[] = [];
    await withCreditHold(admin(), opts, async (hold) => {
      ids = hold.handOff();
      return ok();
    });
    expect(ids).toHaveLength(1);
    expect(held.has(ids[0])).toBe(true);
    expect(releaseCalls).toBe(0);
  });

  it("refuses a charge made after the hold has settled, rather than dropping it silently", async () => {
    let kept: CreditHold | undefined;
    await withCreditHold(admin(), opts, async (hold) => {
      kept = hold;
      return ok();
    });
    expect(() => kept!.charge("trap_generation", { cost: 3, isByok: false })).toThrow(/settled/);
  });
});

describe("settleHandedOff", () => {
  async function handedOff(): Promise<string[]> {
    let ids: string[] = [];
    await withCreditHold(admin(), opts, async (hold) => {
      ids = hold.handOff();
      return ok();
    });
    return ids;
  }

  it("charges a job that stored its result and releases the hold it was handed", async () => {
    const ids = await handedOff();
    await settleHandedOff(admin(), { payerId: "dm-1", ids }, async (ledger) => {
      ledger.charge("character_doll", { cost: 3, isByok: false });
    });
    expect(held.size).toBe(0);
    expect(spends).toEqual([{ reason: "character_doll", cost: 3 }]);
  });

  it("releases the hold of a job that failed before storing anything, without charging", async () => {
    const ids = await handedOff();
    await expect(
      settleHandedOff(admin(), { payerId: "dm-1", ids }, async () => {
        throw new Error("render refused");
      }),
    ).rejects.toThrow("render refused");
    expect(held.size).toBe(0);
    expect(spends).toEqual([]);
  });
});
