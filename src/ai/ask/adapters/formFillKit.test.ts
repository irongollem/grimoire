import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useAskFormFillStore } from "@/stores/ui/askFormFill";
import { formClosedBlock, landInForm } from "./formFillKit";

const land = (result = { name: "Mira" }) => landInForm({ generatorId: "npc_sheet", label: "Sheet", form: "NPC editor", name: result.name, result, credits: 4 });

describe("formFillKit", () => {
  beforeEach(() => setActivePinia(createPinia()));

  // Bug caught: the card offered to spend credits with no form open to receive the result.
  it("blocks while no form is open, and not once it is", () => {
    expect(formClosedBlock("npc_sheet", "NPC editor")).toMatchObject({ reason: "missing", message: "Open the NPC editor you want filled first." });
    useAskFormFillStore().register("npc_sheet", { context: () => undefined, apply: vi.fn() });
    expect(formClosedBlock("npc_sheet", "NPC editor")).toBeNull();
  });

  // Bug caught: the result card sent the DM to a record's page, or saved a record, instead of leaving them in the form.
  it("hands the result to the open form and saves and opens nothing", () => {
    const apply = vi.fn();
    useAskFormFillStore().register("npc_sheet", { context: () => undefined, apply });
    const ended = land();
    expect(apply).toHaveBeenCalledExactlyOnceWith({ name: "Mira" });
    expect(ended.route).toBeNull();
    expect(ended.parts).toEqual([{ label: "Sheet filled in", ok: true, credits: 4 }]);
    expect(useAskFormFillStore().takeKept("npc_sheet")).toBeNull();
  });

  // Bug caught: the editor closed mid-run, the result was thrown away, and the credits were spent for nothing.
  it("keeps the result for the next open of the form when it has closed, and says so", () => {
    const ended = land();
    expect(ended.parts[0]).toMatchObject({ ok: true, credits: 4 });
    expect(ended.parts[0].label).toContain("kept");
    expect(useAskFormFillStore().takeKept("npc_sheet")).toEqual({ name: "Mira" });
  });
});
