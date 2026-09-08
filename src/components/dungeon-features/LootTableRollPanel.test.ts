import { mount, type VueWrapper } from "@vue/test-utils";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { LootEntry, LootTable } from "@/types/lootTable.types";
import type { Item } from "@/types/item.types";
import LootTableRollPanel from "./LootTableRollPanel.vue";

const sendLootChest = vi.fn();
vi.mock("@/composables/campaign/useCampaignMessages", () => ({
  useCampaignMessages: () => ({ sendLootChest }),
}));

// LootTableDropDialog owns file upload + AppModal/Teleport plumbing that's
// irrelevant to the panel's own logic (what it rolls, what it hands to the
// dialog, what it does when the dialog fires back) — stubbed to a plain
// element so the tests below stay focused on that logic and can drive the
// dialog's events the same way a user would, by clicking its buttons.
const LootTableDropDialogStub = {
  props: ["open", "atoms", "unresolved", "claimsDice", "chestImageUrl", "effectiveCap", "dropping"],
  emits: ["close", "drop", "reroll", "update:claimsDice", "update:chestImageUrl"],
  template: `
    <div v-if="open" data-testid="drop-dialog">
      <span data-testid="atom-count">{{ atoms.length }}</span>
      <span data-testid="effective-cap">{{ effectiveCap }}</span>
      <button @click="$emit('reroll')">reroll</button>
      <button @click="$emit('drop')">drop</button>
      <button @click="$emit('close')">close</button>
    </div>
  `,
};

function findButtonByLabel(wrapper: VueWrapper, label: string) {
  const button = wrapper.findAll("button").find((b) => b.text().includes(label));
  if (!button) throw new Error(`no button labelled "${label}" — have: ${wrapper.findAll("button").map((b) => b.text()).join(" | ")}`);
  return button;
}

function currencyEntry(overrides: Partial<LootEntry> = {}): LootEntry {
  return { id: "entry-1", type: "currency", drop_chance: 100, gp: 5, ...overrides };
}

function makeTable(overrides: Partial<LootTable> = {}): LootTable {
  return {
    id: "table-1",
    user_id: "",
    campaign_id: null,
    name: "Bandit Camp Loot",
    description: null,
    cr_tier: "any",
    entries: [],
    tags: [],
    notes: null,
    monster_ids: [],
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

function mountPanel(props: Partial<InstanceType<typeof LootTableRollPanel>["$props"]> = {}) {
  return mount(LootTableRollPanel, {
    props: {
      table: makeTable(),
      itemsById: new Map<string, Item>(),
      entriesError: null,
      isNew: false,
      summaryDropPercent: 0,
      ...props,
    },
    global: { stubs: { LootTableDropDialog: LootTableDropDialogStub } },
  });
}

beforeEach(() => {
  sendLootChest.mockReset();
  sendLootChest.mockResolvedValue(undefined);
});

describe("LootTableRollPanel", () => {
  it("disables Roll and the drop-chest action when there are no entries", () => {
    const wrapper = mountPanel({ table: makeTable({ entries: [] }) });
    expect(findButtonByLabel(wrapper, "Roll").attributes("disabled")).toBeDefined();
    expect(findButtonByLabel(wrapper, "Drop chest in chat").attributes("disabled")).toBeDefined();
  });

  it("disables Roll and the drop-chest action when entries are invalid", () => {
    const wrapper = mountPanel({
      table: makeTable({ entries: [currencyEntry()] }),
      entriesError: "Every entry needs a drop chance.",
    });
    expect(findButtonByLabel(wrapper, "Roll").attributes("disabled")).toBeDefined();
    expect(findButtonByLabel(wrapper, "Drop chest in chat").attributes("disabled")).toBeDefined();
  });

  it("hides the drop-chest-in-chat action for a table that hasn't been created yet", () => {
    const wrapper = mountPanel({ table: makeTable({ entries: [currencyEntry()] }), isNew: true });
    expect(wrapper.findAll("button").some((b) => b.text().includes("Drop chest in chat"))).toBe(false);
  });

  it("rolls the table into a Drops list", async () => {
    const wrapper = mountPanel({ table: makeTable({ entries: [currencyEntry({ gp: 5 })] }) });
    expect(wrapper.text()).not.toContain("Drops");

    await findButtonByLabel(wrapper, "Roll").trigger("click");

    expect(wrapper.text()).toContain("Drops");
    expect(wrapper.text()).toContain("5 GP");
  });

  it("opens the drop dialog pre-rolled, and re-rolls the preview on request", async () => {
    const wrapper = mountPanel({ table: makeTable({ entries: [currencyEntry()] }) });

    await findButtonByLabel(wrapper, "Drop chest in chat").trigger("click");
    expect(wrapper.get('[data-testid="drop-dialog"]')).toBeTruthy();
    expect(wrapper.get('[data-testid="atom-count"]').text()).toBe("1");

    await findButtonByLabel(wrapper, "reroll").trigger("click");
    expect(wrapper.get('[data-testid="atom-count"]').text()).toBe("1");
  });

  it("drops the rolled chest into campaign chat and closes the dialog", async () => {
    const wrapper = mountPanel({ table: makeTable({ id: "table-42", name: "Bandit Camp Loot", entries: [currencyEntry()] }) });

    await findButtonByLabel(wrapper, "Drop chest in chat").trigger("click");
    await findButtonByLabel(wrapper, "drop").trigger("click");
    await vi.waitFor(() => expect(sendLootChest).toHaveBeenCalledTimes(1));

    const metadata = sendLootChest.mock.calls[0]?.[0];
    expect(metadata).toMatchObject({
      loot_table_id: "table-42",
      loot_table_name: "Bandit Camp Loot",
      claims_total: 1,
    });
    expect(metadata.rolled_atoms).toHaveLength(1);

    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="drop-dialog"]').exists()).toBe(false);
  });

  it("closes the drop dialog without dropping when cancelled", async () => {
    const wrapper = mountPanel({ table: makeTable({ entries: [currencyEntry()] }) });

    await findButtonByLabel(wrapper, "Drop chest in chat").trigger("click");
    await findButtonByLabel(wrapper, "close").trigger("click");

    expect(wrapper.find('[data-testid="drop-dialog"]').exists()).toBe(false);
    expect(sendLootChest).not.toHaveBeenCalled();
  });
});
