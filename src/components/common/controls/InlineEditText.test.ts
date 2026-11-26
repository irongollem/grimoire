import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import InlineEditText from "./InlineEditText.vue";

function make(modelValue: string | null, extra: Record<string, unknown> = {}) {
  return mount(InlineEditText, {
    attachTo: document.body,
    props: { modelValue, placeholder: "Name it", ariaLabel: "Species name", ...extra },
  });
}
async function open(w: ReturnType<typeof make>) {
  await w.get("button").trigger("click");
  return w.get("input");
}

describe("InlineEditText", () => {
  it("clicking the text opens an input holding it (no separate edit button)", async () => {
    const w = make("Owlbear");
    expect((await open(w)).element.value).toBe("Owlbear");
    w.unmount();
  });

  it("Enter commits a changed, trimmed value and returns to the text", async () => {
    const w = make("Owlbear");
    const input = await open(w);
    await input.setValue("  Wyvern ");
    await input.trigger("keydown", { key: "Enter" });
    expect(w.emitted("commit")).toEqual([["Wyvern"]]);
    expect(w.find("input").exists()).toBe(false);
    w.unmount();
  });

  it("blur commits too (clicking outside solidifies it)", async () => {
    const w = make("Owlbear");
    const input = await open(w);
    await input.setValue("Wyvern");
    await input.trigger("blur");
    expect(w.emitted("commit")).toEqual([["Wyvern"]]);
    w.unmount();
  });

  it("Escape cancels: nothing emitted even though the draft changed", async () => {
    const w = make("Owlbear");
    const input = await open(w);
    await input.setValue("Wyvern");
    await input.trigger("keydown", { key: "Escape" });
    await w.vm.$nextTick();
    expect(w.emitted("commit")).toBeUndefined();
    expect(w.get("button").text()).toBe("Owlbear");
    w.unmount();
  });

  it("an unchanged value emits nothing", async () => {
    const w = make("Owlbear");
    const input = await open(w);
    await input.setValue("Owlbear ");
    await input.trigger("blur");
    expect(w.emitted("commit")).toBeUndefined();
    w.unmount();
  });

  it("a required field refuses blank: keeps the old value, emits nothing", async () => {
    const w = make("Owlbear", { required: true });
    const input = await open(w);
    await input.setValue("   ");
    await input.trigger("blur");
    expect(w.emitted("commit")).toBeUndefined();
    expect(w.get("button").text()).toBe("Owlbear");
    w.unmount();
  });

  it("an optional field cleared emits null, not an empty string", async () => {
    const w = make("Owlbear");
    const input = await open(w);
    await input.setValue("");
    await input.trigger("blur");
    expect(w.emitted("commit")).toEqual([[null]]);
    w.unmount();
  });

  it("an empty value shows the placeholder", () => {
    const w = make(null);
    expect(w.get("button").text()).toBe("Name it");
    w.unmount();
  });
});
