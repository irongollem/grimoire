import { describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import CanonAddRow from "./CanonAddRow.vue";

function open(create: (title: string) => Promise<void>) {
  const w = mount(CanonAddRow, { props: { placeholder: "A new thing…", inputLabel: "A new thing", label: "Add thing", create } });
  const input = () => w.find("input");
  return { w, input, submit: async () => { await w.find("form").trigger("submit"); await flushPromises(); } };
}

describe("CanonAddRow", () => {
  // Fails on: a blank or space-only draft creating an empty entry.
  it("creates nothing from a blank or space-only draft, and keeps the button off", async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    const { w, input, submit } = open(create);
    expect(w.find("button[type=submit]").attributes("disabled")).toBeDefined();
    await input().setValue("   ");
    await submit();
    expect(create).not.toHaveBeenCalled();
  });

  it("hands over the trimmed words and clears the box on success", async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    const { input, submit } = open(create);
    await input().setValue("  A drowned bell  ");
    await submit();
    expect(create).toHaveBeenCalledWith("A drowned bell");
    expect((input().element as HTMLInputElement).value).toBe("");
  });

  // Fails on: a failed create wiping what the DM typed.
  it("keeps the words in the box when the create fails", async () => {
    const create = vi.fn().mockRejectedValue(new Error("nope"));
    const { input, submit } = open(create);
    await input().setValue("A drowned bell");
    await submit();
    expect((input().element as HTMLInputElement).value).toBe("A drowned bell");
  });
});
