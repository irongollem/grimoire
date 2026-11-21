import { describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import NoteTellSitting from "./NoteTellSitting.vue";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));

const mark = (over: object = {}) => ({ generatorType: "agent_table_record", provider: "openai", model: "m1", generatedAt: "2026-11-19T10:00:00Z", edited: false, ...over });
const mountTell = (ai_provenance: ReturnType<typeof mark> | null, transport = vi.fn(async () => new Response(JSON.stringify({ told: true, credits: 2 }), { status: 200 }))) => ({
  transport,
  w: mount(NoteTellSitting, { props: { note: { id: "n1", ai_provenance }, transport }, global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }]] } }),
});

describe("NoteTellSitting", () => {
  // Bug caught: the paid telling offered on a note no sitting left (the server can only refuse), or on a note the
  // Dungeon Master rewrote by hand, whose words a telling would replace.
  it("is offered only on a note a sitting left that nobody has rewritten", () => {
    expect(mountTell(mark()).w.find('[data-testid="note-tell"]').exists()).toBe(true);
    expect(mountTell(null).w.find('[data-testid="note-tell"]').exists()).toBe(false);
    expect(mountTell(mark({ generatorType: "chronicle-recap" })).w.find('[data-testid="note-tell"]').exists()).toBe(false);
    expect(mountTell(mark({ edited: true })).w.find('[data-testid="note-tell"]').exists()).toBe(false);
  });

  // Bug caught: a refusal swallowed, so the button spins back and the note never changes with no word why.
  it("asks for the telling of this note and says why when it is refused", async () => {
    const refused = vi.fn(async () => new Response(JSON.stringify({ error: "insufficient_credits" }), { status: 402 }));
    const { w } = mountTell(mark(), refused);
    await w.get('[data-testid="note-tell-go"]').trigger("click");
    await flushPromises();
    expect(refused).toHaveBeenCalledWith("n1");
    expect(w.get('[data-testid="note-tell-problem"]').text()).toContain("out of credits");
  });

  // Bug caught: the server's refusal shown as its code ("note_edited") now that `error` is a code and the sentence
  // is `message` (#1234).
  it("shows the server's sentence for a refusal, not its code", async () => {
    const refused = vi.fn(async () => new Response(JSON.stringify({ error: "note_edited", message: "This note has been rewritten by hand." }), { status: 409 }));
    const { w } = mountTell(mark(), refused);
    await w.get('[data-testid="note-tell-go"]').trigger("click");
    await flushPromises();
    expect(w.get('[data-testid="note-tell-problem"]').text()).toBe("This note has been rewritten by hand.");
  });
});
