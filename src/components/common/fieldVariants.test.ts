import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { h, ref } from "vue";
import { fieldVariants, FIELD_SIZES, FIELD_TONES } from "./fieldVariants";
import AppInput from "./AppInput.vue";
import AppSelect from "./AppSelect.vue";

describe("fieldVariants", () => {
  it("keeps a select 4px tighter than an input at the same size", () => {
    expect(fieldVariants({ size: "sm", control: "select" })).toContain("px-2");
    expect(fieldVariants({ size: "sm", control: "input" })).toContain("px-3");
  });

  /**
   * The DashboardView day/month/year row puts an input, a select and an input side
   * by side, so their vertical metrics have to agree. Note this checks the emitted
   * *classes*, not rendered height — happy-dom does no layout. Equal classes are
   * necessary but not sufficient: measured in a real browser, `xs` still renders a
   * 16px select against a 20px input, because a native input has a UA minimum
   * content height that padding alone does not overcome. Every other size matches.
   */
  it("gives an input and a select the same vertical classes at every size", () => {
    for (const size of FIELD_SIZES) {
      const vertical = (control: "input" | "select") =>
        fieldVariants({ size, control })
          .split(" ")
          .filter(c => /^(py-|min-h-|md:min-h-|rounded)/.test(c))
          .sort()
          .join(" ");
      expect(vertical("input"), `size ${size}`).toBe(vertical("select"));
    }
  });

  it("carries a typography role at every size rather than a raw font size", () => {
    expect(fieldVariants({ size: "xs" })).toContain("text-label");
    expect(fieldVariants({ size: "sm" })).toContain("text-label-lg");
    expect(fieldVariants({ size: "md" })).toContain("text-label-lg");
    // `lg` has no role at 14px Cinzel, so it states the family explicitly.
    expect(fieldVariants({ size: "lg" })).toContain("font-cinzel");
    // `body` is Crimson — it must NOT pick up Cinzel.
    expect(fieldVariants({ size: "body" })).toContain("text-body");
    expect(fieldVariants({ size: "body" })).not.toContain("font-cinzel");
  });

  it("keeps the ≥44px touch target only on md", () => {
    expect(fieldVariants({ size: "md" })).toContain("min-h-11");
    expect(fieldVariants({ size: "md" })).toContain("md:min-h-0");
    for (const size of FIELD_SIZES.filter(s => s !== "md")) {
      expect(fieldVariants({ size }), `size ${size}`).not.toContain("min-h-11");
    }
  });

  it("drops the box entirely for the bare tone", () => {
    const bare = fieldVariants({ tone: "bare" });
    expect(bare).toContain("bg-transparent");
    expect(bare).toContain("border-0");
    expect(bare).not.toContain("focus:ring-1");
    for (const tone of FIELD_TONES.filter(t => t !== "bare")) {
      expect(fieldVariants({ tone }), `tone ${tone}`).toContain("border-border");
    }
  });
});

// The point of the extraction: one recipe, not three near-copies. If a component
// stops consuming it, these diverge.
describe("the field components share one box", () => {
  const boxClasses = (cls: string) =>
    cls
      .split(" ")
      .filter(c => /^(border|rounded|focus:ring|bg-card)/.test(c))
      .sort()
      .join(" ");

  it("AppInput and AppSelect agree on border, radius and focus ring", () => {
    const input = mount(AppInput, { props: { modelValue: "", tone: "card", size: "sm" } });
    const model = ref("a");
    const select = mount({
      setup: () => () =>
        h(AppSelect as never, { modelValue: model.value }, () => [
          h("option", { value: "a" }, "A"),
        ]),
    });
    expect(boxClasses(input.attributes("class") ?? "")).toBe(
      boxClasses(select.find("select").attributes("class") ?? ""),
    );
    input.unmount();
    select.unmount();
  });
});

describe("filled tone (#648)", () => {
  it("is a full-strength muted surface, distinct from the tinted-panel tone", () => {
    const filled = fieldVariants({ tone: "filled" });
    const muted = fieldVariants({ tone: "muted" });

    expect(filled).toContain("bg-muted");
    expect(filled).not.toContain("bg-muted/40");
    expect(muted).toContain("bg-muted/40");
  });

  it("keeps the same border and focus ring as the other boxed tones", () => {
    const filled = fieldVariants({ tone: "filled" });
    expect(filled).toContain("border border-border");
    expect(filled).toContain("focus:ring-1");
  });
});

describe("caption tone/size (#648)", () => {
  it("is the reading font at caption scale, not a Cinzel label", () => {
    const caption = fieldVariants({ size: "caption" });
    expect(caption).toContain("text-caption");
    expect(caption).not.toContain("text-label");
  });

  it("keeps the select 2px tighter than the input, like every other size", () => {
    expect(fieldVariants({ size: "caption", control: "input" })).toContain("px-2");
    expect(fieldVariants({ size: "caption", control: "select" })).toContain("px-1.5");
  });
});
