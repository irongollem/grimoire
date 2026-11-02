import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import CoinAmount from "./CoinAmount.vue";
import { useCampaignStore } from "@/stores/campaign";
import type { Campaign } from "@/types/campaign.types";
import type { CurrencyConfig } from "@/lib/currency/currency";

const dollars: CurrencyConfig = {
  default_key: "c",
  denominations: [
    { key: "d", name: "Dollar", abbr: "$", value: 100, color: "#22aa44", makes_change: true },
    { key: "c", name: "Cent", abbr: "c", value: 1, color: "#aa2244", makes_change: true },
  ],
};

beforeEach(() => setActivePinia(createPinia()));

describe("CoinAmount", () => {
  // Fails on a hard-coded pp/gp/ep/sp/cp list: dollars would render nothing.
  it("shows a non-5e campaign's own coins", () => {
    const text = mount(CoinAmount, { props: { coins: { d: 5, c: 30 }, currency: dollars } }).text();
    expect(text).toBe("5 $30 c");
  });

  // Fails if parts follow the map's key order instead of the currency's.
  it("lists highest value first whatever the map key order", () => {
    const parts = mount(CoinAmount, { props: { coins: { c: 3, d: 1 }, currency: dollars } }).findAll("span[title]");
    expect(parts.map((p) => p.attributes("title"))).toEqual(["Dollar", "Cent"]);
  });

  // Fails if the denomination colour is dropped or swapped.
  it("tints each part with its denomination colour", () => {
    const part = mount(CoinAmount, { props: { coins: { d: 1 }, currency: dollars } }).find("span[title]");
    expect(part.attributes("style")).toContain("#22aa44");
  });

  // Fails if a zero count renders "0 c".
  it("omits zero counts", () => {
    expect(mount(CoinAmount, { props: { coins: { d: 2, c: 0 }, currency: dollars } }).text()).toBe("2 $");
  });

  // Fails if an empty purse renders nothing or the default is wrong.
  it("shows the empty text for no coins", () => {
    expect(mount(CoinAmount, { props: { coins: {}, currency: dollars } }).text()).toBe("—");
    expect(mount(CoinAmount, { props: { coins: {}, currency: dollars, empty: "Free" } }).text()).toBe("Free");
  });

  // Fails if the component ignores the active campaign's currency when no prop is given.
  it("uses the active campaign's currency without a prop", () => {
    useCampaignStore().activeCampaign = { id: "c1", currency: dollars } as Campaign;
    expect(mount(CoinAmount, { props: { coins: { d: 2 } } }).text()).toBe("2 $");
  });
});
