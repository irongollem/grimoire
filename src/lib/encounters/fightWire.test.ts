import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EncounterState } from "@/types/encounter.types";

const net = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke: net.invoke } } }));

import { FightRequestError, isRetryable, observedFromRow, postFightBatch, retryDelayMs, sendAlone } from "./fightWire";

const refusal = (status: number, error: string) => ({ data: null, error: { message: "non-2xx", context: new Response(JSON.stringify({ error }), { status }) } });
const offline = () => ({ data: null, error: { message: "Failed to send a request", context: new TypeError("fetch failed") } });
const ok = { data: { applied: true, version: 2 }, error: null };

beforeEach(() => {
  net.invoke.mockReset();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe("postFightBatch", () => {
  it("fails if a refusal loses its status or the function's own words (the DM would read 'non-2xx')", async () => {
    net.invoke.mockResolvedValue(refusal(409, "This fight has ended."));
    await expect(postFightBatch("e", "b", [{ type: "abandon" }])).rejects.toMatchObject({ status: 409, message: "This fight has ended." });
  });

  it("fails if a request that got no answer is taken for a refusal", async () => {
    net.invoke.mockResolvedValue(offline());
    await expect(postFightBatch("e", "b", [{ type: "abandon" }])).rejects.toMatchObject({ status: null });
  });
});

describe("isRetryable", () => {
  it("retries what no answer or a server failure could change next time, and not a refusal or an ended fight", () => {
    const err = (status: number | null, message = "x") => new FightRequestError(message, status);
    expect(isRetryable(err(null))).toBe(true);
    expect(isRetryable(err(502))).toBe(true);
    expect(isRetryable(err(409, "The fight kept changing under this command; try again."))).toBe(true);
    expect(isRetryable(err(409, "This fight has ended."))).toBe(false);
    for (const status of [400, 403, 404]) expect(isRetryable(err(status))).toBe(false);
    expect(isRetryable(new Error("a bug"))).toBe(false);
  });

  it("backs off from half a second, doubling, never past ten", () => {
    expect([1, 2, 3, 6].map(retryDelayMs)).toEqual([500, 1000, 2000, 10_000]);
  });
});

describe("sendAlone", () => {
  it("fails if the retry of a lost reply carries a new batch id (the server would apply End combat twice)", async () => {
    net.invoke.mockResolvedValueOnce(offline()).mockResolvedValue(ok);
    const sent = sendAlone("e", { type: "end_combat" });
    await vi.advanceTimersByTimeAsync(600);
    await sent;
    const ids = net.invoke.mock.calls.map(([, init]) => (init.body as { batchId: string }).batchId);
    expect(ids).toHaveLength(2);
    expect(ids[1]).toBe(ids[0]);
  });

  it("gives up after its tries and throws the last error, and never retries a refusal", async () => {
    net.invoke.mockResolvedValue(refusal(403, "Forbidden"));
    await expect(sendAlone("e", { type: "abandon" })).rejects.toMatchObject({ status: 403 });
    expect(net.invoke).toHaveBeenCalledTimes(1);

    net.invoke.mockReset();
    net.invoke.mockResolvedValue(offline());
    const settled = sendAlone("e", { type: "abandon" }, 2).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(2000);
    expect(await settled).toMatchObject({ status: null });
    expect(net.invoke).toHaveBeenCalledTimes(2);
  });
});

describe("observedFromRow", () => {
  const row = {
    id: "r", encounter_id: "e", campaign_id: "c", user_id: "u", is_running: true, current_round: 2, active_combatant_index: 1,
    combatants_live: [], events_fired: ["x"], magical_darkness: [], started_at: null, updated_at: "",
    version: 9, applied_command_ids: ["a"], lair_fired_rounds: [1],
  } satisfies EncounterState;

  it("reads the DM's row into the shape the sync keeps", () => {
    expect(observedFromRow(row)).toMatchObject({ round: 2, activeIndex: 1, version: 9, appliedIds: ["a"], lairFiredRounds: [1], eventsFired: ["x"] });
  });

  it("fails if a row without a version (the players' projection) is taken for the DM's", () => {
    const { version: _version, ...projection } = row;
    expect(observedFromRow(projection)).toBeNull();
  });
});
