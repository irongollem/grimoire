import { afterEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { createPinia } from "pinia";
import { reactive, ref } from "vue";
import { useLowArt } from "@/composables/useLowArt";
import CharacterCreateBasicsStep from "./CharacterCreateBasicsStep.vue";
import CharacterCreateClassStep from "./CharacterCreateClassStep.vue";
import CharacterCreateBackgroundStep from "./CharacterCreateBackgroundStep.vue";
import type { CharacterCreationForm } from "@/composables/party/useCharacterCreationForm";

/*
  The creation steps are pickers (#1179): with low art on, the species, class
  and background art goes and each option's name and summary carry the card.
*/
vi.mock("@/composables/library/useSourceTitles", () => ({ useSourceTitles: () => ({ labelFor: () => null }) }));
vi.mock("@/composables/rules/useRuleset", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/composables/rules/useRuleset")>()),
  useRuleset: () => ({ is2024: ref(false) }),
}));
vi.mock("@/composables/deities/useDeities", () => ({ useAllDeities: () => ({ data: ref([]) }) }));

const { setLowArt } = useLowArt();
afterEach(() => {
  setLowArt(false);
});

/** Anything the step reads but the test does not care about is an empty ref. */
function formOf(parts: Record<string, unknown>): CharacterCreationForm {
  return new Proxy(parts, {
    get: (target, key) => (key in target ? target[key as string] : ref(undefined)),
  }) as unknown as CharacterCreationForm;
}

function mountStep(component: typeof CharacterCreateBasicsStep, form: CharacterCreationForm) {
  return mount(component, {
    props: { form },
    global: {
      plugins: [createPinia(), [VueQueryPlugin, { queryClient: new QueryClient() }]],
      stubs: { ImageUpload: true, RichTextEditor: true, SubclassPicker: true },
    },
  });
}

const f = reactive({ species_id: "", subrace: "", class: "", background_id: "", saving_throw_proficiencies: [] as string[] });

describe("character creation steps in low art", () => {
  it("shows the species art when low art is off (the control for the guard below)", () => {
    const form = formOf({
      f,
      auth: {},
      speciesChoices: ref([{ id: "s1", name: "Elf", image_url: "https://cdn.test/elf.webp", focal_point: null, traits: [] }]),
      subraceOptions: ref([]),
    });
    expect(mountStep(CharacterCreateBasicsStep, form).find("img").exists()).toBe(true);
  });

  it("the species picker still downloads species art in low art, and the name carries the card", () => {
    setLowArt(true);
    const form = formOf({
      f,
      auth: {},
      speciesChoices: ref([{ id: "s1", name: "Elf", image_url: "https://cdn.test/elf.webp", focal_point: null, traits: [] }]),
      subraceOptions: ref([]),
    });
    const wrapper = mountStep(CharacterCreateBasicsStep, form);
    expect(wrapper.find("img").exists()).toBe(false);
    expect(wrapper.text()).toContain("Elf");
  });

  it("the class picker still downloads class art in low art", () => {
    setLowArt(true);
    const form = formOf({
      f,
      mergedClasses: ref([
        { choice_key: "wizard", class_name: "Wizard", hit_die: 6, image_url: "https://cdn.test/wiz.webp", focal_point: null, definition_kind: "system", saving_throws: [] },
      ]),
    });
    const wrapper = mountStep(CharacterCreateClassStep, form);
    expect(wrapper.find("img").exists()).toBe(false);
    expect(wrapper.text()).toContain("Wizard");
  });

  it("the background picker still downloads background art in low art, and keeps the selected mark and the feat", () => {
    setLowArt(true);
    const selected = reactive({ ...f, background_id: "b1" });
    const form = formOf({
      f: selected,
      allBackgrounds: ref([
        { id: "b1", name: "Sage", image_url: "https://cdn.test/sage.webp", focal_point: null, feat_grant_name: "Magic Initiate", skill_proficiencies: [] },
      ]),
    });
    const wrapper = mountStep(CharacterCreateBackgroundStep, form);
    expect(wrapper.find("img").exists()).toBe(false);
    expect(wrapper.text()).toContain("Sage");
    expect(wrapper.text()).toContain("Magic Initiate");
    expect(wrapper.find('[aria-label="Selected"]').exists()).toBe(true);
  });
});
