import { mount, flushPromises } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/composables/party/useParty", async () => {
  const { ref } = await import("vue");
  return { useParty: () => ({ data: ref([{ id: "pm1", name: "Brienne" }, { id: "pm2", name: "Tarn" }]) }) };
});

import LootDropChoiceDialog from "./LootDropChoiceDialog.vue";
import { useLootDropChoice } from "@/composables/campaign/useLootDropChoice";
import type { LootDropChoice } from "@/types/chat.types";

let wrapper: ReturnType<typeof mountDialog> | null = null;
function mountDialog() {
  return mount(LootDropChoiceDialog, { attachTo: document.body });
}
afterEach(() => {
  useLootDropChoice().resolve(null);
  wrapper?.unmount();
  wrapper = null;
});

async function open(): Promise<{ answer: Promise<LootDropChoice | null> }> {
  wrapper = mountDialog();
  const answer = useLootDropChoice().ask("Rope");
  await flushPromises();
  return { answer };
}
const button = (text: string) =>
  Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent?.includes(text));

describe("LootDropChoiceDialog", () => {
  it("picking Give to and then a character answers with that character's id", async () => {
    const { answer } = await open();
    button("Give to")?.click();
    await flushPromises();
    button("Tarn")?.click();
    await expect(answer).resolves.toEqual({ mode: "give", partyMemberId: "pm2" });
  });

  it("Give to alone does not answer until a character is picked", async () => {
    const { answer } = await open();
    button("Give to")?.click();
    await flushPromises();
    const settled = vi.fn();
    void answer.then(settled);
    await flushPromises();
    expect(settled).not.toHaveBeenCalled();
  });

  it("Cancel answers null so the drop is not posted", async () => {
    const { answer } = await open();
    button("Cancel")?.click();
    await expect(answer).resolves.toBeNull();
  });
});
