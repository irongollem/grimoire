import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => ({ id: "u1" }) }));

import CharacterAiPlay from "./CharacterAiPlay.vue";

const WREN = { id: "m1", name: "Wren", campaign_id: "c1", ai_speaks: false };

async function mountPlay(props: { canSet?: boolean; own?: boolean } = {}) {
  const w = mount(CharacterAiPlay, {
    props: { member: WREN, ...props },
    global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }]] },
  });
  await flushPromises();
  return w;
}

beforeEach(() => {
  fake.reset();
  fake.seed("party_members", [{ ...WREN }, { id: "m2", name: "Folio", campaign_id: "c1", ai_speaks: false }]);
  fake.seed("party_member_memories", [
    { id: "x1", campaign_id: "c1", party_member_id: "m1", kind: "event", body: "Wren stood watch at the ferry.", created_at: "2026-11-19T10:00:00Z" },
    { id: "x2", campaign_id: "c1", party_member_id: "m2", kind: "event", body: "Folio owes the ferryman a favour.", created_at: "2026-11-19T11:00:00Z" },
  ]);
});

describe("CharacterAiPlay", () => {
  // The maintainer: the memory is one "the actual player can read". Bug caught: the list showing another
  // character's memories (the read not scoped to this one), which under the DM's wider policy shows everyone's.
  it("shows what this character lived through, and nobody else's", async () => {
    const w = await mountPlay();
    const lived = w.get('[data-testid="character-lived"]').text();
    expect(lived).toContain("Wren stood watch at the ferry.");
    expect(lived).not.toContain("Folio owes");
  });

  // Bug caught: the switch set on the wrong character, or shown to someone who may not set it.
  it("sets the switch on this character only, and only for someone who may", async () => {
    const reader = await mountPlay();
    expect(reader.find('input[type="checkbox"]').exists()).toBe(false);
    const owner = await mountPlay({ canSet: true, own: true });
    expect(owner.text()).toContain("The AI may speak for Wren when I am away");
    await owner.get('input[type="checkbox"]').setValue(true);
    await flushPromises();
    expect(fake.rows("party_members").map((r) => [r.id, r.ai_speaks])).toEqual([["m1", true], ["m2", false]]);
  });

  // Bug caught: an empty box drawn on every sheet for a character nobody has ever played for its player.
  it("draws nothing for a reader when the character lived through nothing", async () => {
    fake.reset();
    fake.seed("party_members", [{ ...WREN }]);
    const w = await mountPlay();
    expect(w.find('[data-testid="character-ai-play"]').exists()).toBe(false);
  });
});
