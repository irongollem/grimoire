import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mount } from "@vue/test-utils";
import { h } from "vue";
import { RouterLinkStub } from "@vue/test-utils";
import AppButton from "./AppButton.vue";
import { vRollMode } from "@/directives/vRollMode";
import { buttonVariants, BUTTON_COLOUR_TONES, BUTTON_EMPHASES } from "./appButtonVariants";

// Pruned under #1116. "Variant X contains class Y" tests are gone: the compile-time
// BUTTON_VARIANTS / BUTTON_SIZES assertion and /dev/components own "every variant
// exists and renders". What stays is what neither can see: which class WINS a
// tailwind-merge conflict on a real mount, cva key order, sweeps over the whole
// table, and behaviour.

const global = { stubs: { RouterLink: RouterLinkStub } };

/** Minimal stand-in for an icon component. */
const IconStub = { render: () => h("svg") };

type Props = Record<string, unknown>;

/** The class list a call site actually gets: cva output merged by cn() on a real mount. */
function mounted(props: Props): string[] {
  return mount(AppButton, { props: { label: "x", ...props }, global }).get("button").classes();
}

/** A resting (non-hover) background or border. */
const RESTING_BG = /(?<!hover:)\bbg-/;
const RESTING_BORDER = /(?<!hover:)\bborder\b/;
const RAW_HUE = "(?:red|green|blue|sky|violet|amber|emerald|rose|gold)-\\d{3}";

describe("buttonVariants", () => {
  // `border-primary` on a variant with no border *width* paints nothing, and adding
  // the width would make a ghost toggle jump 1px when selected.
  it.each([
    ["subtle", true],
    ["outline", true],
    ["ghost", false],
    ["link", false],
    ["chip", false],
  ] as const)("selected %s: coloured border is %s", (variant, hasBorder) => {
    expect(buttonVariants({ variant, active: true }).includes("border-primary")).toBe(hasBorder);
  });

  // Flex behaviour belongs to the row, not the button: a base `shrink-0` and a
  // call-site `flex-1` are different tailwind-merge groups, so both survive and the
  // button refuses to shrink.
  it("does not force shrink-0 on every button", () => {
    expect(buttonVariants({})).not.toContain("shrink-0");
  });
});

