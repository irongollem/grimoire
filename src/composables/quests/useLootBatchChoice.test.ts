import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLootBatchChoice } from "./useLootBatchChoice";

const mocks = vi.hoisted(() => ({ ask: vi.fn(), asks: undefined as unknown as { value: boolean } }));
vi.mock("@/composables/campaign/useLootDropChoice", async () => {
  const { ref: r } = await import("vue");
  mocks.asks = r(true);
  return { useLootDropChoice: () => ({ ask: mocks.ask }), useLootDropPolicy: () => ({ asks: mocks.asks }) };
});

const item = [{ kind: "item" as const, label: "Moon key" }];
const coins = [{ kind: "currency" as const, label: "Purse" }];

beforeEach(() => { mocks.ask.mockReset(); mocks.asks.value = true; });

describe("useLootBatchChoice", () => {
  it("asks with the entries' names when the rule is on and an item is in the batch", async () => {
    mocks.ask.mockResolvedValue({ mode: "free" });
    expect(await useLootBatchChoice().answerFor(item)).toEqual({ cancelled: false, choice: { mode: "free" } });
    expect(mocks.ask).toHaveBeenCalledWith("Moon key");
  });

  it("reports a cancelled question as cancelled (fails if null is treated as 'send as before')", async () => {
    mocks.ask.mockResolvedValue(null);
    expect(await useLootBatchChoice().answerFor(item)).toEqual({ cancelled: true });
  });

  it.each([
    ["the rule is off", item, false],
    ["the batch is only coins", coins, true],
  ])("does not ask when %s (fails if the question appears with nothing to decide)", async (_name, entries, asks) => {
    mocks.asks.value = asks;
    expect(await useLootBatchChoice().answerFor(entries)).toEqual({ cancelled: false });
    expect(mocks.ask).not.toHaveBeenCalled();
  });
});
