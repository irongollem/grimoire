import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { effectScope, ref } from "vue";
import { useLootRollClock } from "./useLootRollClock";
import type { CampaignMessage, ItemDropMetadata, LootRoll } from "@/types/chat.types";

vi.mock("@/lib/observability/sentry", () => ({ reportHandledError: vi.fn() }));

const NOW = new Date("2026-11-01T12:00:00.000Z");

function drop(id: string, roll: Partial<LootRoll> | undefined): CampaignMessage {
  const metadata = {
    item_name: "Sword",
    quantity: 1,
    ...(roll
      ? { roll: { seconds: 30, closes_at: new Date(NOW.getTime() + 30_000).toISOString(), entries: [], resolved_at: null, outcome: null, ...roll } }
      : {}),
  } as ItemDropMetadata;
  return { id, type: "item_drop", metadata } as unknown as CampaignMessage;
}

function resolved(): ItemDropMetadata {
  return { roll: { resolved_at: NOW.toISOString(), outcome: "unclaimed" } } as unknown as ItemDropMetadata;
}
function stillOpen(): ItemDropMetadata {
  return { roll: { resolved_at: null, outcome: null } } as unknown as ItemDropMetadata;
}

describe("useLootRollClock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it("calls resolve once the deadline has passed, not before", async () => {
    const resolve = vi.fn().mockResolvedValue(resolved());
    const scope = effectScope();
    scope.run(() => useLootRollClock(ref([drop("a", {})]), resolve));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(resolve).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(300);
    expect(resolve).toHaveBeenCalledExactlyOnceWith("a");
    scope.stop();
  });

  it("resolves a roll that is already past due straight away", async () => {
    const resolve = vi.fn().mockResolvedValue(resolved());
    const past = new Date(NOW.getTime() - 5000).toISOString();
    const scope = effectScope();
    scope.run(() => useLootRollClock(ref([drop("a", { closes_at: past })]), resolve));
    await vi.advanceTimersByTimeAsync(0);
    expect(resolve).toHaveBeenCalledOnce();
    scope.stop();
  });

  it("ignores drops with no roll and rolls that already resolved", async () => {
    const resolve = vi.fn().mockResolvedValue(resolved());
    const scope = effectScope();
    scope.run(() => useLootRollClock(ref([drop("a", undefined), drop("b", { resolved_at: NOW.toISOString() })]), resolve));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(resolve).not.toHaveBeenCalled();
    scope.stop();
  });

  it("retries every 2s while the server still says open, and stops after 5 attempts", async () => {
    const resolve = vi.fn().mockResolvedValue(stillOpen());
    const scope = effectScope();
    scope.run(() => useLootRollClock(ref([drop("a", {})]), resolve));
    await vi.advanceTimersByTimeAsync(30_300);
    expect(resolve).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(resolve).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(resolve).toHaveBeenCalledTimes(5);
    scope.stop();
  });

  it("does not schedule a message twice when the list changes", async () => {
    const resolve = vi.fn().mockResolvedValue(resolved());
    const messages = ref([drop("a", {})]);
    const scope = effectScope();
    scope.run(() => useLootRollClock(messages, resolve));
    messages.value = [...messages.value, drop("x", undefined)];
    await vi.advanceTimersByTimeAsync(0);
    messages.value = [...messages.value, drop("y", undefined)];
    await vi.advanceTimersByTimeAsync(31_000);
    expect(resolve).toHaveBeenCalledOnce();
    scope.stop();
  });

  it("clears the timer when the roll resolves elsewhere first", async () => {
    const resolve = vi.fn().mockResolvedValue(resolved());
    const messages = ref([drop("a", {})]);
    const scope = effectScope();
    scope.run(() => useLootRollClock(messages, resolve));
    messages.value = [drop("a", { resolved_at: NOW.toISOString(), outcome: "unclaimed" })];
    await vi.advanceTimersByTimeAsync(60_000);
    expect(resolve).not.toHaveBeenCalled();
    scope.stop();
  });

  it("clears every timer when the scope is disposed", async () => {
    const resolve = vi.fn().mockResolvedValue(resolved());
    const scope = effectScope();
    scope.run(() => useLootRollClock(ref([drop("a", {})]), resolve));
    scope.stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(resolve).not.toHaveBeenCalled();
  });
});
