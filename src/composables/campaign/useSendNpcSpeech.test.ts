import { beforeEach, describe, expect, it, vi } from "vitest";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
const ids = vi.hoisted(() => ({ campaign: "c1" as string | null, user: "dm-1" as string | null }));

vi.mock("@/lib/supabase", () => ({ supabase: { from: (t: string) => fake.client.from(t) } }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ get activeCampaignId() { return ids.campaign; } }) }));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({ user: ids.user ? { id: ids.user } : null }) }));

import { useSendNpcSpeech } from "./useSendNpcSpeech";

const prov = { generatorType: "npc_voice", provider: "p", model: "m", generatedAt: "t", edited: false };
const tam = { id: "n1", name: "Old Tam", face: { portrait: "https://cdn.example/tam.webp", focal: null } };

describe("useSendNpcSpeech", () => {
  beforeEach(() => {
    fake.reset();
    ids.campaign = "c1";
    ids.user = "dm-1";
  });

  // Bug caught: the line posted as someone else, whispered, or without the face and the AI mark players must see.
  it("posts an open chat line from the signed-in user, named for the NPC, marked as AI, with the face", async () => {
    await useSendNpcSpeech()(tam, "  Move along.  ", prov);
    expect(fake.rows("campaign_messages")).toEqual([{
      campaign_id: "c1", user_id: "dm-1", recipient_user_id: null, sender_name: "Old Tam", message: "Move along.", type: "chat",
      metadata: { for_npc_id: "n1", speaker_portrait_url: "https://cdn.example/tam.webp", ai: true, ai_provenance: prov },
    }]);
  });

  // Bug caught: a refused insert reported as said, so the row reads "Said" for a line nobody heard.
  it("throws a refused insert and posts nothing without a campaign, a user or a line", async () => {
    const say = useSendNpcSpeech();
    fake.failNext("campaign_messages", { message: "denied", code: "42501" });
    await expect(say(tam, "Hello", null)).rejects.toMatchObject({ code: "42501" });
    await expect(say(tam, "   ", null)).rejects.toThrow();
    ids.campaign = null;
    await expect(say(tam, "Hello", null)).rejects.toThrow("No campaign");
    expect(fake.rows("campaign_messages")).toEqual([]);
  });
});
