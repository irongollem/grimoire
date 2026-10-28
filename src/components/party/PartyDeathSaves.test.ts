// @vitest-environment happy-dom
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PartyDeathSaves from "./PartyDeathSaves.vue";
import type { PartyMember } from "@/types/party.types";

const mocks = vi.hoisted(() => ({ update: vi.fn(), confirm: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("@/composables/party/useParty", () => ({ useUpdatePartyMember: () => ({ mutateAsync: mocks.update }) }));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: mocks.confirm }) }));
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ success: mocks.success, error: mocks.error, fromError: (_e: unknown, fallback: string) => fallback }),
}));

const dead = {
  id: "m1",
  name: "Karl",
  current_hp: 0,
  death_save_successes: 0,
  death_save_failures: 3,
  conditions: [],
} as unknown as PartyMember;

/** Mounts the banner with the set-down dialog stubbed, so opening it is visible as a component. */
function mountSaves(m: PartyMember) {
  return mount(PartyDeathSaves, { props: { member: m }, global: { stubs: { SetDownDialog: true } } });
}

describe("PartyDeathSaves when dead", () => {
  it("offers Mark as fallen beside Revive, and opens the set-down dialog only when asked", async () => {
    const w = mountSaves(dead);
    expect(w.text()).toContain("Revive");
    expect(w.findComponent({ name: "SetDownDialog" }).exists()).toBe(false);
    const mark = w.findAll("button").find((b) => b.text().includes("Mark as fallen"));
    expect(mark).toBeDefined();
    await mark!.trigger("click");
    expect(w.findComponent({ name: "SetDownDialog" }).exists()).toBe(true);
  });

  it("offers neither while the character is only dying", () => {
    const w = mountSaves({ ...dead, death_save_failures: 1 } as PartyMember);
    expect(w.text()).not.toContain("Mark as fallen");
  });
});

describe("PartyDeathSaves revive", () => {
  beforeEach(() => {
    mocks.update.mockReset();
    mocks.confirm.mockReset();
  });
  const reviveButton = (w: ReturnType<typeof mountSaves>) => w.findAll("button").find((b) => b.text() === "Revive")!;

  it("does nothing when the DM cancels the confirmation", async () => {
    mocks.confirm.mockResolvedValue(false);
    await reviveButton(mountSaves(dead)).trigger("click");
    await flushPromises();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("brings a confirmed revive back at 1 HP with both save tracks cleared and Unconscious lifted", async () => {
    mocks.confirm.mockResolvedValue(true);
    mocks.update.mockResolvedValue(undefined);
    const withUnconscious = { ...dead, conditions: [{ name: "Unconscious" }, { name: "Poisoned" }] } as unknown as PartyMember;
    await reviveButton(mountSaves(withUnconscious)).trigger("click");
    await flushPromises();
    expect(mocks.update).toHaveBeenCalledTimes(1);
    const { id, update } = mocks.update.mock.calls[0][0];
    expect(id).toBe("m1");
    expect(update).toMatchObject({ current_hp: 1, death_save_successes: 0, death_save_failures: 0 });
    expect(update.conditions.map((c: { name: string }) => c.name)).toEqual(["Poisoned"]);
    expect(mocks.success).toHaveBeenCalled();
  });

  it("reports a failed revive instead of claiming success", async () => {
    mocks.confirm.mockResolvedValue(true);
    mocks.update.mockRejectedValue(new Error("boom"));
    await reviveButton(mountSaves(dead)).trigger("click");
    await flushPromises();
    expect(mocks.error).toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
  });
});

describe("PartyDeathSaves pips", () => {
  beforeEach(() => mocks.update.mockReset());
  const dying = (over: Partial<PartyMember>) => ({ ...dead, death_save_failures: 0, ...over }) as PartyMember;
  const pips = (w: ReturnType<typeof mountSaves>) => w.findAll("button");

  it("advances the success track one pip per click", async () => {
    await pips(mountSaves(dying({ death_save_successes: 1 })))[0].trigger("click");
    expect(mocks.update).toHaveBeenCalledWith({ id: "m1", update: { death_save_successes: 2 } });
  });

  it("clicking the failure track on two failures marks the third", async () => {
    await pips(mountSaves(dying({ death_save_failures: 2 })))[3].trigger("click");
    expect(mocks.update).toHaveBeenCalledWith({ id: "m1", update: { death_save_failures: 3 } });
  });
});
