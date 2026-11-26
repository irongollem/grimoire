import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";
import { mount } from "@vue/test-utils";
import { canonEntry } from "@/test/canonEntry";
import type { CanonEntry } from "@/types/canon.types";

const mocks = vi.hoisted(() => ({ connect: vi.fn(), disconnect: vi.fn() }));
const entries = ref<CanonEntry[]>([]);
const links = ref<Record<string, unknown>[]>([]);
vi.mock("@/composables/canon/useCanonEntries", () => ({ useCanonEntries: () => ({ data: entries }) }));
vi.mock("@/composables/connections/useConnections", () => ({
  useCampaignLinks: () => ({ data: links }),
  useCreateConnection: () => ({ mutate: mocks.connect }),
  useRemoveConnection: () => ({ mutate: mocks.disconnect }),
}));

import EntryStoryLinks from "./EntryStoryLinks.vue";

const link = (type: string, from: string, to: string, id = `${type}-${from}-${to}`) => ({ id, type, from_kind: "canon", from_id: from, to_kind: "canon", to_id: to });
const EntityComboboxStub = { name: "EntityCombobox", props: ["modelValue", "options", "placeholder"], emits: ["update:modelValue"], template: "<div />" };
const RouterLink = { props: ["to"], template: "<a :data-to='JSON.stringify(to)'><slot /></a>" };
const mountFor = (entry: CanonEntry) => mount(EntryStoryLinks, { props: { entry }, global: { stubs: { EntityCombobox: EntityComboboxStub, RouterLink } } });
const comboboxes = (w: ReturnType<typeof mountFor>, placeholder: string) => w.findAllComponents(EntityComboboxStub).filter((c) => c.props("placeholder") === placeholder);
const texts = (w: ReturnType<typeof mountFor>, testid: string) => w.findAll(`[data-testid=${testid}]`).map((a) => a.text());

