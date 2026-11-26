import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import CanonCampaignSearch from "./CanonCampaignSearch.vue";

const Results = { name: "CanonCampaignResults", props: ["query"], template: "<div data-testid='results' />" };
const mountRow = (query = "tide") => mount(CanonCampaignSearch, { props: { query }, global: { stubs: { CanonCampaignResults: Results } } });

describe("CanonCampaignSearch", () => {
  // Bug caught (#1279 item 24): the whole-campaign read firing for every canon search, or the row not naming the words searched.
  it("names the words and reads nothing until it is opened", async () => {
    const w = mountRow();
    expect(w.text()).toContain("Search the whole campaign for “tide”");
    expect(w.find("[data-testid=results]").exists()).toBe(false);
    await w.get("[data-testid=campaign-search-open]").trigger("click");
    expect(w.find("[data-testid=results]").exists()).toBe(true);
  });

  // Bug caught: last search's wider results staying open under a new query.
  it("closes again when the words change", async () => {
    const w = mountRow();
    await w.get("[data-testid=campaign-search-open]").trigger("click");
    await w.setProps({ query: "mill" });
    expect(w.find("[data-testid=results]").exists()).toBe(false);
  });
});
