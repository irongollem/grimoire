import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import NpcMemoryForm, { type NpcMemoryDraft } from "./NpcMemoryForm.vue";
import type { CampaignSecret, NpcMemory } from "@/types/npcMemory.types";

const secrets = ref<CampaignSecret[]>([]);
vi.mock("@/composables/npcs/useCampaignSecrets", () => ({
  useCampaignSecrets: () => ({ data: secrets, isSuccess: ref(true) }),
}));
vi.mock("@/composables/sessions/useCampaignSessions", () => ({ useCampaignSessions: () => ({ data: ref([]) }) }));
vi.mock("@/composables/campaign/useCampaignSession", () => ({ useCampaignSession: () => ({ session: ref(null), isRunning: ref(false) }) }));
vi.mock("vue-router", () => ({ RouterLink: { props: ["to"], template: "<a><slot /></a>" } }));

const secret: CampaignSecret = {
  entity_type: "location",
  entity_id: "loc1",
  entity_name: "The Chapel",
  field: "description",
  secret_id: "sec1",
  excerpt: "The bell is hollow",
};

beforeEach(() => {
  secrets.value = [];
});

describe("NpcMemoryForm secret picker", () => {
  it("hides the button when the campaign has no secrets", () => {
    const w = mount(NpcMemoryForm, { props: { members: [], save: vi.fn() } });
    expect(w.find('[data-testid="npc-memory-secret-open"]').exists()).toBe(false);
  });

  it("sends the three fields for a picked secret and clears them after an add", async () => {
    secrets.value = [secret];
    const save = vi.fn<(d: NpcMemoryDraft) => Promise<boolean>>().mockResolvedValue(true);
    const w = mount(NpcMemoryForm, { props: { members: [], save }, attachTo: document.body });
    await w.get('[data-testid="npc-memory-secret-open"]').trigger("click");
    const input = w.get('input[data-field="combobox"]');
    await input.trigger("focus");
    await flushPromises();
    const option = document.body.querySelector("ul[data-slip] li");
    expect(option?.textContent).toContain("Location · The Chapel");
    option?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    await flushPromises();
    expect(w.get('[data-testid="npc-memory-secret"]').text()).toContain("The bell is hollow");

    await w.get('[data-testid="npc-memory-body"]').setValue("Let slip the bell");
    await w.get("form").trigger("submit");
    await flushPromises();
    expect(save.mock.calls[0][0]).toMatchObject({ secret_entity_type: "location", secret_entity_id: "loc1", secret_id: "sec1" });
    expect(w.find('[data-testid="npc-memory-secret"]').exists()).toBe(false);
    w.unmount();
  });

  it("sends nulls once an edited line's secret is cleared", async () => {
    secrets.value = [secret];
    const save = vi.fn<(d: NpcMemoryDraft) => Promise<boolean>>().mockResolvedValue(true);
    const initial = {
      kind: "revealed",
      body: "Let slip the bell",
      session_id: null,
      party_member_ids: [],
      player_visible_to: [],
      secret_entity_type: "location",
      secret_entity_id: "loc1",
      secret_id: "sec1",
    } as unknown as NpcMemory;
    const w = mount(NpcMemoryForm, { props: { members: [], initial, save } });
    expect(w.get('[data-testid="npc-memory-secret"]').text()).toContain("The Chapel");
    await w.get('[data-testid="npc-memory-secret-clear"]').trigger("click");
    await w.get("form").trigger("submit");
    await flushPromises();
    expect(save.mock.calls[0][0]).toMatchObject({ secret_entity_type: null, secret_entity_id: null, secret_id: null });
  });
});

