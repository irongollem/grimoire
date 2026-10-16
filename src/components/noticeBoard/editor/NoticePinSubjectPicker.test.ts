// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import NoticePinSubjectPicker from "./NoticePinSubjectPicker.vue";

vi.mock("@/composables/npcs/useNpcs", () => ({
  useNpcs: () => ({ data: ref([{ id: "n1", name: "Grell Ashmantle", portrait_url: "https://example.invalid/grell.webp" }]) }),
}));
vi.mock("@/composables/monsters/useMonsterIndex", () => ({
  useMonsterIndex: () => ({ data: ref([{ id: "m1", name: "Owlbear", image_url: null }]) }),
}));

const mountPicker = () => mount(NoticePinSubjectPicker, { global: { directives: { "no-pwm": {} }, stubs: { Teleport: true } } });
const combo = (w: ReturnType<typeof mountPicker>) => w.getComponent({ name: "EntityCombobox" });

describe("NoticePinSubjectPicker", () => {
  it("lists NPCs and monsters together, each under its own id", () => {
    const options = combo(mountPicker()).props("options") as { id: string; name: string }[];
    expect(options.map((o) => o.id)).toEqual(["npc:n1", "monster:m1"]);
  });

  it("emits the name and portrait of the one picked, then empties itself for the next", async () => {
    const w = mountPicker();
    combo(w).vm.$emit("update:modelValue", "npc:n1");
    await w.vm.$nextTick();
    expect(w.emitted("pick")?.[0]).toEqual([{ name: "Grell Ashmantle", image: "https://example.invalid/grell.webp" }]);
    expect(combo(w).props("modelValue")).toBe("");
  });

  it("passes a null portrait through for a creature without art", async () => {
    const w = mountPicker();
    combo(w).vm.$emit("update:modelValue", "monster:m1");
    await w.vm.$nextTick();
    expect(w.emitted("pick")?.[0]).toEqual([{ name: "Owlbear", image: null }]);
  });
});
