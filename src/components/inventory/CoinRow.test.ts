import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import CoinRow from "./CoinRow.vue";

const row = (value = 3) => mount(CoinRow, { props: { label: "Gold", symbol: "gp", color: "#d4af37", value } });

describe("CoinRow", () => {
  it("emits the signed delta of a +/- click, not the new total (a total would overwrite a coin credited meanwhile)", async () => {
    const wrapper = row();
    const [minus, plus] = wrapper.findAll("button");
    await plus.trigger("click");
    await minus.trigger("click");
    expect(wrapper.emitted("adjust")).toEqual([[1], [-1]]);
    expect(wrapper.emitted("set")).toBeUndefined();
  });

  it("sends nothing for a minus on an empty coin", async () => {
    const wrapper = row(0);
    await wrapper.findAll("button")[0].trigger("click");
    expect(wrapper.emitted("adjust")).toBeUndefined();
  });

  it("emits a whole, non-negative count when a value is typed", async () => {
    const wrapper = row();
    const input = wrapper.find("input");
    await input.setValue("-4.7");
    await input.trigger("change");
    expect(wrapper.emitted("set")).toEqual([[0]]);
  });
});

describe("CoinRow buttons", () => {
  it("names each icon-only button, so a screen reader says which coin it changes (bug: both announced as blank buttons)", () => {
    const w = row();
    expect(w.find('[aria-label="Add one Gold"]').exists()).toBe(true);
    expect(w.find('[aria-label="Remove one Gold"]').exists()).toBe(true);
  });
});