describe("AppButton", () => {
  it("renders a native button by default and carries the label", () => {
    const w = mount(AppButton, { props: { label: "Save" }, global });
    expect(w.element.tagName).toBe("BUTTON");
    expect(w.attributes("type")).toBe("button");
    expect(w.text()).toBe("Save");
  });

  it("renders a RouterLink when `to` is set", () => {
    const w = mount(AppButton, { props: { label: "Open", to: "/spells" }, global });
    expect(w.element.tagName).not.toBe("BUTTON");
    expect(w.findComponent(RouterLinkStub).props("to")).toBe("/spells");
    expect(w.attributes("type")).toBeUndefined();
  });

  it("renders an anchor when `href` is set", () => {
    const w = mount(AppButton, { props: { label: "Docs", href: "https://example.test" }, global });
    expect(w.element.tagName).toBe("A");
    expect(w.attributes("href")).toBe("https://example.test");
  });

  // The whole point of routing `class` through cn(): a call site overriding the
  // size must actually replace the variant's, not sit alongside it.
  it("lets a call-site class beat the variant default", () => {
    const w = mount(AppButton, { props: { label: "Go", size: "sm", class: "text-sm" }, global });
    const cls = w.attributes("class") ?? "";
    expect(cls).toContain("text-sm");
    expect(cls).not.toContain("text-label-lg");
  });

  it("does not emit a duplicate class attribute", () => {
    const w = mount(AppButton, { props: { label: "Go", class: "w-32" }, global });
    expect(w.html().match(/class=/g)).toHaveLength(1);
  });

  it("forwards unrelated attributes", () => {
    const w = mount(AppButton, {
      props: { label: "Go" },
      attrs: { "data-testid": "go", "aria-pressed": "true" },
      global,
    });
    expect(w.attributes("data-testid")).toBe("go");
    expect(w.attributes("aria-pressed")).toBe("true");
  });

  it("emits click when enabled and swallows it when disabled", async () => {
    const w = mount(AppButton, { props: { label: "Go" }, global });
    await w.trigger("click");
    expect(w.emitted("click")).toHaveLength(1);

    const d = mount(AppButton, { props: { label: "Go", disabled: true }, global });
    await d.trigger("click");
    expect(d.emitted("click")).toBeUndefined();
    expect(d.attributes("disabled")).toBeDefined();
  });

  // A RouterLink ignores `disabled`, so links need the aria + guard instead.
  it("marks a disabled link aria-disabled and blocks its click", async () => {
    const w = mount(AppButton, { props: { label: "Go", href: "#x", disabled: true }, global });
    expect(w.attributes("aria-disabled")).toBe("true");
    await w.trigger("click");
    expect(w.emitted("click")).toBeUndefined();
  });

  it("shows the loader instead of the icon while loading, and blocks clicks", async () => {
    const Icon = { render: () => h("svg", { "data-icon": "true" }) };
    const w = mount(AppButton, { props: { label: "Saving", icon: Icon, loading: true }, global });
    expect(w.find("[data-icon]").exists()).toBe(false);
    expect(w.find(".dg-flag").exists()).toBe(true);
    await w.trigger("click");
    expect(w.emitted("click")).toBeUndefined();
  });

  it("collapses the label below sm, or swaps in the mobile one", () => {
    const collapsed = mount(AppButton, {
      props: { label: "New Monster", collapseLabelOnMobile: true },
      global,
    });
    expect(collapsed.find("span.max-sm\\:hidden").text()).toBe("New Monster");

    const swapped = mount(AppButton, {
      props: { label: "New Monster", mobileLabel: "+Monster" },
      global,
    });
    expect(swapped.find("span.max-sm\\:hidden").text()).toBe("New Monster");
    expect(swapped.find("span.sm\\:hidden").text()).toBe("+Monster");
  });

  // List rows collapse at sm; detail-page header actions sit in a tighter row and
  // collapsed at lg before PageHeaderAction was folded in.
  it("honours the collapse breakpoint", () => {
    const w = mount(AppButton, {
      props: { label: "Delete", collapseLabelOnMobile: true, collapseBelow: "lg" },
      global,
    });
    expect(w.find("span.max-lg\\:hidden").text()).toBe("Delete");
    expect(w.find("span.max-sm\\:hidden").exists()).toBe(false);
  });

  it("prefers the default slot over the label prop", () => {
    const w = mount(AppButton, {
      props: { label: "ignored" },
      slots: { default: "<em>custom</em>" },
      global,
    });
    expect(w.html()).toContain("<em>custom</em>");
    expect(w.text()).not.toContain("ignored");
  });

  // WCAG 2.5.3 (Label in Name): the accessible name must contain the visible text.
  // A descriptive tooltip supplements via `title`; it must not replace the name, or
  // a voice-control user asking for the button by what it says gets no match.
  it("keeps the visible label as the accessible name and puts the tooltip in title", () => {
    const w = mount(AppButton, {
      props: { label: "With Party", tooltip: "With the party — joins new encounters." },
      global,
    });
    expect(w.attributes("aria-label")).toBe("With Party");
    expect(w.attributes("title")).toBe("With the party — joins new encounters.");
  });

  it("falls back to the tooltip only when there is no visible label", () => {
    const w = mount(AppButton, { props: { tooltip: "Delete this row" }, global });
    expect(w.attributes("aria-label")).toBe("Delete this row");
  });

  it("lets an explicit ariaLabel win over both", () => {
    const w = mount(AppButton, {
      props: { label: "Kanban", tooltip: "Switch to list view", ariaLabel: "Switch to list view" },
      global,
    });
    expect(w.attributes("aria-label")).toBe("Switch to list view");
  });
});

