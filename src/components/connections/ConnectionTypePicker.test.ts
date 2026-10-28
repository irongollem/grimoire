import { afterEach, describe, expect, it } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import ConnectionTypePicker from "@/components/connections/ConnectionTypePicker.vue";
import { typeChoices, type TypeChoice } from "@/lib/worldLinks/connections";

let wrapper: VueWrapper | null = null;
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

const choices = typeChoices("npc", "npc");

function render(extra: { replaces?: (c: TypeChoice) => string | null; choices?: readonly TypeChoice[]; current?: string } = {}) {
  wrapper = mount(ConnectionTypePicker, {
    attachTo: document.body,
    props: {
      word: "rival of",
      color: "var(--link-enmity)",
      subjectName: "Brenna",
      otherName: "Harl",
      choices: extra.choices ?? choices,
      isCurrent: (c: TypeChoice) => c.key === (extra.current ?? "rival"),
      ...(extra.replaces ? { replaces: extra.replaces } : {}),
    },
  });
  return wrapper;
}

const panel = () => document.body.querySelector<HTMLElement>("[data-testid='type-picker']");
const options = () => [...document.body.querySelectorAll<HTMLElement>("[data-type-option]")];

describe("ConnectionTypePicker", () => {
  it("shows the word as a button that opens a data-slip list of common types", async () => {
    const w = render();
    expect(panel()).toBeNull();
    await w.get("[data-testid='type-word']").trigger("click");
    expect(panel()?.hasAttribute("data-slip")).toBe(true);
    const labels = options().map((o) => o.textContent?.trim());
    expect(labels).toContain("friend of");
    expect(labels).not.toContain("chosen family of");
  });

  it("expands the rest under more… and filters them", async () => {
    const w = render();
    await w.get("[data-testid='type-word']").trigger("click");
    document.body.querySelector<HTMLElement>("[data-testid='type-more']")?.click();
    await w.vm.$nextTick();
    expect(options().map((o) => o.textContent?.trim())).toContain("chosen family of");
    const filter = document.body.querySelector<HTMLInputElement>("[data-testid='type-filter']");
    expect(filter).not.toBeNull();
    filter!.value = "chosen";
    filter!.dispatchEvent(new Event("input"));
    await w.vm.$nextTick();
    expect(options().map((o) => o.textContent?.trim())).toEqual(["chosen family of"]);
  });

  it("emits the picked choice and not the current one", async () => {
    const w = render();
    await w.get("[data-testid='type-word']").trigger("click");
    options().find((o) => o.textContent?.trim() === "friend of")?.click();
    await w.vm.$nextTick();
    expect(w.emitted("pick")?.[0]?.[0]).toMatchObject({ key: "friend" });
    expect(panel()).toBeNull();

    await w.get("[data-testid='type-word']").trigger("click");
    options().find((o) => o.textContent?.trim() === "rival of")?.click();
    await w.vm.$nextTick();
    expect(w.emitted("pick")).toHaveLength(1);
  });

  it("says where a record type moves the tie, and what a one-valued record replaces", async () => {
    const homeChoices = typeChoices("npc", "location");
    const w = render({
      choices: homeChoices,
      replaces: (c) => (c.key === "lives_in" ? "Replaces Thane's Crossing" : null),
    });
    await w.get("[data-testid='type-word']").trigger("click");
    const notes = [...document.body.querySelectorAll("[data-testid='type-note']")].map((n) => n.textContent);
    expect(notes.some((n) => n?.includes("Home") && n.includes("Replaces Thane's Crossing"))).toBe(true);
  });

  it("closes on Escape and hands focus back to the word", async () => {
    const w = render();
    await w.get("[data-testid='type-word']").trigger("click");
    panel()?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await w.vm.$nextTick();
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(w.get("[data-testid='type-word']").element);
  });

  it("moves between entries with the arrow keys", async () => {
    const w = render();
    await w.get("[data-testid='type-word']").trigger("click");
    await w.vm.$nextTick();
    const first = options()[0]!;
    first.focus();
    panel()?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(document.activeElement).toBe(options()[1]);
  });

  it("keeps the tie's current type listed even when it is not a common one", async () => {
    const w = render({ current: "chosen_family" });
    await w.get("[data-testid='type-word']").trigger("click");
    expect(options().map((o) => o.textContent?.trim())).toContain("chosen family of");
  });

  it("opens collapsed and unfiltered each time", async () => {
    const w = render();
    await w.get("[data-testid='type-word']").trigger("click");
    document.body.querySelector<HTMLElement>("[data-testid='type-more']")?.click();
    await w.vm.$nextTick();
    const filter = document.body.querySelector<HTMLInputElement>("[data-testid='type-filter']")!;
    filter.value = "chosen";
    filter.dispatchEvent(new Event("input"));
    await w.vm.$nextTick();
    panel()?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await w.vm.$nextTick();
    await w.get("[data-testid='type-word']").trigger("click");
    expect(document.body.querySelector("[data-testid='type-filter']")).toBeNull();
    expect(options().map((o) => o.textContent?.trim())).toContain("friend of");
    expect(options().map((o) => o.textContent?.trim())).not.toContain("chosen family of");
  });

  it("puts a replacement note only on the record types that hold one value", async () => {
    const w = render({ choices: typeChoices("npc", "location"), replaces: () => "Replaces Thane's Crossing" });
    await w.get("[data-testid='type-word']").trigger("click");
    const withNote = options().filter((o) => o.parentElement?.querySelector("[data-testid='type-note']")?.textContent?.includes("Replaces"));
    const labels = options().map((o) => o.textContent?.trim());
    expect(withNote.length).toBeGreaterThan(0);
    expect(withNote.length).toBeLessThan(labels.length);
  });
});