describe("EntryStoryLinks", () => {
  const me = canonEntry({ id: "me", title: "The flood", part: "truth" });
  beforeEach(() => {
    mocks.connect.mockReset();
    mocks.disconnect.mockReset();
    entries.value = [
      me,
      canonEntry({ id: "cause", title: "The dam broke", part: "truth" }),
      canonEntry({ id: "effect", title: "The town moved", part: "truth" }),
      canonEntry({ id: "was-secret", title: "The dam was rotten", part: "secret" }),
      canonEntry({ id: "t1", title: "Debts are owed", part: "premise", premise_kind: "theme" }),
      canonEntry({ id: "t2", title: "Water remembers", part: "premise", premise_kind: "theme" }),
      canonEntry({ id: "v1", title: "A veil", part: "premise", premise_kind: "veil" }),
    ];
    links.value = [];
  });

  // Bug caught: only one direction of led_to read, so "Because of" shows what the entry led to (or nothing).
  it("shows led_to links in both directions: what came before as Because of, what followed as Led to", () => {
    links.value = [link("led_to", "cause", "me"), link("led_to", "me", "effect")];
    const w = mountFor(me);
    expect(texts(w, "story-because-item")).toEqual(["The dam broke"]);
    expect(texts(w, "story-led-to-item")).toEqual(["The town moved"]);
  });

  // Bug caught: the became pointer ignored, so a truth made from a secret says nothing of where it came from.
  it("counts became_entry_id as a led_to: the entry that became this one is a cause", () => {
    entries.value = entries.value.map((e) => (e.id === "was-secret" ? { ...e, became_entry_id: "me" } : e));
    expect(texts(mountFor(me), "story-because-item")).toEqual(["The dam was rotten"]);
  });

  it("counts this entry's own became_entry_id as what it led to", () => {
    const w = mountFor({ ...entries.value[3]!, became_entry_id: "me" });
    expect(texts(w, "story-led-to-item")).toEqual(["The flood"]);
  });

  // Bug caught: the same entry listed twice when it has both the link and the pointer (the writer makes both).
  it("lists an entry once when both the link and the pointer say it", () => {
    entries.value = entries.value.map((e) => (e.id === "was-secret" ? { ...e, became_entry_id: "me" } : e));
    links.value = [link("led_to", "was-secret", "me")];
    expect(texts(mountFor(me), "story-because-item")).toEqual(["The dam was rotten"]);
  });

  // Bug caught: a link of another type (related_to, carries) read as cause and effect.
  it("ignores links that are not led_to, and links to something other than canon", () => {
    links.value = [link("related_to", "cause", "me"), { ...link("led_to", "x", "me"), from_kind: "npc" }];
    expect(mountFor(me).find("[data-testid=story-because]").exists()).toBe(false);
  });

  // Bug caught: empty headings drawn ("Because of" with nothing under it).
  it("hides a heading with nothing under it", () => {
    const w = mountFor(me);
    expect(w.find("[data-testid=story-because]").exists()).toBe(false);
    expect(w.find("[data-testid=story-led-to]").exists()).toBe(false);
    expect(w.find("[data-testid=story-carries]").exists()).toBe(true);
  });

  // Bug caught: a trashed entry's id rendered as a blank link.
  it("leaves out an entry that is no longer in the canon", () => {
    links.value = [link("led_to", "gone", "me"), link("led_to", "cause", "me")];
    expect(texts(mountFor(me), "story-because-item")).toEqual(["The dam broke"]);
  });

  describe("Cause and effect", () => {
    // Bug caught (#1279 item 9): a truth-to-truth led_to tie had no remove, so one made by mistake was stuck.
    it("removes a led_to row by the link's id, in either direction", async () => {
      links.value = [link("led_to", "cause", "me", "l-cause"), link("led_to", "me", "effect", "l-effect"), link("led_to", "cause", "effect", "l-other")];
      const w = mountFor(me);
      const removes = w.findAll("[data-testid=story-remove]");
      expect(removes).toHaveLength(2);
      await removes[0]!.trigger("click");
      await removes[1]!.trigger("click");
      expect(mocks.disconnect.mock.calls.map((c) => c[0].connection)).toMatchObject([
        { source: "link", row_id: "l-cause", type: "led_to", outward: false, other_id: "cause" },
        { source: "link", row_id: "l-effect", type: "led_to", outward: true, other_id: "effect" },
      ]);
    });

    // Bug caught: the entry's own became pointer offered a remove, which would delete a link that is not there.
    it("leaves a row that is only the became pointer without a remove", () => {
      entries.value = entries.value.map((e) => (e.id === "was-secret" ? { ...e, became_entry_id: "me" } : e));
      const w = mountFor(me);
      expect(texts(w, "story-because-item")).toEqual(["The dam was rotten"]);
      expect(w.find("[data-testid=story-remove]").exists()).toBe(false);
    });

    // Bug caught: a cause written the wrong way round (this entry as the cause of the picked one).
    it("adds a cause as a led_to with this entry at the to end", async () => {
      const w = mountFor(me);
      comboboxes(w, "Add a cause…")[0]!.vm.$emit("update:modelValue", "cause");
      await nextTick();
      expect(mocks.connect).toHaveBeenCalledOnce();
      const arg = mocks.connect.mock.calls[0]![0];
      expect(arg.subject).toEqual({ kind: "canon", id: "me" });
      expect(arg.other).toMatchObject({ kind: "canon", id: "cause" });
      expect(arg.choice).toMatchObject({ key: "led_to", subjectIsFrom: false });
    });

    // Bug caught: an effect written as a cause.
    it("adds an effect as a led_to with this entry at the from end", async () => {
      const w = mountFor(me);
      comboboxes(w, "Add an effect…")[0]!.vm.$emit("update:modelValue", "effect");
      await nextTick();
      expect(mocks.connect.mock.calls[0]![0].choice).toMatchObject({ key: "led_to", subjectIsFrom: true });
    });

    // Bug caught: the pickers offering the entry itself, a premise line, or what is already tied that way.
    it("offers neither this entry, nor premise lines, nor one already a cause", () => {
      links.value = [link("led_to", "cause", "me")];
      const w = mountFor(me);
      const ids = (p: string) => comboboxes(w, p)[0]!.props("options").map((o: { id: string }) => o.id);
      expect(ids("Add a cause…")).toEqual(["effect", "was-secret"]);
      expect(ids("Add an effect…")).toEqual(["cause", "effect", "was-secret"]);
    });

    // Bug caught: a premise line offered cause and effect pickers.
    it("has no cause or effect picker on a premise entry", () => {
      const w = mountFor(entries.value[4]!);
      expect(comboboxes(w, "Add a cause…")).toHaveLength(0);
    });
  });

  describe("Carries", () => {
    // Bug caught: the picker offering veils and non-premise entries, which cannot be themes.
    it("offers only theme lines, and not one already carried", () => {
      links.value = [link("carries", "me", "t1")];
      const options = comboboxes(mountFor(me), "Carries a theme…")[0]!.props("options");
      expect(options).toEqual([{ id: "t2", name: "Water remembers" }]);
    });

    // Bug caught: the link written the wrong way round (theme carries entry) or with the wrong type.
    it("adds a carries link from this entry to the theme picked", async () => {
      const w = mountFor(me);
      comboboxes(w, "Carries a theme…")[0]!.vm.$emit("update:modelValue", "t2");
      await nextTick();
      expect(mocks.connect).toHaveBeenCalledOnce();
      const arg = mocks.connect.mock.calls[0]![0];
      expect(arg.subject).toEqual({ kind: "canon", id: "me" });
      expect(arg.other).toMatchObject({ kind: "canon", id: "t2", name: "Water remembers" });
      expect(arg.choice).toMatchObject({ key: "carries", subjectIsFrom: true });
    });

    // Bug caught: removing the wrong link (by theme id) or another entry's carries of the same theme.
    it("removes this entry's own carries link, by the link's id", async () => {
      links.value = [link("carries", "other", "t1", "l-other"), link("carries", "me", "t1", "l-mine")];
      const w = mountFor(me);
      expect(texts(w, "story-carries-item")).toEqual(["Debts are owed"]);
      await w.get("[data-testid=story-carries] button").trigger("click");
      expect(mocks.disconnect).toHaveBeenCalledOnce();
      expect(mocks.disconnect.mock.calls[0]![0].connection).toMatchObject({ source: "link", row_id: "l-mine", type: "carries" });
    });

    // Bug caught: a premise entry offered a carries picker, though a premise entry never carries a theme.
    it("is absent on a premise entry", () => {
      const w = mountFor(entries.value[4]!);
      expect(w.find("[data-testid=story-carries]").exists()).toBe(false);
      expect(w.findComponent(EntityComboboxStub).exists()).toBe(false);
    });
  });
});