describe("tone and emphasis tables (#623)", () => {
  // The colour must stay one indirection away, or a theme can no longer repaint
  // these by reassigning `--tone-*`.
  it("resolves every tinted tone through a --color-tone-* token, never a raw hue", () => {
    for (const tone of BUTTON_COLOUR_TONES) {
      for (const emphasis of BUTTON_EMPHASES) {
        const cls = buttonVariants({ variant: "tinted", tone, emphasis });
        expect(cls, `${tone}/${emphasis}`).toContain(`tone-${tone}`);
        expect(cls, `${tone}/${emphasis}`).not.toMatch(new RegExp(`\\b(?:bg|border|text)-${RAW_HUE}`));
      }
    }
  });

  it("gives each emphasis of a tone a distinct class list", () => {
    for (const tone of BUTTON_COLOUR_TONES) {
      const lists = BUTTON_EMPHASES.map((emphasis) => buttonVariants({ variant: "tinted", tone, emphasis }));
      expect(new Set(lists).size, tone).toBe(BUTTON_EMPHASES.length);
    }
  });

  // What is left of the narrowing: a variant whose colour IS its identity (the gold
  // CTA, the grey pill) must ignore `tone`, or the axis stops meaning anything.
  it("leaves the fixed-identity variants untouched by tone", () => {
    for (const variant of ["primary", "chip"] as const) {
      for (const tone of BUTTON_COLOUR_TONES) {
        expect(buttonVariants({ variant, tone, emphasis: "strong" }), `${variant}/${tone}`).toBe(
          buttonVariants({ variant }),
        );
      }
    }
  });

  // Guards the migration itself: tinted is the variant that would silently lose its
  // colour if someone adds an untoned one.
  it("gives tinted no colour without an explicit tone", () => {
    expect(buttonVariants({ variant: "tinted" })).not.toMatch(/bg-tone-/);
  });

  it("fill=tone resolves through the tone tokens, not a pinned hue", () => {
    for (const tone of BUTTON_COLOUR_TONES) {
      const cls = buttonVariants({ variant: "ghost", fill: "tone", tone });
      expect(cls, tone).toContain(`hover:bg-tone-${tone}/10`);
      expect(cls, tone).not.toMatch(new RegExp(`hover:bg-${RAW_HUE}`));
    }
  });

  // The selected state that is deliberately not gold. Each of these stayed hand-rolled
  // through three waves because `active` ignored `tone` (#648).
  it("active takes the tone's colour and border when one is given", () => {
    for (const tone of BUTTON_COLOUR_TONES.filter((t) => t !== "primary")) {
      const cls = buttonVariants({ variant: "subtle", active: true, tone });
      expect(cls, tone).toContain(`bg-tone-${tone}/15`);
      expect(cls, tone).toContain(`text-tone-${tone}`);
      // A selected tone="success" button once sat inside a GOLD border.
      expect(cls, tone).toContain(`border-tone-${tone}`);
    }
  });

  // `active` has no primary compound: both spellings must land on the same gold.
  it("gives explicit primary and the untoned default the same selected gold", () => {
    const explicit = buttonVariants({ variant: "chip", active: true, tone: "primary" });
    expect(explicit).toBe(buttonVariants({ variant: "chip", active: true }));
    expect(explicit).not.toContain("bg-tone-primary");
  });

  it("selected border stays gold when untoned, and leaves tinted's own border colour alone", () => {
    const untoned = buttonVariants({ variant: "subtle", active: true });
    expect(untoned).toContain("border-primary");
    expect(untoned).not.toMatch(/border-tone-/);
    // The gold rule once outranked tinted's per-tone border.
    expect(
      buttonVariants({ variant: "tinted", tone: "success", emphasis: "soft", active: true }),
    ).toContain("border-tone-success");
  });

  it("paints an opaque fill for every solid tone, with its label from the --on-* token", () => {
    for (const tone of BUTTON_COLOUR_TONES) {
      const cls = buttonVariants({ variant: "tinted", tone, emphasis: "solid" });
      expect(cls, tone).toMatch(/bg-(primary|tone-\w+)(?!\/)/);
      expect(cls, tone).not.toMatch(/bg-tone-\w+\/\d+/);
      // Dark text on a pale fill vs light on a dark one depends on the theme, so a
      // fixed text-white/black could only ever be right for some themes.
      expect(cls, tone).toContain(`text-on-${tone}`);
      expect(cls, tone).not.toMatch(/\btext-(white|black)\b/);
    }
  });

  // On tome and grimoire the tokens keep the values the classes hard-coded: amber at
  // full opacity fails contrast against white.
  it("keeps caution black and the rest white on the classic themes", () => {
    const css = readFileSync(resolve(process.cwd(), "src/assets/theme.css"), "utf8");
    expect(css).toMatch(/--on-caution:\s*#000;/);
    for (const tone of ["primary", "danger", "success", "info", "arcane"]) {
      expect(css, tone).toMatch(new RegExp(`--on-${tone}:\\s*#fff;`));
    }
  });
});

describe("tone ladders after tailwind-merge (#648)", () => {
  // Asserted on a mount, not on buttonVariants(): cva only concatenates, so the raw
  // string legitimately holds BOTH ghost's neutral hover and the compound's colour.
  // Which one survives is decided by cn() at render.
  it("ghost recolours the hover for every colour tone and drops the neutral one", () => {
    for (const tone of BUTTON_COLOUR_TONES) {
      const cls = mounted({ variant: "ghost", tone });
      expect(cls.join(" "), tone).toMatch(/hover:text-(primary|destructive|tone-\w+)/);
      expect(cls, tone).not.toContain("hover:text-foreground");
    }
  });

  // `neutral` is the default tone: while `primary` was, "explicitly primary" and
  // "unspecified" were the same value and a ghost+primary rule repainted every plain
  // ghost button.
  it("untoned ghost keeps the neutral hover; explicit primary gets the gold one", () => {
    const plain = mounted({ variant: "ghost" });
    expect(plain).toContain("hover:text-foreground");
    expect(plain).not.toContain("hover:text-primary");
    expect(plain).not.toContain("hover:text-destructive");

    const gold = mounted({ variant: "ghost", tone: "primary" });
    expect(gold).toContain("hover:text-primary");
    expect(gold).not.toContain("hover:text-foreground");
  });

  // The hover colour has to *replace* ghost's own, not sit alongside it.
  it("ghost + danger is the chromeless remove-row: red hover, no resting box", () => {
    const cls = mounted({ variant: "ghost", tone: "danger" });
    expect(cls).toContain("hover:text-destructive");
    expect(cls).not.toContain("hover:text-foreground");
    expect(cls.join(" ")).not.toMatch(RESTING_BORDER);
    expect(cls.join(" ")).not.toMatch(RESTING_BG);
  });

  it("ghost + danger + fill=tone carries both the text colour and the background", () => {
    const cls = mounted({ variant: "ghost", tone: "danger", fill: "tone" });
    expect(cls).toContain("hover:text-destructive");
    expect(cls).toContain("hover:bg-tone-danger/10");
  });

  it("subtle recolours border and text together for every colour tone, neutral when untoned", () => {
    for (const tone of BUTTON_COLOUR_TONES) {
      const cls = mounted({ variant: "subtle", tone }).join(" ");
      expect(cls, tone).toMatch(/hover:text-(primary|destructive|tone-\w+)/);
      expect(cls, tone).toMatch(/hover:border-(primary|destructive|tone-\w+)/);
    }
    const plain = mounted({ variant: "subtle" });
    expect(plain).toContain("hover:text-foreground");
    expect(plain).toContain("hover:border-primary/50");
  });

  // Coloured at REST, unlike ghost's hover-only ladder: that is why `link` exists.
  it("link colours the text at rest, draws no box, and is gold when untoned", () => {
    const danger = mounted({ variant: "link", tone: "danger" });
    expect(danger).toContain("text-destructive");
    expect(danger.join(" ")).not.toMatch(/\bborder\b/);
    expect(danger.join(" ")).not.toMatch(RESTING_BG);
    expect(mounted({ variant: "link" })).toContain("text-primary");
  });
});

describe("menu (#648)", () => {
  // The `menu` variant's premise is that `justify-start` overrides the base
  // `justify-center`. cva only concatenates, so that happens in tailwind-merge and
  // silently stops working if the base string or the merge config changes.
  it("resolves to justify-start, not the base justify-center", () => {
    const cls = mounted({ variant: "menu" });
    expect(cls).toContain("justify-start");
    expect(cls).not.toContain("justify-center");
  });

  it("block gives it the full-width form", () => {
    expect(mounted({ variant: "menu", block: true })).toContain("w-full");
  });

  it("colours the row at rest for every tone, never red for an untoned one", () => {
    for (const tone of BUTTON_COLOUR_TONES) {
      expect(mounted({ variant: "menu", tone }).join(" "), tone).toMatch(
        /(?<!hover:)text-(primary|destructive|tone-\w+)/,
      );
    }
    expect(mounted({ variant: "menu" })).not.toContain("text-destructive");
  });

  // menu's base sets hover:bg-muted and the two are the same tailwind-merge group, so
  // without restating the fill the row reddens its text and still washes neutral on
  // hover. This combination silently did nothing before.
  it("danger overrides the neutral hover fill; every other tone keeps it", () => {
    const danger = mounted({ variant: "menu", tone: "danger" });
    expect(danger).toContain("hover:bg-destructive/10");
    expect(danger).not.toContain("hover:bg-muted");
    for (const tone of BUTTON_COLOUR_TONES.filter((t) => t !== "danger")) {
      expect(mounted({ variant: "menu", tone }), tone).toContain("hover:bg-muted");
    }
  });
});

describe("fill, surface and outline washes (#648)", () => {
  it("fill defaults to none; fill=muted washes ghost on hover without a resting background", () => {
    expect(mounted({ variant: "ghost" }).join(" ")).not.toMatch(/hover:bg-/);
    const cls = mounted({ variant: "ghost", fill: "muted" });
    expect(cls).toContain("hover:bg-muted");
    expect(cls.join(" ")).not.toMatch(RESTING_BG);
  });

  it("surface paints a resting background where fill only paints on hover; default is flat", () => {
    expect(mounted({ variant: "subtle", surface: "card" })).toContain("bg-card");
    expect(mounted({ variant: "subtle" }).join(" ")).not.toMatch(RESTING_BG);
  });

  // Bare vs hover modifier are different tailwind-merge groups, so a control carries a
  // resting surface AND a distinct hover fill without either eating the other.
  it("surface composes with fill rather than colliding", () => {
    const cls = mounted({ variant: "subtle", surface: "card", fill: "muted" });
    expect(cls).toContain("bg-card");
    expect(cls).toContain("hover:bg-muted");
  });

  // Ordering guard. `surface` and `active` both write the background group, so cva key
  // order decides which survives. With `surface` after `active`, a selected button
  // silently stopped looking selected.
  it("a selected button keeps its tint over a resting surface, and shows the surface otherwise", () => {
    const selected = mounted({ variant: "subtle", surface: "card", active: true });
    expect(selected).toContain("bg-primary/10");
    expect(selected).not.toContain("bg-card");
    expect(mounted({ variant: "subtle", surface: "card" })).toContain("bg-card");
  });

  it("outline + fill lights the background without recolouring the text; plain outline keeps accent", () => {
    const filled = mounted({ variant: "outline", fill: "muted" });
    expect(filled).toContain("hover:bg-muted");
    expect(filled).toContain("hover:text-foreground");
    expect(filled).not.toContain("hover:bg-accent");
    expect(filled).not.toContain("hover:text-accent-foreground");

    const plain = mounted({ variant: "outline" });
    expect(plain).toContain("hover:bg-accent");
    expect(plain).toContain("hover:text-accent-foreground");
  });

  it("tinted neutral is a plain pill with no tone colour, beside toned states that have it", () => {
    const neutral = mount(AppButton, { props: { variant: "tinted", as: "span", label: "free" }, global })
      .get("span").classes().join(" ");
    expect(neutral).toContain("bg-muted");
    expect(neutral).not.toMatch(/bg-tone-/);

    const toned = mount(AppButton, { props: { variant: "tinted", tone: "info", as: "span", label: "t" }, global })
      .get("span").classes().join(" ");
    expect(toned).toContain("bg-tone-info/10");
  });
});

describe("shape (#648)", () => {
  // The ordering guard. `shape` is declared after `size` in the cva config so its
  // `rounded-full` wins the border-radius group in tailwind-merge. Move the key above
  // `size` and every pill silently un-rounds: invisible to typecheck, lint and build.
  it("pill rounds fully, beating the size's own radius", () => {
    for (const size of ["xs", "sm", "md", "icon-xs", "icon-sm"] as const) {
      const cls = mounted({ size, shape: "pill" });
      expect(cls.filter((c) => c.startsWith("rounded")), size).toEqual(["rounded-full"]);
    }
  });

  it("the default shape keeps the size's own, smaller radius", () => {
    const radius = mounted({ size: "sm" }).filter((c) => c.startsWith("rounded"));
    expect(radius).toHaveLength(1);
    expect(radius).not.toContain("rounded-full");
  });
});

describe("sizes and iconSize (#648)", () => {
  // Paired with `ghost`, which draws nothing of its own, so what is asserted is the
  // SIZE's contribution.
  it("the inline sizes carry no box at all", () => {
    for (const size of ["inline-body", "inline-caption", "inline", "inline-xs"] as const) {
      const cls = mounted({ variant: "ghost", size }).join(" ");
      expect(cls, size).not.toMatch(/\bp[xy]?-[\d.]/);
      expect(cls, size).not.toMatch(/\bborder\b/);
      expect(cls, size).not.toMatch(/\brounded/);
    }
  });

  // The reading face, not the Cinzel label roles the other inline sizes force: 10 call
  // sites were cancelling that with a class override.
  it("inline-body and inline-caption render the reading face, not a label role", () => {
    expect(mounted({ size: "inline-body" })).toContain("text-body");
    expect(mounted({ size: "inline-body" }).join(" ")).not.toMatch(/text-label/);
    expect(mounted({ size: "inline-caption" })).toContain("text-caption");
    expect(mounted({ size: "inline-caption" }).join(" ")).not.toMatch(/text-label/);
  });

  // Every size sets exactly one text-size class after the merge; a stray second one
  // means a compound or a call-site override is fighting the size instead of replacing it.
  it("every size resolves to a single text-size class", () => {
    const sizes = ["xs", "sm", "md", "lg", "inline", "inline-xs", "inline-body", "inline-caption"] as const;
    for (const size of sizes) {
      const sizeClasses = mounted({ size }).filter((c) => /^text-(label|label-lg|body|caption|xs|sm|base|lg)$/.test(c));
      expect(sizeClasses, size).toHaveLength(1);
    }
  });

  // Default must stay h-3.5, which is what :icon hard-coded before this prop existed:
  // 243 call sites rely on it and none passes iconSize.
  it("iconSize defaults to the historic h-3.5", () => {
    const html = mount(AppButton, { props: { icon: IconStub, label: "x" }, global }).html();
    expect(html).toContain("h-3.5 w-3.5");
  });

  it("iconSize sizes the leading icon, trailing icon and loader alike, never the button box", () => {
    // The glyph's own box: `svg` for an icon, the span wrapping the flag for the loader.
    const glyphClass = (props: Props, selector: string) =>
      mount(AppButton, { props: { label: "x", ...props }, global }).get(selector).classes().join(" ");
    const boxes = new Set<string>();
    const glyphs = new Set<string>();
    for (const iconSize of ["xs", "sm", "md", "lg"]) {
      const lead = glyphClass({ icon: IconStub, iconSize }, "svg");
      expect(glyphClass({ iconRight: IconStub, iconSize }, "svg"), iconSize).toBe(lead);
      expect(glyphClass({ icon: IconStub, iconSize, loading: true }, "span[aria-hidden]"), iconSize).toBe(
        `${lead} grid place-items-center`,
      );
      glyphs.add(lead);
      // the button's own padding comes from `size`, not `iconSize`
      boxes.add(mounted({ icon: IconStub, iconSize }).join(" "));
    }
    expect(glyphs.size).toBe(4);
    expect(boxes.size).toBe(1);
  });
});

describe("v-roll-mode composes with AppButton (#648)", () => {
  // 20 roll triggers across 7 files stayed hand-rolled on the assumption that a
  // directive attaching raw listeners could not survive being put on a component. It
  // can: AppButton is single-root, so Vue hands the directive the real <button>.
  it("fires through the component onto the underlying button", async () => {
    const handler = vi.fn();
    const wrapper = mount(
      {
        components: { AppButton },
        template: `<AppButton v-roll-mode="h" label="Attack" />`,
        setup: () => ({ h: handler }),
      },
      { global: { ...global, directives: { "roll-mode": vRollMode } } },
    );

    await wrapper.get("button").trigger("click");
    expect(handler).toHaveBeenCalledTimes(1);
    // A plain click means "roll as normal": the picker passes a mode instead.
    expect(handler.mock.calls[0][0]).toBeNull();
  });

  // AppButton's own click guard uses stopPropagation, which does NOT stop other
  // listeners on the same element, so the guard is not what protects a disabled roll
  // button. A native `disabled` button never dispatches click at all. Rendered as a
  // link (`to`/`href`) that protection disappears.
  it("does not fire when disabled", async () => {
    const handler = vi.fn();
    const wrapper = mount(
      {
        components: { AppButton },
        template: `<AppButton v-roll-mode="h" disabled label="Attack" />`,
        setup: () => ({ h: handler }),
      },
      { global: { ...global, directives: { "roll-mode": vRollMode } } },
    );

    await wrapper.get("button").trigger("click");
    expect(handler).not.toHaveBeenCalled();
  });
});
