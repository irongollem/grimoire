import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import WorkbenchOutcomeModal from "./WorkbenchOutcomeModal.vue";
import { _resetModalStack } from "@/components/common/overlays/modalStack";
import type { LostMaterial } from "@/lib/crafting/workbench/slotMaterial";
import type { CraftingAttemptResult } from "@/types/crafting.types";

const mocks = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("vue-router", () => ({ useRouter: () => ({ push: mocks.push }) }));

const lost: LostMaterial[] = [{ name: "Iron Ingot", qty: 2, sprite: { sprite: "mat-ingot-iron", filter: null } }];

function open(outcome: CraftingAttemptResult["outcome"], over: Record<string, unknown> = {}) {
  return mount(WorkbenchOutcomeModal, {
    props: {
      open: true,
      outcome,
      discipline: { label: "Smithing", doneVerb: "Forged" },
      recipeName: "Longsword",
      recipeArt: null,
      outputText: "Longsword",
      lost,
      craftingTime: 8,
      craftingTimeUnit: "hours",
      canRetry: true,
      wreckageName: "Iron Ingot",
      fine: false,
      degradeLine: null,
      rolledText: "Rolled 14 + 3 = 17 against DC 15",
      ...over,
    },
    attachTo: document.body,
    global: { stubs: { transition: false } },
  });
}

const text = () => document.body.textContent ?? "";
const button = (label: string) => [...document.body.querySelectorAll("button")].find((b) => b.textContent?.trim() === label);

afterEach(() => {
  _resetModalStack();
  document.body.innerHTML = "";
  mocks.push.mockClear();
});

describe("WorkbenchOutcomeModal", () => {
  it("celebrates a success with the discipline's verb, the item and the roll", () => {
    open("success");
    const title = document.body.querySelector("h2");
    expect(title?.textContent?.trim()).toBe("Forged!");
    expect(text()).toContain("Smithing");
    expect(text()).toContain("Longsword, in your pack");
    expect(text()).toContain("Rolled 14 + 3 = 17 against DC 15");
    expect(text()).not.toContain("Lost");
  });

  it("says a high roll came out Fine", () => {
    open("success", { fine: true });
    expect(document.body.querySelector("[data-quality=fine]")).not.toBeNull();
    expect(text()).toContain("so it came out Fine");
  });

  it("says a failure used nothing up, only the time, and lists no loss", () => {
    open("fail", { lost: [], degradeLine: "Your Iron Ingot is now Poor." });
    expect(document.body.querySelector("h2")?.textContent?.trim()).toBe("The attempt failed");
    expect(text()).toContain("Your Iron Ingot is now Poor.");
    expect(text()).toContain("Nothing was used up. The 8 hours are spent.");
    expect(document.body.querySelectorAll("li")).toHaveLength(0);
    expect(text()).not.toContain("Lost");
    expect(text()).not.toContain("wreckage");
  });

  it("reads one unit as a noun", () => {
    open("fail", { lost: [], craftingTime: 1 });
    expect(text()).toContain("Nothing was used up. The hour is spent.");
  });

  it("shows a critical failure's primary loss, the wreckage and that the rest is untouched", () => {
    open("ruin");
    expect(document.body.querySelector("h2")?.textContent?.trim()).toBe("Critical failure");
    const rows = [...document.body.querySelectorAll("li")].map((li) => li.textContent?.replace(/\s+/g, " ").trim());
    expect(rows).toEqual(["Iron Ingot×2"]);
    expect(text()).toContain("Returned as wreckage");
    expect(text()).toContain("Iron Ingot");
    expect(text()).not.toContain("Ruined: ");
    expect(document.body.querySelector("[data-quality=ruined]")?.textContent).toBe("Ruined");
    expect(text()).toContain("Everything else is untouched.");
  });

  it("offers Try again and Done, not Stay at the bench, after a failure or a ruin", () => {
    for (const o of ["fail", "ruin"] as const) {
      const w = open(o, { lost: [] });
      expect(button("Stay at the bench")).toBeUndefined();
      expect(button("Done")).toBeDefined();
      button("Try again")?.click();
      expect(w.emitted("retry")).toHaveLength(1);
      w.unmount();
      _resetModalStack();
      document.body.innerHTML = "";
    }
  });

  it("disables Try again with a reason when the recipe can no longer be made", () => {
    open("ruin", { canRetry: false });
    expect(button("Try again")?.hasAttribute("disabled")).toBe(true);
    expect(text()).toContain("You no longer have what this recipe needs.");
  });

  it("is labelled by its title", () => {
    open("fail");
    const panel = document.body.querySelector("[data-modal-panel]");
    const id = panel?.getAttribute("aria-labelledby");
    expect(id).toBeTruthy();
    expect(document.getElementById(id as string)?.textContent).toContain("The attempt failed");
  });

  it("Done goes back to the Workshop", () => {
    open("success");
    button("Done")?.click();
    expect(mocks.push).toHaveBeenCalledWith({ name: "play-crafting" });
  });

  it("Stay at the bench only closes", () => {
    const w = open("success");
    button("Stay at the bench")?.click();
    expect(w.emitted("close")).toHaveLength(1);
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
