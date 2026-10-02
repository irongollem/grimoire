import { afterEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import type { VueWrapper } from "@vue/test-utils";
import PaywallModal from "./PaywallModal.vue";

/**
 * What a young player's account is told at a limit (#928). The rule is legal,
 * not stylistic: a child must not be urged to buy or to get a parent to buy
 * (Unfair Commercial Practices Directive, Annex I, point 28), so none of the
 * words that sell the plan may reach them.
 */

const childState = vi.hoisted(() => ({ isChild: false }));

vi.mock("vue-router", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/composables/account/useChildAccount", async () => {
  const { computed } = await import("vue");
  return { useChildAccount: () => ({ isChild: computed(() => childState.isChild) }) };
});
vi.mock("@/composables/billing/useQuota", async () => {
  const { ref } = await import("vue");
  return {
    useQuota: () => ({ quota: ref({ allowed: false, current: 10, limit: 10, unlimited: false }) }),
  };
});
vi.mock("@/composables/billing/useProPricing", async () => {
  const { ref } = await import("vue");
  return {
    useProPricing: () => ({
      monthlyLabel: ref("€12.99"),
      yearlyLabel: ref("€99"),
      savedMonths: ref(4),
      monthlyCredits: ref(1000),
    }),
  };
});

let wrapper: VueWrapper | undefined;
afterEach(() => wrapper?.unmount());

function render(isChild: boolean, props: { resource?: "npcs"; message?: string }) {
  childState.isChild = isChild;
  wrapper = mount(PaywallModal, {
    props: { modelValue: true, ...props },
    global: { stubs: { teleport: true } },
    attachTo: document.body,
  });
  return document.body.textContent ?? "";
}

const SELLING_WORDS = /upgrad|\bpro\b|\bfree\b|plan|€|credits/i;

describe("PaywallModal", () => {
  it("tells a young player at a content limit what the account allows, and sells nothing", () => {
    const text = render(true, { resource: "npcs" });
    expect(text).toContain("You've reached your limit");
    expect(text).toContain("A young player's account can have up to");
    expect(text).toContain("10 npcs");
    expect(text).not.toMatch(SELLING_WORDS);
    // The limit a child meets is not an AI gate, and must not be described as one.
    expect(text).not.toContain("AI features");
  });

  it("tells a young player at a Pro-only feature that it is not available, and sells nothing", () => {
    const text = render(true, { message: "Custom tile packs are a Pro feature." });
    expect(text).toContain("Not available");
    expect(text).toContain("This isn't available on a young player's account.");
    expect(text).not.toMatch(SELLING_WORDS);
  });

  it("keeps the offer for everyone else", () => {
    const text = render(false, { resource: "npcs" });
    expect(text).toContain("You've reached your free limit");
    expect(text).toContain("Upgrade to Pro");
    expect(text).toContain("Maybe later");
  });
});
