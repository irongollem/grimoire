// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import SetDownDialog from "./SetDownDialog.vue";
import type { CharacterMemorial } from "@/types/memorial.types";
import type { PartyMember } from "@/types/party.types";

const setDownMutate = vi.fn();
const editMutate = vi.fn();
const authState = { isDM: true, user: { id: "dm-user" }, publicName: "Sam" };
const memorialRows = ref<CharacterMemorial[]>([]);

vi.mock("@/composables/memorials/useMemorials", () => ({
  useSetCharacterDown: () => ({ mutate: setDownMutate, isPending: ref(false) }),
  useEditMemorialAccount: () => ({ mutate: editMutate, isPending: ref(false) }),
  useCampaignMemorials: () => ({ data: memorialRows }),
}));
vi.mock("@/composables/party/useActiveParty", () => ({
  useActiveParty: () => ({
    data: ref([{ id: "pm1", name: "Toddy" }, { id: "pm2", name: "Fresco" }, { id: "pm3", name: "Rosie" }]),
  }),
}));
vi.mock("@/composables/rules/useSpecies", () => ({ useSpeciesNames: () => () => "Sippet" }));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ error: vi.fn(), fromError: () => "x" }) }));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => authState }));
vi.mock("@/stores/calendar", () => ({
  useCalendarStore: () => ({ adapter: { epochName: "DR", months: [{ num: 5, name: "Kythorn" }] } }),
}));
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({ todayYear: 1492, todayMonth: 5, todayDay: 29, activeCampaign: { name: "Sugarwell" } }),
}));

function member(overrides: Partial<PartyMember> = {}): PartyMember {
  return {
    id: "pm1",
    owner_user_id: "player-user",
    campaign_id: "c1",
    name: "Toddy Bellows",
    player_name: "Sam",
    class: "Bard",
    level: 6,
    portrait_url: null,
    portrait_focal_point: null,
    ...overrides,
  } as PartyMember;
}

const stubs = {
  AppModal: { props: ["open"], template: "<div v-if='open'><slot /></div>" },
  ModalHeader: { props: ["title", "subtitle"], template: "<header><h2>{{ title }}</h2><p>{{ subtitle }}</p></header>" },
  RichTextEditor: { props: ["modelValue"], template: "<div class='rte' />" },
  MemorialCard: { props: ["memorial"], template: "<div class='card-stub'>{{ memorial.character_name }}|{{ memorial.kind }}|{{ memorial.game_date }}</div>" },
};

type RenderProps = {
  mode: "fallen" | "retired" | "edit";
  member?: PartyMember | null;
  memorial?: CharacterMemorial | null;
};

function render(props: RenderProps) {
  return mount(SetDownDialog, { props: { open: true, ...props }, global: { stubs } });
}

beforeEach(() => {
  setDownMutate.mockReset();
  editMutate.mockReset();
  memorialRows.value = [];
  authState.isDM = true;
});

describe("SetDownDialog", () => {
  it("titles and prefills a fall for the DM, and previews the card live", async () => {
    const w = render({ mode: "fallen", member: member() });
    expect(w.find("h2").text()).toBe("Mark Toddy Bellows as Fallen?");
    expect((w.find("[data-testid=game-date] ").element as HTMLInputElement).value).toBe("29 Kythorn 1492 DR");
    expect(w.find("[data-testid=survived-by]").text()).toBe("Fresco and Rosie");
    expect(w.find("[data-testid=note]").text()).toBe("Sam is told, and writes Toddy Bellows's last words.");
    await w.find("[data-testid=game-date]").setValue("30 Kythorn 1492 DR");
    expect(w.find(".card-stub").text()).toContain("30 Kythorn 1492 DR");
    expect(w.find(".card-stub").text()).toContain("fallen");
  });

  it("sends the DM's fields for a fall, and never last words", async () => {
    const w = render({ mode: "fallen", member: member() });
    await w.find("[data-testid=last-blow]").setValue("a giant wasp");
    await w.find("[data-testid=confirm]").trigger("click");
    expect(setDownMutate).toHaveBeenCalledTimes(1);
    expect(setDownMutate.mock.calls[0][0]).toMatchObject({
      partyMemberId: "pm1",
      kind: "fallen",
      gameDate: "29 Kythorn 1492 DR",
      account: null,
      lastBlow: "a giant wasp",
      lastWords: null,
    });
  });

  it("lets the owner retire with a farewell and sends nothing DM-only", async () => {
    authState.isDM = false;
    authState.user = { id: "player-user" };
    const w = render({ mode: "retired", member: member() });
    expect(w.find("h2").text()).toBe("Retire Toddy Bellows?");
    expect(w.find("[data-testid=last-blow]").exists()).toBe(false);
    expect(w.find("[data-testid=remembered-by]").text()).toBe("Sam");
    expect(w.find("[data-testid=note]").text()).toBe("Your DM is told, and writes how Toddy Bellows left.");
    await w.find("[data-testid=confirm]").trigger("click");
    expect(setDownMutate.mock.calls[0][0]).toMatchObject({ kind: "retired", account: null, lastBlow: null, lastWords: null });
    authState.user = { id: "dm-user" };
  });

  it("starts a second fall from what the first one left", () => {
    memorialRows.value = [
      { party_member_id: "pm1", account: "{\"type\": \"doc\", \"content\": [{\"type\": \"paragraph\", \"content\": [{\"type\": \"text\", \"text\": \"Held the gate.\"}]}]}", last_blow: "a wasp", last_words: null, created_at: "2026-05-04" } as CharacterMemorial,
    ];
    const w = render({ mode: "fallen", member: member() });
    expect((w.find("[data-testid=last-blow]").element as HTMLInputElement).value).toBe("a wasp");
  });

  it("edits the account of a memorial in place", async () => {
    const memorial = {
      id: "m1",
      party_member_id: "pm1",
      kind: "fallen",
      game_date: "14 Mirtul 1492 DR",
      real_date: "2026-05-04",
      account: "{\"type\": \"doc\", \"content\": [{\"type\": \"paragraph\", \"content\": [{\"type\": \"text\", \"text\": \"Old.\"}]}]}",
      last_blow: "a wasp",
      character_name: "Chicory",
    } as CharacterMemorial;
    const w = render({ mode: "edit", memorial });
    expect(w.find("h2").text()).toBe("Chicory's account");
    await w.find("[data-testid=last-blow]").setValue("");
    await w.find("[data-testid=confirm]").trigger("click");
    expect(editMutate.mock.calls[0][0]).toMatchObject({
      partyMemberId: "pm1",
      gameDate: "14 Mirtul 1492 DR",
      realDate: "2026-05-04",
      lastBlow: null,
    });
  });
});
