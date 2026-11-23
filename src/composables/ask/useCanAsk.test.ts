import { describe, expect, it, vi } from "vitest";
import { reactive } from "vue";

const auth = reactive({ currentRole: "dm" as "dm" | "player" });
const campaign = reactive({ isAiEnabled: true });
vi.mock("@/stores/auth", () => ({ useAuthStore: () => auth }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => campaign }));

const { useCanAsk } = await import("./useCanAsk");

describe("useCanAsk", () => {
  it("offers Ask to a DM in a campaign with AI on", () => {
    auth.currentRole = "dm";
    campaign.isAiEnabled = true;
    expect(useCanAsk().value).toBe(true);
  });

  it("hides Ask in a campaign with AI off, where every request would be refused", () => {
    auth.currentRole = "dm";
    campaign.isAiEnabled = false;
    expect(useCanAsk().value).toBe(false);
  });

  it("hides Ask from the player lens: it reads DM prep and secrets", () => {
    auth.currentRole = "player";
    campaign.isAiEnabled = true;
    expect(useCanAsk().value).toBe(false);
  });
});
