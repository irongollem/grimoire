import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { h } from "vue";
import { RouterLinkStub } from "@vue/test-utils";
import AppButton from "./AppButton.vue";
import { vRollMode } from "@/directives/vRollMode";
import { buttonVariants, BUTTON_COLOUR_TONES, BUTTON_EMPHASES } from "./appButtonVariants";

const global = { stubs: { RouterLink: RouterLinkStub } };

/** Minimal stand-in for an icon component — the tests only care about its class. */
const IconStub = { render: () => h("svg") };

describe("buttonVariants", () => {
  it("defaults to the most common control in the app (subtle / sm)", () => {
    const cls = buttonVariants({});
    expect(cls).toContain("border-border");
    expect(cls).toContain("text-muted-foreground");
    expect(cls).toContain("text-label-lg");
    expect(cls).toContain("px-3");
  });

  it("maps each size onto its typography role", () => {
    expect(buttonVariants({ size: "xs" })).toContain("text-label");
    expect(buttonVariants({ size: "sm" })).toContain("text-label-lg");
    expect(buttonVariants({ size: "lg" })).toContain("text-sm");
  });

  // Bare text actions sit inline in a row; giving them a box would shift the
  // layout around them.
  it("gives the inline sizes no padding or radius", () => {
    for (const size of ["inline", "inline-xs"] as const) {
      const cls = buttonVariants({ size });
      expect(cls).not.toMatch(/\bp[xy]?-/);
      expect(cls).not.toContain("rounded");
    }
  });

  it("keeps the ≥44px touch target on md and drops it from md up", () => {
    const cls = buttonVariants({ size: "md" });
    expect(cls).toContain("min-h-11");
    expect(cls).toContain("md:min-h-0");
  });

  it("applies one selected treatment for toggles", () => {
    expect(buttonVariants({ active: true })).toContain("bg-primary/10");
    expect(buttonVariants({ active: false })).not.toContain("bg-primary/10");
  });

  // `border-primary` on a variant with no border *width* paints nothing, and adding
  // the width would make a ghost toggle jump 1px when selected.
  it("only colours the selected border on variants that have one", () => {
    expect(buttonVariants({ variant: "subtle", active: true })).toContain("border-primary");
    expect(buttonVariants({ variant: "outline", active: true })).toContain("border-primary");
    expect(buttonVariants({ variant: "ghost", active: true })).not.toContain("border-primary");
    expect(buttonVariants({ variant: "link", active: true })).not.toContain("border-primary");
    expect(buttonVariants({ variant: "chip", active: true })).not.toContain("border-primary");
  });

  // Flex behaviour belongs to the row, not the button: a base `shrink-0` and a
  // call-site `flex-1` are different tailwind-merge groups, so both survive and the
  // button refuses to shrink. The action-row wrappers add it back where it belongs.
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

  it("shows a spinner instead of the icon while loading, and blocks clicks", async () => {
    const Icon = { render: () => h("svg", { "data-icon": "true" }) };
    const w = mount(AppButton, { props: { label: "Saving", icon: Icon, loading: true }, global });
    expect(w.find("[data-icon]").exists()).toBe(false);
    expect(w.find(".animate-spin").exists()).toBe(true);
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

describe("tinted tones (#623)", () => {
  // The colour must stay one indirection away, or a theme can no longer repaint
  // these by reassigning `--tone-*`.
  it("resolves every tone through a --color-tone-* token, never a raw hue", () => {
    for (const tone of BUTTON_COLOUR_TONES) {
      for (const emphasis of BUTTON_EMPHASES) {
        const cls = buttonVariants({ variant: "tinted", tone, emphasis });
        expect(cls, `${tone}/${emphasis}`).toContain(`tone-${tone}`);
        // No Tailwind palette hue may leak in — that would pin the colour.
        expect(cls, `${tone}/${emphasis}`).not.toMatch(
          /\b(?:bg|border|text)-(?:red|green|blue|sky|violet|amber|emerald|rose|gold)-\d{3}/,
        );
      }
    }
  });

  it("gives each emphasis a distinct weight of the same tone", () => {
    const soft = buttonVariants({ variant: "tinted", tone: "danger", emphasis: "soft" });
    const strong = buttonVariants({ variant: "tinted", tone: "danger", emphasis: "strong" });
    const outline = buttonVariants({ variant: "tinted", tone: "danger", emphasis: "outline" });

    expect(soft).toContain("bg-tone-danger/10");
    expect(soft).toContain("hover:bg-tone-danger/20");
    expect(strong).toContain("bg-tone-danger/25");
    // `outline` is transparent until hovered — that is what separates it from soft.
    expect(outline).not.toMatch(/(?<!hover:)bg-tone-danger/);
    expect(outline).toContain("hover:bg-tone-danger/10");
  });

  // This has now been narrowed twice, each time on measured evidence: first when
  // `ghost`/`subtle` gained tone ladders, then when `link` did (35 text-only sites
  // that are coloured at rest, which neither ghost's hover-only ladder nor
  // `destructive`'s box could serve). What is left is the real boundary: a variant
  // whose colour IS its identity — the gold CTA and the grey pill — must ignore
  // `tone`, or the axis stops meaning anything.
  it("leaves the fixed-identity variants untouched by tone", () => {
    for (const variant of ["primary", "chip"] as const) {
      for (const tone of BUTTON_COLOUR_TONES) {
        expect(
          buttonVariants({ variant, tone, emphasis: "strong" }),
          `${variant}/${tone}`,
        ).toBe(buttonVariants({ variant }));
      }
    }
  });
});

describe("menu and ghost/danger (#648)", () => {
  // The `menu` variant's whole premise is that `justify-start` overrides the base
  // `justify-center`. cva only concatenates, so that override happens in cn() /
  // tailwind-merge — which means it is a property of the rendered class list, not
  // of buttonVariants() output, and it silently stops working if the base string or
  // the merge config changes. Asserted on a real mount for that reason.
  it("menu resolves to justify-start, not the base justify-center", () => {
    const wrapper = mount(AppButton, { props: { variant: "menu", label: "Send to…" }, global });
    const cls = wrapper.get("button").classes();
    expect(cls).toContain("justify-start");
    expect(cls).not.toContain("justify-center");
  });

  it("menu fills on hover, which is what separates it from ghost", () => {
    const menu = mount(AppButton, { props: { variant: "menu", label: "x" }, global })
      .get("button").classes();
    const ghost = mount(AppButton, { props: { variant: "ghost", label: "x" }, global })
      .get("button").classes();

    expect(menu).toContain("hover:bg-muted");
    expect(ghost).not.toContain("hover:bg-muted");
  });

  it("block gives menu its full-width form", () => {
    const cls = mount(AppButton, { props: { variant: "menu", block: true, label: "x" }, global })
      .get("button").classes();
    expect(cls).toContain("w-full");
  });

  // ghost + danger is the chromeless remove-row ✕. The hover colour has to *replace*
  // ghost's own hover, not sit alongside it — two hover:text-* classes would leave
  // the winner up to stylesheet order.
  it("ghost + danger replaces ghost's hover colour rather than adding to it", () => {
    const cls = mount(AppButton, {
      props: { variant: "ghost", tone: "danger", label: "Remove" },
      global,
    }).get("button").classes();

    expect(cls).toContain("hover:text-destructive");
    expect(cls).not.toContain("hover:text-foreground");
  });

  // ...and it must not leak onto ghost's default tone, or every ghost button in the
  // app turns red on hover.
  it("leaves ghost's default tone alone", () => {
    const cls = mount(AppButton, { props: { variant: "ghost", label: "Edit" }, global })
      .get("button").classes();
    expect(cls).toContain("hover:text-foreground");
    expect(cls).not.toContain("hover:text-destructive");
  });

  // ghost draws no box at rest; that is the whole reason these sites could not use
  // `destructive`, which does.
  it("ghost + danger still draws no resting box", () => {
    const cls = mount(AppButton, {
      props: { variant: "ghost", tone: "danger", label: "Remove" },
      global,
    }).get("button").classes().join(" ");
    expect(cls).not.toMatch(/(?<!hover:)\bborder\b/);
    expect(cls).not.toMatch(/(?<!hover:)\bbg-/);
  });
});

describe("fill (#648)", () => {
  it("defaults to none, so every pre-existing call site is unchanged", () => {
    const withDefault = mount(AppButton, { props: { variant: "ghost", label: "x" }, global })
      .get("button").classes().join(" ");
    expect(withDefault).not.toMatch(/hover:bg-/);
  });

  it("fill=muted gives ghost a neutral hover wash", () => {
    const cls = mount(AppButton, {
      props: { variant: "ghost", fill: "muted", label: "Bold" },
      global,
    }).get("button").classes();
    expect(cls).toContain("hover:bg-muted");
    // still no resting background — that is what keeps it a ghost.
    expect(cls.join(" ")).not.toMatch(/(?<!hover:)\bbg-/);
  });

  it("fill=tone resolves through the tone custom properties, not a pinned hue", () => {
    for (const tone of BUTTON_COLOUR_TONES) {
      const cls = buttonVariants({ variant: "ghost", fill: "tone", tone });
      expect(cls, tone).toContain(`hover:bg-tone-${tone}/10`);
      expect(cls, tone).not.toMatch(
        /hover:bg-(?:red|green|blue|sky|violet|amber|emerald|rose|gold)-\d{3}/,
      );
    }
  });

  // The danger case has to combine both halves: ghost+danger supplies the text
  // colour, fill supplies the background. Neither alone is the recipe the call
  // sites were writing by hand.
  it("ghost + danger + fill=tone gives both the text colour and the background", () => {
    const cls = mount(AppButton, {
      props: { variant: "ghost", tone: "danger", fill: "tone", label: "Remove" },
      global,
    }).get("button").classes();
    expect(cls).toContain("hover:text-destructive");
    expect(cls).toContain("hover:bg-tone-danger/10");
  });

  it("menu already fills, so it needs no fill prop", () => {
    const cls = mount(AppButton, { props: { variant: "menu", label: "x" }, global })
      .get("button").classes();
    expect(cls).toContain("hover:bg-muted");
  });
});

describe("active × tone (#648)", () => {
  it("stays gold when no tone is given, so existing toggles are unchanged", () => {
    const cls = mount(AppButton, { props: { variant: "ghost", active: true, label: "x" }, global })
      .get("button").classes();
    expect(cls).toContain("bg-primary/10");
    expect(cls).toContain("text-primary");
  });

  // The whole point: a selected state that is deliberately not gold. Each of these
  // stayed hand-rolled through three waves because `active` ignored `tone`.
  it("takes the tone's colour when one is given", () => {
    for (const tone of BUTTON_COLOUR_TONES.filter((t) => t !== "primary")) {
      const cls = buttonVariants({ variant: "ghost", active: true, tone });
      expect(cls, tone).toContain(`bg-tone-${tone}/15`);
      expect(cls, tone).toContain(`text-tone-${tone}`);
    }
  });

  // `active` has no primary compound: gold is already the untoned default, so a rule
  // for it would be redundant. Both spellings must land on the same gold.
  it("gives explicit primary and the untoned default the same gold", () => {
    const explicit = buttonVariants({ variant: "chip", active: true, tone: "primary" });
    const implicit = buttonVariants({ variant: "chip", active: true });
    expect(explicit).toBe(implicit);
    expect(explicit).toContain("bg-primary/10");
    expect(explicit).not.toContain("bg-tone-primary");
  });
});

describe("menu + danger (#648)", () => {
  // A destructive row reads red AT REST, unlike ghost which only reddens on hover:
  // it is one entry among neutral options and has to be distinguishable before you
  // point at it.
  it("is red at rest, not only on hover", () => {
    const cls = mount(AppButton, {
      props: { variant: "menu", tone: "danger", block: true, label: "Sign Out" },
      global,
    }).get("button").classes();
    expect(cls).toContain("text-destructive");
  });

  // menu's base sets hover:bg-muted and the two are the same tailwind-merge group,
  // so without restating the fill the row would redden its text and still wash
  // neutral on hover. This is the exact combination that silently did nothing
  // before, and that two agents refused to ship.
  it("overrides menu's neutral hover fill with the destructive one", () => {
    const cls = mount(AppButton, {
      props: { variant: "menu", tone: "danger", label: "Delete" },
      global,
    }).get("button").classes();
    expect(cls).toContain("hover:bg-destructive/10");
    expect(cls).not.toContain("hover:bg-muted");
  });

  it("leaves an untoned menu row neutral", () => {
    const cls = mount(AppButton, { props: { variant: "menu", label: "Settings" }, global })
      .get("button").classes();
    expect(cls).toContain("hover:bg-muted");
    expect(cls).not.toContain("text-destructive");
  });
});

describe("v-roll-mode composes with AppButton (#648)", () => {
  // 20 roll triggers across 7 files stayed hand-rolled through four waves on the
  // assumption that a directive attaching raw listeners could not survive being put
  // on a component. It can: AppButton is single-root, so Vue hands the directive the
  // real <button>. Asserted here so the next sweep does not re-litigate it.
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
    // A plain click means "roll as normal" — the picker passes a mode instead.
    expect(handler.mock.calls[0][0]).toBeNull();
  });

  // Worth pinning explicitly: AppButton's own click guard uses stopPropagation,
  // which does NOT stop other listeners on the same element, so the guard is not
  // what protects a disabled roll button. A native `disabled` button never
  // dispatches click at all — that is. If AppButton is ever rendered as a link
  // (`to`/`href`), `disabled` stops being native and this protection disappears.
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

describe("neutral is the default tone (#648)", () => {
  // The whole reason `neutral` exists. While `primary` was the default, "explicitly
  // primary" and "unspecified" were the same value, so a ghost+primary rule would
  // have repainted every plain ghost button. These two assertions are what make the
  // distinction real, and what would break if the default ever moved back.
  it("leaves an untoned ghost button on the neutral hover", () => {
    const cls = mount(AppButton, { props: { variant: "ghost", label: "Edit" }, global })
      .get("button").classes();
    expect(cls).toContain("hover:text-foreground");
    expect(cls).not.toContain("hover:text-primary");
  });

  it("gives an explicitly primary ghost button the gold hover", () => {
    const cls = mount(AppButton, {
      props: { variant: "ghost", tone: "primary", label: "Add pool" },
      global,
    }).get("button").classes();
    expect(cls).toContain("hover:text-primary");
    expect(cls).not.toContain("hover:text-foreground");
  });

  // Guards the migration itself: every tinted call site was checked to pass an
  // explicit tone before the default moved, because tinted is the variant that would
  // silently lose its colour. If someone adds an untoned one, it renders bare.
  it("gives tinted no colour without an explicit tone", () => {
    const bare = buttonVariants({ variant: "tinted" });
    expect(bare).not.toMatch(/bg-tone-/);
  });
});

describe("ghost hover tones (#648)", () => {
  // Only expressible once `neutral` became the default tone. Before that, any rule
  // keyed on a tone would have fired on every untoned ghost button in the app.
  // Asserted on a mount, not on buttonVariants() output: cva only concatenates, so
  // the raw string legitimately contains BOTH ghost's `hover:text-foreground` and the
  // compound's colour. Which one survives is decided by cn()/tailwind-merge at render,
  // and that is the thing a call site actually gets.
  it("recolours the hover for every colour tone", () => {
    for (const tone of BUTTON_COLOUR_TONES) {
      const cls = mount(AppButton, { props: { variant: "ghost", tone, label: "x" }, global })
        .get("button").classes();
      expect(cls.join(" "), tone).toMatch(/hover:text-(primary|destructive|tone-\w+)/);
      expect(cls, tone).not.toContain("hover:text-foreground");
    }
  });

  it("still leaves the untoned ghost neutral", () => {
    expect(buttonVariants({ variant: "ghost" })).toContain("hover:text-foreground");
  });
});

describe("iconSize (#648)", () => {
  // Default must stay h-3.5, which is what :icon hard-coded before this prop
  // existed — 243 call sites rely on it and none of them passes iconSize.
  it("defaults to the historic h-3.5", () => {
    const html = mount(AppButton, { props: { icon: IconStub, label: "x" }, global }).html();
    expect(html).toContain("h-3.5 w-3.5");
  });

  it("sizes the glyph without touching the button box", () => {
    for (const [size, cls] of [["xs", "h-3 w-3"], ["md", "h-4 w-4"], ["lg", "h-5 w-5"]] as const) {
      const wrapper = mount(AppButton, { props: { icon: IconStub, iconSize: size, label: "x" }, global });
      expect(wrapper.html(), size).toContain(cls);
      // the button's own padding comes from `size`, not `iconSize`
      expect(wrapper.get("button").classes(), size).toContain("px-3");
    }
  });

  it("applies to the trailing icon and the loading spinner too", () => {
    const trailing = mount(AppButton, {
      props: { iconRight: IconStub, iconSize: "lg", label: "x" }, global,
    }).html();
    expect(trailing).toContain("h-5 w-5");

    const loading = mount(AppButton, {
      props: { icon: IconStub, iconSize: "lg", loading: true, label: "x" }, global,
    }).html();
    expect(loading).toContain("h-5 w-5");
    expect(loading).toContain("animate-spin");
  });
});

describe("active border follows tone (#648)", () => {
  // A selected `tone="success"` button used to render green text on a green fill
  // inside a GOLD border, because the border rule ignored tone entirely.
  it("colours the selected border to match the tone", () => {
    for (const tone of BUTTON_COLOUR_TONES.filter((t) => t !== "primary")) {
      const cls = buttonVariants({ variant: "subtle", active: true, tone });
      expect(cls, tone).toContain(`border-tone-${tone}`);
    }
  });

  it("keeps gold for an untoned selection", () => {
    const cls = buttonVariants({ variant: "subtle", active: true });
    expect(cls).toContain("border-primary");
    expect(cls).not.toMatch(/border-tone-/);
  });

  // The gold rule also used to outrank tinted's own per-tone border from the
  // tinted x tone x emphasis table.
  it("does not override tinted's own border colour", () => {
    const cls = buttonVariants({ variant: "tinted", tone: "success", emphasis: "soft", active: true });
    expect(cls).toContain("border-tone-success");
  });
});

describe("subtle hover tones (#648)", () => {
  it("recolours border and text together for every colour tone", () => {
    for (const tone of BUTTON_COLOUR_TONES) {
      const cls = mount(AppButton, { props: { variant: "subtle", tone, label: "x" }, global })
        .get("button").classes().join(" ");
      expect(cls, tone).toMatch(/hover:text-(primary|destructive|tone-\w+)/);
      expect(cls, tone).toMatch(/hover:border-(primary|destructive|tone-\w+)/);
    }
  });

  it("leaves an untoned subtle button on the neutral hover", () => {
    const cls = mount(AppButton, { props: { variant: "subtle", label: "x" }, global })
      .get("button").classes();
    expect(cls).toContain("hover:text-foreground");
    expect(cls).toContain("hover:border-primary/50");
  });
});

describe("link reads tone (#648)", () => {
  // Coloured at REST, unlike ghost's hover-only ladder — that distinction is the
  // reason this exists, so assert the resting class specifically.
  it("colours the text at rest, not on hover", () => {
    const cls = mount(AppButton, { props: { variant: "link", tone: "danger", label: "Unequip" }, global })
      .get("button").classes();
    expect(cls).toContain("text-destructive");
  });

  it("draws no box, which is what separates it from destructive", () => {
    const cls = mount(AppButton, { props: { variant: "link", tone: "danger", label: "x" }, global })
      .get("button").classes().join(" ");
    expect(cls).not.toMatch(/\bborder\b/);
    expect(cls).not.toMatch(/(?<!hover:)\bbg-/);
  });

  it("stays gold when untoned", () => {
    const cls = mount(AppButton, { props: { variant: "link", label: "Open →" }, global })
      .get("button").classes();
    expect(cls).toContain("text-primary");
  });
});
