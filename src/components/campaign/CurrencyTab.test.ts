import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { reactive, ref } from "vue";
import CurrencyTab from "./CurrencyTab.vue";
import type { CurrencyConfig } from "@/lib/currency/currency";

/** A non-5e currency, so nothing here can pass on hard-coded gold and silver. */
const DOLLARS: CurrencyConfig = {
  default_key: "usd",
  denominations: [
    { key: "usd", name: "Dollar", abbr: "$", value: 100, color: "#22aa44", makes_change: true },
    { key: "bit", name: "Bit", abbr: "bt", value: 25, color: "#aaaaaa", makes_change: false },
    { key: "cent", name: "Cent", abbr: "c", value: 1, color: "#b87333", makes_change: true },
  ],
};

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  confirm: vi.fn(),
  success: vi.fn(),
  store: { activeCampaign: null as unknown, switchToCampaign: vi.fn() as unknown },
}));

vi.mock("@/composables/campaign/useCampaigns", () => ({
  useUpdateCampaign: () => ({ mutateAsync: mocks.update, isPending: ref(false) }),
}));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: mocks.confirm }) }));
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ success: mocks.success, error: vi.fn(), fromError: () => "failed" }),
}));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => mocks.store }));

function mountTab() {
  return mount(CurrencyTab, { global: { stubs: { CoinAmount: { props: ["coins"], template: "<i>{{ JSON.stringify(coins) }}</i>" } } } });
}

async function saveButton(w: ReturnType<typeof mountTab>) {
  return w.findAll("button").find((b) => b.text().includes("Save coins"))!;
}

beforeEach(() => {
  mocks.update.mockReset();
  mocks.confirm.mockReset();
  mocks.success.mockReset();
  const campaign = reactive({ id: "c1", currency: structuredClone(DOLLARS) });
  mocks.store = { activeCampaign: campaign, switchToCampaign: vi.fn() };
  mocks.update.mockImplementation(async ({ update }) => ({ ...campaign, ...update }));
});

describe("CurrencyTab", () => {
  it("saves nothing when the confirmation for a removed coin is cancelled", async () => {
    mocks.confirm.mockResolvedValue(false);
    const w = mountTab();
    // Remove the Bit (second row), then give the Dollar row a new worth so the draft is dirty and valid.
    await w.findAll("button").filter((b) => b.text() === "Remove")[1].trigger("click");
    await (await saveButton(w)).trigger("click");
    await flushPromises();
    expect(mocks.confirm).toHaveBeenCalledOnce();
    expect(mocks.confirm.mock.calls[0][0]).toContain("Removing Bit converts");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("saves the remaining coins after a confirmed removal", async () => {
    mocks.confirm.mockResolvedValue(true);
    const w = mountTab();
    await w.findAll("button").filter((b) => b.text() === "Remove")[1].trigger("click");
    await (await saveButton(w)).trigger("click");
    await flushPromises();
    const sent = mocks.update.mock.calls[0][0].update.currency as CurrencyConfig;
    expect(sent.denominations.map((d) => d.key)).toEqual(["usd", "cent"]);
  });

  it("cannot save an invalid draft", async () => {
    const w = mountTab();
    const abbr = w.findAll("input").find((i) => (i.element as HTMLInputElement).value === "bt")!;
    await abbr.setValue("c"); // collides with the Cent
    expect(w.text()).toContain("is used twice");
    const save = await saveButton(w);
    expect(save.attributes("disabled")).toBeDefined();
    await save.trigger("click");
    await flushPromises();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("keeps a renamed coin's key, so purses keep their coins", async () => {
    const w = mountTab();
    const abbr = w.findAll("input").find((i) => (i.element as HTMLInputElement).value === "bt")!;
    await abbr.setValue("qt");
    await (await saveButton(w)).trigger("click");
    await flushPromises();
    const sent = mocks.update.mock.calls[0][0].update.currency as CurrencyConfig;
    expect(sent.denominations.find((d) => d.abbr === "qt")?.key).toBe("bit");
    expect(mocks.confirm).not.toHaveBeenCalled();
  });

  it("derives a new coin's key from its abbreviation, suffixed when taken", async () => {
    const w = mountTab();
    const add = async (abbr: string, value: number) => {
      await w.findAll("button").find((b) => b.text().includes("Add a coin"))!.trigger("click");
      const inputs = w.findAll("input");
      // The last row's fields: name, abbr, worth (the colour and checkbox follow).
      const row = inputs.slice(-5);
      await row[0].setValue(`Coin ${abbr}`);
      await row[1].setValue(abbr);
      await row[2].setValue(String(value));
    };
    await add("Cent", 500);
    await add("Cent.", 1000);
    await (await saveButton(w)).trigger("click");
    await flushPromises();
    const keys = (mocks.update.mock.calls[0][0].update.currency as CurrencyConfig).denominations.map((d) => d.key);
    // Highest first on save; the existing key "cent" is taken, so the new coins get suffixes.
    expect(keys).toEqual(["cent3", "cent2", "usd", "bit", "cent"]);
  });

  it("offers only existing coins as the default", () => {
    const w = mountTab();
    const options = w.findAll("select option").map((o) => o.text());
    expect(options).toEqual(["Dollar", "Bit", "Cent"]);
  });
});
