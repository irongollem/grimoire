import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { ref } from "vue";
import type { SecretBeat } from "@/composables/canon/useSecretBeats";

const beats = ref<SecretBeat[] | undefined>([]);
const asked = vi.hoisted(() => ({ ids: [] as string[] }));
vi.mock("@/composables/canon/useSecretBeats", () => ({
  useSecretBeats: (id: () => string) => {
    asked.ids.push(id());
    return { data: beats };
  },
}));
vi.mock("@/composables/quests/useQuests", () => ({ useQuests: () => ({ data: ref([{ id: "q1", title: "The Flooded Mine" }]) }) }));
import SecretBeats from "./SecretBeats.vue";

const mountIt = () => mount(SecretBeats, { props: { secretId: "s1" }, global: { stubs: { RouterLink: { props: ["to"], template: "<a :href='to'><slot /></a>" } } } });

describe("SecretBeats", () => {
  // Bug caught: the block drew an empty "Beats that uncover it" heading over nothing for a secret no beat is tied to.
  it("renders nothing when no beat is tied", () => {
    beats.value = [];
    expect(mountIt().find("[data-testid=secret-beats]").exists()).toBe(false);
  });

  // Bug caught: a beat shown without its quest, or linking to the beat id instead of its quest, so the DM could not find it.
  it("lists each beat with its quest and links to the quest", () => {
    beats.value = [{ id: "b1", quest_id: "q1", title: "The sealed door" }];
    const w = mountIt();
    expect(w.text()).toContain("The sealed door");
    expect(w.text()).toContain("The Flooded Mine");
    expect(w.find("a").attributes("href")).toBe("/quests/q1");
  });

  // Bug caught: the read was asked for another secret's id, listing beats that belong to a different secret.
  it("asks for this secret's beats", () => {
    mountIt();
    expect(asked.ids).toContain("s1");
  });
});
