// @vitest-environment jsdom
// DOMPurify (via sanitizeHtml) strips every tag under happy-dom; see sanitizeHtml.test.ts.
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import MemorialTolling from "./MemorialTolling.vue";
import type { CharacterMemorial, MemorialMourner } from "@/types/memorial.types";

/** A stored Tiptap document, as RichTextEditor writes it; an empty string is a cleared editor. */
const DOC = (text: string) =>
  JSON.stringify({ type: "doc", content: [{ type: "paragraph", ...(text ? { content: [{ type: "text", text }] } : {}) }] });

const lightMutate = vi.fn((_t: unknown, o?: { onSuccess?: () => void }) => o?.onSuccess?.());
const tolledMutate = vi.fn();
const memorials = ref<CharacterMemorial[]>([]);
const mourners = ref<MemorialMourner[]>([]);
const authState = { user: { id: "owner" } };

vi.mock("@/composables/memorials/useMemorials", () => ({
  useCampaignMemorials: () => ({ data: memorials }),
  useMyMournerRows: () => ({ data: mourners }),
  useLightCandle: () => ({ mutate: lightMutate, isPending: ref(false) }),
  useMarkTolled: () => ({ mutate: tolledMutate }),
}));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ error: vi.fn(), fromError: () => "x" }) }));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => authState }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: "c1" }) }));
vi.mock("@/components/common/FocalImage.vue", () => ({ default: { template: "<div />" } }));

function fallen(overrides: Partial<CharacterMemorial> = {}): CharacterMemorial {
  return {
    id: "m1",
    party_member_id: "pm1",
    campaign_id: "c1",
    owner_user_id: "owner",
    kind: "fallen",
    restored_at: null,
    game_date: "29 Kythorn 1492 DR",
    account: DOC("The song stopped on the last chord."),
    character_name: "Toddy",
    portrait_url: null,
    portrait_focal_point: null,
    ...overrides,
  } as CharacterMemorial;
}

const stubs = {
  AppModal: { props: ["open"], template: "<div v-if='open' class='modal'><slot /></div>" },
  AppButton: { props: ["label"], template: "<button>{{ label }}</button>" },
  MemorialWordsDialog: { props: ["memorial"], emits: ["close"], template: "<div v-if='memorial' class='words' @click=\"$emit('close')\" />" },
};
const render = (suppressed = false) => mount(MemorialTolling, { props: { suppressed }, global: { stubs } });

beforeEach(() => {
  lightMutate.mockClear();
  tolledMutate.mockReset();
  authState.user = { id: "owner" };
  memorials.value = [fallen()];
  mourners.value = [{ memorial_id: "m1", tolled_at: null } as MemorialMourner];
});

describe("MemorialTolling", () => {
  it("shows the notice with the DM's account, and offers the owner their words", () => {
    const w = render();
    expect(w.find("[data-testid=tolling]").text()).toContain("Toddy has fallen");
    expect(w.find("[data-testid=tolling-date]").text()).toContain("29 Kythorn 1492 DR");
    expect(w.find("[data-testid=tolling-account]").text()).toBe("The song stopped on the last chord.");
    expect(w.find("[data-testid=tolling-write]").text()).toBe("Write their last words");
    expect(w.find("[data-testid=tolling-candle]").exists()).toBe(false);
  });

  it("is silent during a live encounter, after it was seen, and for a restored character", () => {
    expect(render(true).find("[data-testid=tolling]").exists()).toBe(false);
    mourners.value = [{ memorial_id: "m1", tolled_at: "2026-06-22T10:00:00Z" } as MemorialMourner];
    expect(render().find("[data-testid=tolling]").exists()).toBe(false);
    mourners.value = [{ memorial_id: "m1", tolled_at: null } as MemorialMourner];
    memorials.value = [fallen({ restored_at: "2026-06-23T10:00:00Z" })];
    expect(render().find("[data-testid=tolling]").exists()).toBe(false);
  });

  it("lights a candle for everyone else, then marks the notice seen", async () => {
    authState.user = { id: "someone-else" };
    const w = render();
    await w.find("[data-testid=tolling-candle]").trigger("click");
    await flushPromises();
    expect(lightMutate.mock.calls[0][0]).toEqual({ memorialId: "m1", campaignId: "c1" });
    expect(tolledMutate.mock.calls[0][0]).toEqual({ memorialId: "m1", campaignId: "c1" });
    expect(w.find("[data-testid=tolling]").exists()).toBe(false);
  });

  it("marks it seen on Later, and after the owner has written their words", async () => {
    const w = render();
    await w.find("[data-testid=tolling-later]").trigger("click");
    expect(tolledMutate).toHaveBeenCalledTimes(1);

    memorials.value = [fallen({ id: "m2" })];
    mourners.value = [{ memorial_id: "m2", tolled_at: null } as MemorialMourner];
    const w2 = render();
    await w2.find("[data-testid=tolling-write]").trigger("click");
    expect(tolledMutate).toHaveBeenCalledTimes(1);
    await w2.find(".words").trigger("click");
    expect(tolledMutate).toHaveBeenCalledTimes(2);
    expect(tolledMutate.mock.calls[1][0]).toEqual({ memorialId: "m2", campaignId: "c1" });
  });
});
