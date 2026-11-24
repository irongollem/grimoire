import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { AskProposal } from "@edge-shared/agent/askContract";
import { useAskFormFillStore } from "@/stores/ui/askFormFill";
import { formClosedBlock, landInForm, resultLines } from "./formFillKit";

const store = () => useAskFormFillStore();
const bound = (id: string): AskProposal => ({ proposalId: "p", generator: "npc_sheet", concept: "", inputs: {}, target: { type: "npc", id, name: "x" } });
const land = (proposal: AskProposal, result = { name: "Mira" }) => landInForm({ generatorId: "npc_sheet", proposal, label: "Sheet", form: "NPC editor", name: result.name, result, credits: 4 });

describe("formFillKit", () => {
  beforeEach(() => setActivePinia(createPinia()));

  // Bug caught: the card offered to spend credits with no form open to receive the result.
  it("blocks while the form the card came from is not open, and not once it is", () => {
    const instance = store().register("npc_sheet", { context: () => undefined, apply: vi.fn() });
    store().unregister(instance);
    expect(formClosedBlock("npc_sheet", "NPC editor", bound(instance))).toMatchObject({ reason: "missing", message: expect.stringContaining("is closed") });
    const open = store().register("npc_sheet", { context: () => undefined, apply: vi.fn() });
    expect(formClosedBlock("npc_sheet", "NPC editor", bound(open))).toBeNull();
  });

  // Bug caught: a card with no form target (not opened by a form's button) was filled into whichever form was open.
  it("blocks a card that names no form", () => {
    store().register("npc_sheet", { context: () => undefined, apply: vi.fn() });
    expect(formClosedBlock("npc_sheet", "NPC editor", { proposalId: "p", generator: "npc_sheet", concept: "", inputs: {} })?.reason).toBe("missing");
  });

  // Bug caught: the result card sent the DM to a record's page, or saved a record, instead of leaving them in the form.
  it("hands the result to the form that opened the card and saves and opens nothing", () => {
    const apply = vi.fn();
    const instance = store().register("npc_sheet", { context: () => undefined, apply });
    const ended = land(bound(instance));
    expect(apply).toHaveBeenCalledExactlyOnceWith({ name: "Mira" });
    expect(ended.route).toBeNull();
    expect(ended.parts).toEqual([{ label: "Sheet filled in", ok: true, credits: 4 }]);
  });

  // Bug caught: the editor closed mid-run and the credits were spent for nothing; and the result was parked for the next form.
  it("shows the values on the card when its form closed, and gives them to no other form", () => {
    const first = store().register("npc_sheet", { context: () => undefined, apply: vi.fn() });
    store().unregister(first);
    const other = vi.fn();
    store().register("npc_sheet", { context: () => undefined, apply: other });
    const ended = land(bound(first), { name: "Mira" });
    expect(other).not.toHaveBeenCalled();
    expect(ended.parts[0]).toMatchObject({ ok: true, credits: 4 });
    expect(ended.parts[0].label).toContain("is closed");
    expect(ended.parts.map((p) => p.label)).toContain("Name: Mira");
  });

  it("lists only the fields that hold something, in words", () => {
    expect(resultLines({ name: "Mira", short_description: "Tall", age: "", tags: [], level: 0, nested: { a: 1 } })).toEqual([
      "Name: Mira", "Short description: Tall", "Level: 0", 'Nested: {"a":1}',
    ]);
  });
});
