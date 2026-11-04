import { mount } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import HeroEditorView from "./HeroEditorView.vue";

const mocks = vi.hoisted(() => ({ calendarId: { value: null as string | null }, createHero: vi.fn() }));

vi.mock("vue-router", () => ({
  useRoute: () => ({ name: "hero-new", params: {} }),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/composables/party/useHallOfHeroes", () => ({
  useHallOfHero: () => ({ data: ref(undefined), isLoading: ref(false) }),
  useCreateHero: () => ({ mutate: mocks.createHero, isPending: ref(false) }),
  useUpdateHero: () => ({ mutate: vi.fn(), isPending: ref(false) }),
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

beforeEach(() => mocks.createHero.mockReset());

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
