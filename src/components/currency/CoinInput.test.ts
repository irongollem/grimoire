import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import CoinInput from "./CoinInput.vue";
import type { Coins, CurrencyConfig } from "@/lib/currency/currency";

const dollars: CurrencyConfig = {
  default_key: "c",
  denominations: [
    { key: "d", name: "Dollar", abbr: "$", value: 100, color: "#22aa44", makes_change: true },
    { key: "c", name: "Cent", abbr: "c", value: 1, color: "#aa2244", makes_change: true },
  ],
};

function mountInput(modelValue: Coins, extra: Record<string, unknown> = {}) {
  return mount(CoinInput, {
    props: { modelValue, currency: dollars, ...extra, "onUpdate:modelValue": () => {} } as never,
  });
}
async function type(w: ReturnType<typeof mountInput>, label: string, value: string) {
  const input = w.find(`input[aria-label="${label}"]`);
  await input.setValue(value);
  const events = w.emitted("update:modelValue") ?? [];
  return { input, last: events[events.length - 1]?.[0] as Coins | undefined };
}

beforeEach(() => setActivePinia(createPinia()));

describe("CoinInput", () => {
  // Fails on a hard-coded 5e list.
  it("renders one labelled field per denomination of the given currency", () => {
    const w = mountInput({});
    expect(w.findAll("input").map((i) => i.attributes("aria-label"))).toEqual(["Dollar", "Cent"]);
  });

  // Fails if the existing counts are not shown.
  it("shows current counts, 0 for absent keys", () => {
    const w = mountInput({ d: 4 });
    expect(w.findAll("input").map((i) => (i.element as HTMLInputElement).value)).toEqual(["4", "0"]);
  });

  // Fails if a zero is emitted as an entry ({d: 5, c: 0}).
  it("drops zero entries from the emitted model", async () => {
    const w = mountInput({ d: 5, c: 7 });
    const { last } = await type(w, "Cent", "0");
    expect(last).toEqual({ d: 5 });
  });

  // Fails if clearing the field emits NaN/null instead of removing the key.
  it("treats an empty field as 0", async () => {
    const w = mountInput({ d: 5 });
    const { last } = await type(w, "Dollar", "");
    expect(last).toEqual({});
  });

  // Fails if a negative count is stored.
  it("clamps negatives to 0 and corrects the field", async () => {
    const w = mountInput({ d: 5 });
    const { input, last } = await type(w, "Dollar", "-3");
    expect(last).toEqual({});
    expect((input.element as HTMLInputElement).value).toBe("0");
  });

  // Fails if a fractional count is stored.
  it("floors fractions", async () => {
    const w = mountInput({});
    const { input, last } = await type(w, "Cent", "2.9");
    expect(last).toEqual({ c: 2 });
    expect((input.element as HTMLInputElement).value).toBe("2");
  });

  // Fails if max is ignored (giving more than held).
  it("caps each denomination at max", async () => {
    const w = mountInput({}, { max: { d: 3 } });
    const { input, last } = await type(w, "Dollar", "9");
    expect(last).toEqual({ d: 3 });
    expect((input.element as HTMLInputElement).value).toBe("3");
  });

  // Fails if a denomination absent from max is treated as capped at 0 or uncapped wrongly.
  it("leaves denominations missing from max uncapped", async () => {
    const w = mountInput({}, { max: { d: 3 } });
    const { last } = await type(w, "Cent", "99");
    expect(last).toEqual({ c: 99 });
  });

  // Fails if disabled is not forwarded.
  it("disables every field", () => {
    expect(mountInput({}, { disabled: true }).findAll("input").every((i) => i.attributes("disabled") !== undefined)).toBe(true);
  });
});
