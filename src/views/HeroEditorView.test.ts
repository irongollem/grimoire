import { mount } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import HeroEditorView from "./HeroEditorView.vue";

// Refs, so a campaign that loads after the editor mounts is seen by its watchers.
const mocks = await vi.hoisted(async () => {
  const { ref: r } = await import("vue");
  return {
    calendarId: r<string | null>(null),
    createHero: vi.fn(),
    updateHero: vi.fn(),
    routeName: { value: "hero-new" },
    existing: r<Record<string, unknown> | undefined>(undefined),
  };
});

vi.mock("vue-router", () => ({
  useRoute: () => ({ name: mocks.routeName.value, params: { id: "h1" } }),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/composables/party/useHallOfHeroes", () => ({
  useHallOfHero: () => ({ data: mocks.existing, isLoading: ref(false) }),
  useCreateHero: () => ({ mutate: mocks.createHero, isPending: ref(false) }),
  useUpdateHero: () => ({ mutate: mocks.updateHero, isPending: ref(false) }),
  useDeleteHero: () => ({ mutate: vi.fn() }),
}));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({ isAppAdmin: true }) }));
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({
    get activeCampaign() {
      return { calendar_id: mocks.calendarId.value };
    },
  }),
}));

const stubs = {
  PageHeader: { template: "<div><slot /></div>" },
  LoadingSpinner: true,
  ImageUpload: true,
  RichTextEditor: true,
  TagInput: true,
};

async function saveNewHero(): Promise<{ setting: string }> {
  const wrapper = mount(HeroEditorView, { global: { stubs } });
  await wrapper.find("form").trigger("submit");
  const [payload] = mocks.createHero.mock.calls[0] as [{ setting: string }];
  return payload;
}

beforeEach(() => {
  mocks.createHero.mockReset();
  mocks.updateHero.mockReset();
  mocks.routeName.value = "hero-new";
  mocks.existing.value = undefined;
  mocks.calendarId.value = null;
});

describe("HeroEditorView new hero", () => {
  // Bug it fails on: every new hero started under "faerun", whatever the campaign's world.
  it("starts under the campaign's own setting pack", async () => {
    mocks.calendarId.value = "eberron";
    expect((await saveNewHero()).setting).toBe("eberron");
  });

  it.each([null, "gregorian", "custom"])("starts as homebrew for a campaign whose calendar is %s", async (id) => {
    mocks.calendarId.value = id;
    expect((await saveNewHero()).setting).toBe("homebrew");
  });
});

describe("HeroEditorView campaign arriving late", () => {
  // Bug it fails on: opening a new hero before the campaign loaded fixed the setting at
  // "homebrew" for good, because the form read the campaign once at mount.
  it("takes the campaign's setting when the campaign loads after the editor mounted", async () => {
    const wrapper = mount(HeroEditorView, { global: { stubs } });
    mocks.calendarId.value = "eberron";
    await wrapper.vm.$nextTick();
    await wrapper.find("form").trigger("submit");
    expect((mocks.createHero.mock.calls[0] as [{ setting: string }])[0].setting).toBe("eberron");
  });

  // Bug it fails on: the late campaign overwrote a setting the DM had already chosen.
  it("keeps a setting the DM already picked", async () => {
    const wrapper = mount(HeroEditorView, { global: { stubs } });
    await wrapper.find("select").setValue("greyhawk");
    mocks.calendarId.value = "eberron";
    await wrapper.vm.$nextTick();
    await wrapper.find("form").trigger("submit");
    expect((mocks.createHero.mock.calls[0] as [{ setting: string }])[0].setting).toBe("greyhawk");
  });

  // Bug it fails on: an existing homebrew hero was moved into the campaign's setting
  // (and saved so) when the campaign finished loading after the hero did.
  it("never changes the setting of a hero being edited", async () => {
    mocks.routeName.value = "hero-edit";
    mocks.existing.value = { id: "h1", name: "Old Tam", setting: "homebrew", tags: [], is_revealed: false };
    const wrapper = mount(HeroEditorView, { global: { stubs } });
    await wrapper.vm.$nextTick();
    mocks.calendarId.value = "eberron";
    await wrapper.vm.$nextTick();
    expect((wrapper.find("select").element as HTMLSelectElement).value).toBe("homebrew");
  });
});
