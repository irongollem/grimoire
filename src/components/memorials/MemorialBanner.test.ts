// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import MemorialBanner from "./MemorialBanner.vue";
import type { CharacterMemorial } from "@/types/memorial.types";

const restoreMutate = vi.fn();
const confirmFn = vi.fn();

vi.mock("@/composables/memorials/useMemorials", () => ({
  useRestoreCharacter: () => ({ mutate: restoreMutate, isPending: ref(false) }),
}));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: confirmFn }) }));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ error: vi.fn(), fromError: () => "x" }) }));
vi.mock("@/components/common/FocalImage.vue", () => ({ default: { template: "<div />" } }));

function memorial(overrides: Partial<CharacterMemorial> = {}): CharacterMemorial {
  return {
    id: "m1",
    party_member_id: "pm1",
    kind: "fallen",
    game_date: "29 Kythorn 1492 DR",
    real_date: "2026-06-22",
    character_name: "Toddy",
    portrait_url: null,
    portrait_focal_point: null,
    ...overrides,
  } as CharacterMemorial;
}

const stubs = { AppButton: { props: ["label", "to"], template: "<button :data-to='to'>{{ label }}</button>" } };
const render = (m: CharacterMemorial, viewer: "dm" | "owner" | "other") =>
  mount(MemorialBanner, { props: { memorial: m, viewer }, global: { stubs } });

beforeEach(() => {
  restoreMutate.mockReset();
  confirmFn.mockReset();
});

describe("MemorialBanner", () => {
  it("says when a character fell and where the card is, per viewer", () => {
    const dm = render(memorial(), "dm");
    expect(dm.find("[data-testid=banner-line]").text()).toBe("Toddy fell on 29 Kythorn 1492 DR (at the table, 22 Jun 2026).");
    expect(dm.find("[data-testid=see-card]").attributes("data-to")).toBe("/party/fallen");
    expect(render(memorial(), "owner").find("[data-testid=see-card]").attributes("data-to")).toBe("/play/fallen");
  });

  it("offers the right undo to each viewer", () => {
    expect(render(memorial(), "dm").find("[data-testid=undo]").text()).toBe("Restore to life");
    expect(render(memorial(), "owner").find("[data-testid=undo]").exists()).toBe(false);
    expect(render(memorial({ kind: "retired" }), "owner").find("[data-testid=undo]").text()).toBe("Return to the party");
    expect(render(memorial({ kind: "retired" }), "other").find("[data-testid=undo]").exists()).toBe(false);
  });

  it("asks before restoring, and does nothing on no", async () => {
    confirmFn.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const w = render(memorial(), "dm");
    await w.find("[data-testid=undo]").trigger("click");
    await flushPromises();
    expect(confirmFn.mock.calls[0][0]).toBe("Restore Toddy to life? They rejoin the party with the sheet as it was.");
    expect(restoreMutate).not.toHaveBeenCalled();
    await w.find("[data-testid=undo]").trigger("click");
    await flushPromises();
    expect(restoreMutate.mock.calls[0][0]).toBe("pm1");
  });
});
