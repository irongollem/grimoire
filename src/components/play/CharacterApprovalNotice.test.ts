import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { flushPromises } from "@vue/test-utils";
import CharacterApprovalNotice, { changeOffer, changeRoute } from "./CharacterApprovalNotice.vue";
import type { CharacterContentReview } from "@/composables/party/useCharacterContentReviews";
import type { PartyMember } from "@/types/party.types";

const reviews = ref<CharacterContentReview[]>([]);
const userId = { value: "u1" };
const removeContent = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock("@/composables/party/useCharacterContentReviews", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/composables/party/useCharacterContentReviews")>();
  return {
    ...actual,
    useCharacterContentReviews: () => ({ data: reviews }),
    useRemoveMissingContent: () => ({ mutateAsync: removeContent }),
  };
});
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ success: toastSuccess, error: toastError, fromError: (e: unknown) => String(e) }),
}));
vi.mock("@/stores/auth", () => ({
  useAuthStore: () => ({
    get user() {
      return { id: userId.value };
    },
  }),
}));

function review(over: Partial<CharacterContentReview>): CharacterContentReview {
  return {
    id: "r1", campaign_id: "c1", party_member_id: "m1", kind: "species", ref: "x", label: "Warforged",
    reason: "source", source_slug: "eberron", source_title: "Eberron", status: "pending",
    decided_by: null, decided_at: null, created_at: "", updated_at: "", ...over,
  };
}

const member = { id: "m1", name: "Mira", level: 3, owner_user_id: "u1", user_id: "dm" } as PartyMember;

function mountNotice(m: PartyMember = member) {
  return mount(CharacterApprovalNotice, {
    props: { member: m },
    global: { stubs: { RouterLink: { props: ["to"], template: "<a data-testid='change' :data-to='JSON.stringify(to)'><slot /></a>" } } },
  });
}

describe("CharacterApprovalNotice", () => {
  beforeEach(() => {
    reviews.value = [];
    userId.value = "u1";
    removeContent.mockReset();
    toastSuccess.mockReset();
    toastError.mockReset();
  });

  it("renders nothing when no flag is pending", () => {
    reviews.value = [review({ status: "approved" })];
    expect(mountNotice().html()).toBe("<!--v-if-->");
  });

  it("lists each pending flag with its reason", () => {
    reviews.value = [
      review({}),
      review({ id: "r2", kind: "spell", label: "Fireball", reason: "foreign" }),
    ];
    const items = mountNotice().findAll("[data-testid='approval-item']");
    expect(items).toHaveLength(2);
    expect(items[0]?.text()).toContain("Species: Warforged");
    expect(items[0]?.text()).toContain("From Eberron, which this table has not enabled.");
    expect(items[1]?.text()).toContain("Spell: Fireball");
    expect(items[1]?.text()).toContain("Made at another table. It cannot be approved here and has to be changed.");
  });

  it("offers Change links to the owner", () => {
    reviews.value = [review({})];
    const link = mountNotice().get("[data-testid='change']");
    expect(JSON.parse(link.attributes("data-to") ?? "")).toEqual({ name: "play-species", query: { memberId: "m1" } });
  });

  it("offers no Change links to someone else", () => {
    reviews.value = [review({})];
    userId.value = "dm";
    const wrapper = mountNotice();
    expect(wrapper.text()).toContain("Species: Warforged");
    expect(wrapper.find("[data-testid='change']").exists()).toBe(false);
  });

  it("gives a character nobody owns to its creator", () => {
    reviews.value = [review({})];
    userId.value = "dm";
    expect(mountNotice({ ...member, owner_user_id: null }).find("[data-testid='change']").exists()).toBe(true);
  });

  it("routes each kind", () => {
    expect(changeRoute("background", "m1")).toEqual({ name: "play-background", query: { memberId: "m1" } });
    expect(changeRoute("spell", "m1")).toEqual({ name: "play-spells", query: { memberId: "m1" } });
    for (const kind of ["class", "subclass", "feat"] as const) {
      expect(changeRoute(kind, "m1")).toEqual({ name: "play-character-levelup", query: { memberId: "m1" } });
    }
  });

  it("offers Remove, not Change, for something that no longer exists, and removes it", async () => {
    reviews.value = [review({ reason: "missing", kind: "spell", label: "Gone" })];
    removeContent.mockResolvedValue(0);
    const wrapper = mountNotice();
    expect(wrapper.find("[data-testid='change']").exists()).toBe(false);
    expect(wrapper.text()).toContain("It no longer exists, so it has to be removed from the character.");
    await wrapper.get("button").trigger("click");
    await flushPromises();
    expect(removeContent).toHaveBeenCalledWith("r1");
    expect(toastSuccess).toHaveBeenCalledWith("Removed from Mira.");
  });

  it("reports a failed removal", async () => {
    reviews.value = [review({ reason: "missing" })];
    removeContent.mockRejectedValue("nope");
    const wrapper = mountNotice();
    await wrapper.get("button").trigger("click");
    await flushPromises();
    expect(toastError).toHaveBeenCalledWith("nope");
  });

  it("does not offer Remove to someone else", () => {
    reviews.value = [review({ reason: "missing" })];
    userId.value = "dm";
    expect(mountNotice().find("button").exists()).toBe(false);
  });

  it("says plainly that a level 1 class cannot be changed", () => {
    reviews.value = [review({ kind: "class", label: "Wizard" })];
    const wrapper = mountNotice({ ...member, level: 1 });
    expect(wrapper.find("[data-testid='change']").exists()).toBe(false);
    expect(wrapper.get("[data-testid='approval-note']").text()).toBe(
      "A class cannot be changed once a character is made. Your DM can approve it, or you can build a new character.",
    );
  });

  it("labels a subclass link honestly", () => {
    reviews.value = [review({ kind: "subclass", label: "Evoker" })];
    expect(mountNotice().get("[data-testid='change']").text()).toBe("Level down to change");
  });
});

describe("changeOffer", () => {
  it("links the pickers as Change", () => {
    for (const kind of ["species", "background", "spell"] as const) {
      expect(changeOffer(kind, 1, "source")).toEqual({ type: "link", label: "Change" });
    }
  });

  it("makes subclass and feat a level down at any level", () => {
    expect(changeOffer("subclass", 3, "homebrew")).toEqual({ type: "link", label: "Level down to change" });
    expect(changeOffer("feat", 4, "blocked")).toEqual({ type: "link", label: "Level down to change" });
  });

  it("makes a class a level down from level 2, and a note at level 1", () => {
    expect(changeOffer("class", 2, "source")).toEqual({ type: "link", label: "Level down to change" });
    const one = changeOffer("class", 1, "blocked");
    expect(one.type === "note" && one.text).toBe(
      "A class cannot be changed once a character is made. Your DM can approve it, or you can build a new character.",
    );
    const foreign = changeOffer("class", 1, "foreign");
    expect(foreign.type === "note" && foreign.text).toBe(
      "A class cannot be changed once a character is made, and this one cannot be approved here. This character cannot sit at this table as it is.",
    );
  });

  it("offers removal for anything that is gone, whatever the kind", () => {
    for (const kind of ["species", "class", "subclass", "feat", "spell", "background"] as const) {
      expect(changeOffer(kind, 1, "missing")).toEqual({ type: "remove" });
    }
  });
});
