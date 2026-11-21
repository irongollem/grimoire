import { describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import type { ReadingTransport } from "@/composables/notes/useNoteReading";
import NoteReading from "./NoteReading.vue";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));

const AT = "2026-11-19T10:00:00.000Z";
const plain = { id: "n1", updated_at: AT, reading_hash: null, reading_at: null };
const read = { id: "n1", updated_at: AT, reading_hash: "h", reading_at: AT, reading_voice: "female" as const };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function mountReading(note: typeof plain | typeof read, canMake: boolean, transport: ReadingTransport) {
  return mount(NoteReading, {
    props: { note, canMake, transport },
    global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }]] },
    attachTo: document.body,
  });
}

describe("NoteReading", () => {
  // Bug caught: a player shown a control for a note nobody has read aloud (a button that can only fail), or
  // offered the Dungeon Master's paid action.
  it("shows a reader nothing for a note never read aloud, and only Listen for one that was", () => {
    const transport = vi.fn<ReadingTransport>();
    expect(mountReading(plain, false, transport).find('[data-testid="note-reading"]').exists()).toBe(false);
    const w = mountReading(read, false, transport);
    expect(w.find('[data-testid="note-reading-listen"]').exists()).toBe(true);
    expect(w.find('[data-testid="note-reading-ask"]').exists()).toBe(false);
  });

  // The maintainer: read aloud "of course at the same cost". Bug caught: the reading made (and charged) on the
  // first click, before the Dungeon Master has seen what it costs.
  it("tells the Dungeon Master the cost first, and makes the reading only when they go on", async () => {
    const transport = vi.fn<ReadingTransport>(async (request) => (request.action === "estimate" ? json(200, { chars: 5200, credits: 39, has: false }) : json(200, { made: true, chars: 5200, credits: 39 })));
    const w = mountReading(plain, true, transport);
    await w.get('[data-testid="note-reading-ask"]').trigger("click");
    await flushPromises();
    expect(transport.mock.calls.map((c) => c[0].action)).toEqual(["estimate"]);
    expect(w.get('[data-testid="note-reading-quote"]').text()).toContain("39 credits");
    await w.get('[data-testid="note-reading-make"]').trigger("click");
    await flushPromises();
    expect(transport.mock.calls.map((c) => c[0])).toEqual([
      { action: "estimate", noteId: "n1", voice: "male", telling: "storyteller" },
      { action: "make", noteId: "n1", voice: "male", telling: "storyteller" },
    ]);
    expect(w.find('[data-testid="note-reading-quote"]').exists()).toBe(false);
  });

  // Bug caught: the cheaper telling chosen but the dearer one's price left on screen, or the dearer one made.
  it("asks the cost again when the telling changes, and makes the one chosen", async () => {
    const transport = vi.fn<ReadingTransport>(async (request) =>
      request.action === "estimate" ? json(200, { chars: 5200, credits: request.telling === "plain" ? 39 : 66, has: false }) : json(200, { made: true, chars: 5200, credits: 39 }),
    );
    const w = mountReading(plain, true, transport);
    await w.get('[data-testid="note-reading-ask"]').trigger("click");
    await flushPromises();
    expect(w.get('[data-testid="note-reading-quote"]').text()).toContain("66 credits");
    await w.get('[data-testid="note-reading-telling"]').findAll("button").find((b) => b.text().startsWith("Plainly"))!.trigger("click");
    await flushPromises();
    expect(w.get('[data-testid="note-reading-quote"]').text()).toContain("39 credits");
    await w.get('[data-testid="note-reading-make"]').trigger("click");
    await flushPromises();
    expect(transport.mock.calls.at(-1)?.[0]).toEqual({ action: "make", noteId: "n1", voice: "male", telling: "plain" });
  });

  // Bug caught: a refusal (out of credits) swallowed, so the button spins back to rest and nothing says why.
  it("says why when the reading could not be made, and leaves the cost on screen", async () => {
    const transport = vi.fn<ReadingTransport>(async (request) => (request.action === "estimate" ? json(200, { chars: 800, credits: 6, has: false }) : json(402, { error: "insufficient_credits" })));
    const w = mountReading(plain, true, transport);
    await w.get('[data-testid="note-reading-ask"]').trigger("click");
    await flushPromises();
    await w.get('[data-testid="note-reading-make"]').trigger("click");
    await flushPromises();
    expect(w.get('[data-testid="note-reading-problem"]').text()).toContain("out of credits");
    expect(w.find('[data-testid="note-reading-quote"]').exists()).toBe(true);
  });

  // Bug caught: a 422 shown as its code ("note_too_long") now that `error` is a code and the sentence is `message` (#1234).
  it("shows the server's sentence for a refused note, not its code", async () => {
    const transport = vi.fn<ReadingTransport>(async (request) => (request.action === "estimate" ? json(422, { error: "note_too_long", message: "This note is too long to read aloud in one go." }) : json(200, {})));
    const w = mountReading(plain, true, transport);
    await w.get('[data-testid="note-reading-ask"]').trigger("click");
    await flushPromises();
    expect(w.get('[data-testid="note-reading-problem"]').text()).toBe("This note is too long to read aloud in one go.");
  });

  // Bug caught: a note rewritten after it was read aloud still presented as its reading, with nothing to say the
  // recording is of the earlier text.
  it("says the recording is of an earlier version when the note changed since", () => {
    const w = mountReading({ ...read, updated_at: "2026-11-19T11:00:00.000Z" }, true, vi.fn<ReadingTransport>());
    expect(w.get('[data-testid="note-reading-earlier"]').text()).toContain("earlier version");
    expect(w.get('[data-testid="note-reading-ask"]').text()).toBe("Read it again");
  });

  // Bug caught: the recording fetched without the caller's token (an audio element's own request), which the
  // function refuses, so nobody can hear anything.
  it("fetches the recording through the function and plays it", async () => {
    const created = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:reading");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const transport = vi.fn<ReadingTransport>(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "audio/mpeg" } }));
    const w = mountReading(read, false, transport);
    await w.get('[data-testid="note-reading-listen"]').trigger("click");
    await flushPromises();
    expect(transport).toHaveBeenCalledWith({ action: "listen", noteId: "n1" });
    expect(w.get('[data-testid="note-reading-audio"]').attributes("src")).toBe("blob:reading");
    created.mockRestore();
  });
});
