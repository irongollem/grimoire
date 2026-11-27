import { beforeEach, describe, expect, it, vi } from "vitest";

const updateForm = vi.hoisted(() => vi.fn());
vi.mock("@/composables/canon/useCampaignSpecies", () => ({ useSpeciesEditing: () => ({ updateForm }) }));

import { useStatBlockBinder } from "./useStatBlockBinding";

const bind = { kind: "species_form" as const, formId: "f1", formLabel: "Young" };
const monster = { type: "monster", id: "m1", name: "Rime cub" };

beforeEach(() => updateForm.mockReset());

describe("useStatBlockBinder", () => {
  // Bug caught: the monster bound to the wrong column or form (a stat block written to another form, or as a book's).
  it("sets the made monster as the form's own stat block and says so", async () => {
    updateForm.mockResolvedValue(undefined);
    expect(await useStatBlockBinder()(bind, monster)).toEqual({ ok: true, text: "Bound to Young." });
    expect(updateForm).toHaveBeenCalledExactlyOnceWith("f1", { monsterId: "m1" });
  });

  // Bug caught: a refused tie (a stat block belongs to one form per campaign; `updateForm` answers null) reported as bound.
  it("reports a refusal as not bound, and names the way out", async () => {
    updateForm.mockResolvedValue(null);
    const outcome = await useStatBlockBinder()(bind, monster);
    expect(outcome.ok).toBe(false);
    expect(outcome.text).toContain("Rime cub was made");
    expect(outcome.text).toContain("pick it on the form");
  });
});
