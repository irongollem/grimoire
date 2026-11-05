// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";

const m = vi.hoisted(() => ({ confirm: vi.fn(), remove: vi.fn(), show: vi.fn(), items: [] as { key: string; label: string }[] }));
vi.mock("@/composables/bookNook/useShowNookAtPlace", () => ({ useShowNookAtPlace: () => ({ mutateAsync: m.show }) }));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: m.confirm }) }));
vi.mock("@/composables/bookNook/useBookNooks", () => ({ useDeleteBookNook: () => ({ mutateAsync: m.remove }) }));

import BookNookCard from "./BookNookCard.vue";
import type { BookNook } from "@/types/bookNook.types";

const Player = defineComponent({ name: "BookNookPlayer", render: () => h("div", { "data-testid": "player" }) });
const Menu = defineComponent({
  name: "OverflowMenu",
  props: ["items"],
  emits: ["select"],
  render() {
    m.items = this.items;
    return h("div", [
      h("button", { "data-testid": "menu", onClick: () => this.$emit("select", "delete") }),
      h("button", { "data-testid": "stop", onClick: () => this.$emit("select", "stop") }),
      h("button", { "data-testid": "show", onClick: () => this.$emit("select", "show") }),
    ]);
  },
});

const nook = { id: "n1", title: "The Gilded Stag", scene: {}, still_url: "https://cdn.example.invalid/s.webp" } as unknown as BookNook;

function mountCard(placeName: string | null = null, placeId: string | null = null) {
  return mount(BookNookCard, {
    props: { nook, placeName, placeId },
    global: { stubs: { ShowNookAtPlaceDialog: { name: "ShowNookAtPlaceDialog", props: ["open"], template: "<i data-testid='dlg' :data-open='open' />" }, BookNookPlayer: Player, OverflowMenu: Menu, RouterLink: { template: "<a><slot /></a>" } } },
  });
}

beforeEach(() => vi.clearAllMocks());

describe("BookNookCard", () => {
  it("plays the nook only while the pointer or focus is on the card", async () => {
    const card = mountCard();
    expect(card.find("[data-testid=player]").exists()).toBe(false);
    expect(card.find("img").attributes("src")).toBe(nook.still_url);
    await card.trigger("pointerenter");
    expect(card.find("[data-testid=player]").exists()).toBe(true);
    await card.trigger("pointerleave");
    expect(card.find("[data-testid=player]").exists()).toBe(false);
    await card.trigger("focusin");
    expect(card.find("[data-testid=player]").exists()).toBe(true);
  });

  it("names the place that shows it, or says it is not shown", () => {
    expect(mountCard("The Stag").text()).toContain("Shown at The Stag");
    expect(mountCard(null).text()).toContain("Not shown at a place");
  });

  it("deletes only after the DM confirms", async () => {
    m.confirm.mockResolvedValueOnce(false);
    const card = mountCard();
    await card.find("[data-testid=menu]").trigger("click");
    await vi.waitFor(() => expect(m.confirm).toHaveBeenCalled());
    expect(m.remove).not.toHaveBeenCalled();

    m.confirm.mockResolvedValueOnce(true);
    await card.find("[data-testid=menu]").trigger("click");
    await vi.waitFor(() => expect(m.remove).toHaveBeenCalledWith("n1"));
  });

  it("stops showing the nook at its place by clearing that place", async () => {
    // Bug: a nook shown at a place could never be taken off it from the Book Nook list.
    const card = mountCard("The Stag", "p1");
    expect(m.items.map((i) => i.label)).toContain("Stop showing at The Stag");
    await card.get("[data-testid=stop]").trigger("click");
    await vi.waitFor(() => expect(m.show).toHaveBeenCalledWith({ locationId: "p1", nookId: null }));
  });

  it("offers no stop when no place shows it, and opens the place picker for Show at a place", async () => {
    const card = mountCard(null, null);
    expect(m.items.map((i) => i.key)).toEqual(["show", "delete"]);
    expect(card.get("[data-testid=dlg]").attributes("data-open")).toBe("false");
    await card.get("[data-testid=show]").trigger("click");
    expect(card.get("[data-testid=dlg]").attributes("data-open")).toBe("true");
  });
});
