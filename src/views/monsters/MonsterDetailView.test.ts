import { describe, expect, it, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { reactive, ref } from "vue";
import MonsterDetailView from "./MonsterDetailView.vue";

/** #590: `?edit=true` is not honoured for another DM's personal library monster. */

const mocks = vi.hoisted(() => ({
  userId: "me",
  owner: "me",
  route: { name: "monster-detail", params: { id: "m1" }, query: { edit: "true" } as Record<string, string> },
  replace: vi.fn(),
}));

vi.mock("vue-router", () => ({
  useRoute: () => reactive(mocks.route),
  useRouter: () => ({ replace: mocks.replace }),
}));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({ user: { id: mocks.userId } }) }));
vi.mock("@/composables/useBreakpoint", () => ({ useIsMobile: () => ref(false) }));
vi.mock("@/composables/useDetailModal", () => ({
  useDetailModal: () => ({ asModal: ref(false), close: vi.fn() }),
}));
vi.mock("@/composables/monsters/useMonsters", () => ({
  useMonsterWithArt: () => ({
    monster: ref({ id: "m1", user_id: mocks.owner, campaign_id: null, name: "Owlbear", size: "large", monster_type: "beast", stat_block: { challenge_rating: "3" } }),
    isLoading: ref(false),
  }),
}));

const stubs = {
  MonsterDetail: { template: "<div data-testid='editor' />" },
  MonsterDetailModal: true,
  MonsterSheetMobile: true,
  PageHeader: { template: "<div><slot name='actions' /><slot /></div>" },
  PageHeaderAction: true,
  LoadingSpinner: true,
};

describe("MonsterDetailView edit gate", () => {
  beforeEach(() => {
    mocks.replace.mockClear();
    mocks.route.query = { edit: "true" };
    mocks.userId = "me";
  });

  it("mounts the editor for the caller's own library monster", async () => {
    mocks.owner = "me";
    const wrapper = mount(MonsterDetailView, { global: { stubs } });
    await flushPromises();
    expect(wrapper.find('[data-testid="editor"]').exists()).toBe(true);
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("never mounts the editor for another DM's library monster, and drops ?edit=true", async () => {
    mocks.owner = "owner";
    const wrapper = mount(MonsterDetailView, { global: { stubs } });
    await flushPromises();
    expect(wrapper.find('[data-testid="editor"]').exists()).toBe(false);
    expect(mocks.replace).toHaveBeenCalledWith({ query: {} });
  });
});
