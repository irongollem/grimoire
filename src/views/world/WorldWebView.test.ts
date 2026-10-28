import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed, defineComponent, ref } from "vue";
import { mount } from "@vue/test-utils";
import WorldWebView from "./WorldWebView.vue";
import PlayerWorldWebView from "./PlayerWorldWebView.vue";

const state = vi.hoisted(() => ({
  query: {} as Record<string, string>,
  error: null as Error | null,
  viewer: null as string | null,
  tiesLoading: false,
  peopleLoading: false,
}));

vi.mock("vue-router", () => ({ useRoute: () => ({ query: state.query }) }));
vi.mock("@/composables/world/useWorldTies", () => ({
  useWorldTies: () => ({ data: ref([]), isLoading: computed(() => state.tiesLoading), error: computed(() => state.error) }),
  usePlayerWorldTies: () => ({ data: ref([]), isLoading: ref(false), error: computed(() => state.error) }),
  useWorldPeople: () => ({ people: ref([]), isLoading: computed(() => state.peopleLoading) }),
}));
vi.mock("@/composables/party/useParty", () => ({
  useParty: () => ({ data: ref([{ id: "pc1", portrait_focal_point: { x: 1, y: 2 } }, { id: "pc2", portrait_focal_point: null }]) }),
}));
vi.mock("@/composables/connections/usePlayerConnections", () => ({ useViewerMemberId: () => computed(() => state.viewer) }));
vi.mock("@/components/kinship/SortFamilyLinksNotice.vue", () => ({ default: { template: "<i data-test='notice' />" } }));

const Screen = defineComponent({
  name: "WorldWebScreen",
  props: { ties: Array, people: Array, loading: Boolean, focusKey: String, homeKey: String, readonly: Boolean, focalPoints: Object },
  template: "<div data-test='screen' />",
});

const global = { stubs: { WorldWebScreen: Screen } };

describe("WorldWebView", () => {
  beforeEach(() => {
    state.query = {};
    state.error = null;
    state.viewer = null;
    state.tiesLoading = false;
    state.peopleLoading = false;
  });

  it("hands the screen the ties and PC portrait crops, and opens on ?focus=", () => {
    state.query = { focus: "deity:abc" };
    const w = mount(WorldWebView, { global });
    const screen = w.getComponent(Screen);
    expect(screen.props("focusKey")).toBe("deity:abc");
    expect(screen.props("focalPoints")).toEqual({ "party_member:pc1": { x: 1, y: 2 } });
    expect(w.find("[data-test=notice]").exists()).toBe(true);
  });

  it.each([["nonsense"], ["spaceship:abc"]])("ignores a focus that is not the key of something on the web (%s)", (focus) => {
    state.query = { focus };
    expect(mount(WorldWebView, { global }).getComponent(Screen).props("focusKey")).toBeNull();
  });

  it.each([["ties"], ["people"]] as const)("the screen waits while the %s are still loading", (which) => {
    if (which === "ties") state.tiesLoading = true;
    else state.peopleLoading = true;
    expect(mount(WorldWebView, { global }).getComponent(Screen).props("loading")).toBe(true);
  });

  it("reports a failed read instead of drawing an empty world", () => {
    state.error = new Error("denied");
    const w = mount(WorldWebView, { global });
    expect(w.text()).toContain("could not be read");
    expect(w.findComponent(Screen).exists()).toBe(false);
  });
});

describe("PlayerWorldWebView", () => {
  beforeEach(() => {
    state.query = {};
    state.error = null;
    state.viewer = null;
  });

  it("is read-only and starts from the viewer's own character", () => {
    state.viewer = "pc7";
    const screen = mount(PlayerWorldWebView, { global }).getComponent(Screen);
    expect(screen.props("readonly")).toBe(true);
    expect(screen.props("homeKey")).toBe("party_member:pc7");
    expect(screen.props("people")).toEqual([]);
  });

  it("has no home when nobody is seated", () => {
    expect(mount(PlayerWorldWebView, { global }).getComponent(Screen).props("homeKey")).toBeNull();
  });
});
