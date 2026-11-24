import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, ref } from "vue";
import CanonSplit from "./CanonSplit.vue";

describe("CanonSplit", () => {
  // Bug caught: a ledger with nothing open still drew an empty detail column, or a close button with nothing to close.
  it("renders the ledger alone when there is no detail", () => {
    const w = mount(CanonSplit, { slots: { default: "<p data-testid='ledger'>ledger</p>" } });
    expect(w.find("[data-testid=ledger]").exists()).toBe(true);
    expect(w.find("[data-testid=canon-split-detail]").exists()).toBe(false);
    expect(w.find("[data-testid=canon-split-close]").exists()).toBe(false);
    expect(w.attributes("data-split-open")).toBeUndefined();
  });

  // Bug caught: the open entry lost its marker, so the page body did not widen for it, or lost the id the tap-scroll finds.
  it("renders ledger and detail with a close button, and marks itself open", () => {
    const w = mount(CanonSplit, { slots: { default: "<p data-testid='ledger'>ledger</p>", detail: "<p data-testid='the-detail'>detail</p>" } });
    expect(w.find("[data-testid=ledger]").exists()).toBe(true);
    expect(w.find("#canon-inline-detail [data-testid=the-detail]").exists()).toBe(true);
    expect(w.find("[data-testid=canon-split-close]").exists()).toBe(true);
    expect(w.attributes("data-split-open")).toBe("");
  });

  // Bug caught: the button emitted nothing, so the entry could not be closed from the pane.
  it("emits close when the close button is pressed, labelled as given", async () => {
    const w = mount(CanonSplit, { props: { closeLabel: "Close this force" }, slots: { default: "<p />", detail: "<p />" } });
    const button = w.find("[data-testid=canon-split-close]");
    expect(button.attributes("aria-label")).toBe("Close this force");
    await button.trigger("click");
    expect(w.emitted("close")).toHaveLength(1);
  });

  // Bug caught: the open state was read once, so a row tapped after the page had mounted opened nothing.
  it("opens when the detail appears after it was mounted, and closes when it goes", async () => {
    const shown = ref(false);
    const Host = defineComponent({
      components: { CanonSplit },
      setup: () => ({ shown }),
      template: "<CanonSplit><p>ledger</p><template v-if='shown' #detail><p data-testid='the-detail'>detail</p></template></CanonSplit>",
    });
    const w = mount(Host);
    expect(w.find("[data-testid=the-detail]").exists()).toBe(false);
    shown.value = true;
    await w.vm.$nextTick();
    expect(w.find("[data-testid=the-detail]").exists()).toBe(true);
    shown.value = false;
    await w.vm.$nextTick();
    expect(w.find("[data-testid=the-detail]").exists()).toBe(false);
  });
});