describe("NpcMemoryForm saving", () => {
  const members = [
    { id: "m1", name: "Aria" },
    { id: "m2", name: "Brom" },
  ];
  function mountForm(save: (d: NpcMemoryDraft) => Promise<boolean>, extra: Partial<{ initial: NpcMemory }> = {}) {
    return mount(NpcMemoryForm, { props: { members, save, ...extra } });
  }
  async function submit(w: ReturnType<typeof mountForm>, text: string) {
    await w.get('[data-testid="npc-memory-body"]').setValue(text);
    await w.get("form").trigger("submit");
    await flushPromises();
  }
  const chip = (w: ReturnType<typeof mountForm>, name: string) => w.findAll("button").find((b) => b.text() === name);
  const sharedBox = (w: ReturnType<typeof mountForm>) => w.get('input[type="checkbox"]');

  it("trims the body it saves", async () => {
    const save = vi.fn<(d: NpcMemoryDraft) => Promise<boolean>>().mockResolvedValue(true);
    const w = mountForm(save);
    await submit(w, "  told the guard  ");
    expect(save.mock.calls[0][0].body).toBe("told the guard");
  });

  it("does not save a blank body", async () => {
    const save = vi.fn<(d: NpcMemoryDraft) => Promise<boolean>>().mockResolvedValue(true);
    const w = mountForm(save);
    await submit(w, "   ");
    expect(save).not.toHaveBeenCalled();
  });

  it("clears the body after an add that went through, and keeps it when the save failed", async () => {
    const save = vi.fn<(d: NpcMemoryDraft) => Promise<boolean>>().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const w = mountForm(save);
    await submit(w, "first");
    expect((w.get('[data-testid="npc-memory-body"]').element as HTMLInputElement).value).toBe("first");
    await w.get("form").trigger("submit");
    await flushPromises();
    expect((w.get('[data-testid="npc-memory-body"]').element as HTMLInputElement).value).toBe("");
  });

  it("keeps the body of an edited line after saving", async () => {
    const save = vi.fn<(d: NpcMemoryDraft) => Promise<boolean>>().mockResolvedValue(true);
    const initial = {
      kind: "revealed",
      body: "old",
      session_id: null,
      party_member_ids: [],
      player_visible_to: [],
      secret_entity_type: null,
      secret_entity_id: null,
      secret_id: null,
    } as unknown as NpcMemory;
    const w = mountForm(save, { initial });
    await submit(w, "fixed typo");
    expect((w.get('[data-testid="npc-memory-body"]').element as HTMLInputElement).value).toBe("fixed typo");
  });

  it("disables the submit button while the save is pending, so a double click saves once", async () => {
    let finish: (ok: boolean) => void = () => undefined;
    const save = vi.fn<(d: NpcMemoryDraft) => Promise<boolean>>().mockReturnValue(
      new Promise<boolean>((resolve) => {
        finish = resolve;
      }),
    );
    const w = mountForm(save);
    await w.get('[data-testid="npc-memory-body"]').setValue("once");
    await w.get("form").trigger("submit");
    await w.get("form").trigger("submit");
    expect(save).toHaveBeenCalledTimes(1);
    expect(w.get('button[type="submit"]').attributes("disabled")).toBeDefined();
    finish(false);
    await flushPromises();
    expect(w.get('button[type="submit"]').attributes("disabled")).toBeUndefined();
  });

  it("shows nothing to players unless the share box is ticked", async () => {
    const save = vi.fn<(d: NpcMemoryDraft) => Promise<boolean>>().mockResolvedValue(true);
    const w = mountForm(save);
    await chip(w, "Aria")?.trigger("click");
    await submit(w, "private");
    expect(save.mock.calls[0][0].player_visible_to).toEqual([]);
    expect(save.mock.calls[0][0].party_member_ids).toEqual(["m1"]);
  });

  it("shares with the whole party when nobody is marked present, and only the marked when some are", async () => {
    const save = vi.fn<(d: NpcMemoryDraft) => Promise<boolean>>().mockResolvedValue(true);
    const w = mountForm(save);
    await sharedBox(w).setValue(true);
    await submit(w, "to all");
    expect(save.mock.calls[0][0].player_visible_to).toEqual(["m1", "m2"]);
    await chip(w, "Brom")?.trigger("click");
    await submit(w, "to Brom");
    expect(save.mock.calls[1][0].player_visible_to).toEqual(["m2"]);
  });

  it("unmarking a present member removes them from the line", async () => {
    const save = vi.fn<(d: NpcMemoryDraft) => Promise<boolean>>().mockResolvedValue(true);
    const w = mountForm(save);
    await chip(w, "Aria")?.trigger("click");
    await chip(w, "Aria")?.trigger("click");
    await submit(w, "nobody");
    expect(save.mock.calls[0][0].party_member_ids).toEqual([]);
  });

  it("an edit keeps a line's exact audience until the DM touches who was there or the share box", async () => {
    const save = vi.fn<(d: NpcMemoryDraft) => Promise<boolean>>().mockResolvedValue(true);
    const initial = {
      kind: "revealed",
      body: "typo",
      session_id: null,
      party_member_ids: ["m1", "m2"],
      player_visible_to: ["m1"],
      secret_entity_type: null,
      secret_entity_id: null,
      secret_id: null,
    } as unknown as NpcMemory;
    const w = mountForm(save, { initial });
    await submit(w, "fixed");
    expect(save.mock.calls[0][0].player_visible_to).toEqual(["m1"]);
    await chip(w, "Aria")?.trigger("click");
    await submit(w, "fixed again");
    expect(save.mock.calls[1][0].player_visible_to).toEqual(["m2"]);
  });
});
