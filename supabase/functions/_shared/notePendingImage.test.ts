import { describe, expect, it, vi } from "vitest";
import { replacePendingImageNode, resolveNotePendingImage } from "./notePendingImage";

const doc = (nodes: unknown[]) => ({ type: "doc", content: nodes });
const anchor = (jobId: string) => ({
  type: "pendingImage",
  attrs: { jobId, prompt: "a scene", size: "1024x1024", status: "pending" },
});
const paragraph = { type: "paragraph", content: [{ type: "text", text: "hello" }] };

describe("replacePendingImageNode", () => {
  it("swaps the matching anchor for an image node and leaves siblings alone", () => {
    const input = doc([paragraph, anchor("job-1"), anchor("job-2")]);
    const { doc: out, replaced } = replacePendingImageNode(input, "job-1", "https://img/1.webp");
    expect(replaced).toBe(true);
    const content = (out as { content: unknown[] }).content;
    expect(content[0]).toEqual(paragraph);
    expect(content[1]).toEqual({ type: "image", attrs: { src: "https://img/1.webp" } });
    expect(content[2]).toEqual(anchor("job-2"));
  });

  it("finds anchors nested inside container blocks", () => {
    const input = doc([{ type: "columns", content: [paragraph, anchor("job-n")] }]);
    const { doc: out, replaced } = replacePendingImageNode(input, "job-n", "https://img/n.webp");
    expect(replaced).toBe(true);
    const columns = (out as { content: { content: unknown[] }[] }).content[0];
    expect(columns.content[1]).toEqual({ type: "image", attrs: { src: "https://img/n.webp" } });
  });

  it("returns the doc untouched when no anchor matches", () => {
    const input = doc([paragraph, anchor("job-other")]);
    const { doc: out, replaced } = replacePendingImageNode(input, "job-missing", "https://img/x.webp");
    expect(replaced).toBe(false);
    expect(out).toBe(input);
  });

  it("replaces only the first occurrence, mirroring the client resolver", () => {
    const input = doc([anchor("job-dup"), anchor("job-dup")]);
    const { doc: out } = replacePendingImageNode(input, "job-dup", "https://img/d.webp");
    const content = (out as { content: unknown[] }).content;
    expect(content[0]).toEqual({ type: "image", attrs: { src: "https://img/d.webp" } });
    expect(content[1]).toEqual(anchor("job-dup"));
  });
});

// ── resolveNotePendingImage (CAS against the notes row) ───────────────────────

function stubClient(maybeSingleResults: { data: unknown; error?: unknown }[]) {
  const query = {
    select: vi.fn(() => query),
    update: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(),
  };
  for (const r of maybeSingleResults) {
    query.maybeSingle.mockResolvedValueOnce({ data: r.data, error: r.error ?? null });
  }
  return { from: vi.fn(() => query), query } as never;
}

const noteRow = (jobId: string, updatedAt: string) => ({
  content: JSON.stringify(doc([paragraph, anchor(jobId)])),
  updated_at: updatedAt,
});

const args = { noteId: "note-1", userId: "user-1", jobId: "job-1", imageUrl: "https://img/1.webp" };

describe("resolveNotePendingImage", () => {
  it("writes the rewritten content guarded by the read updated_at", async () => {
    const admin = stubClient([
      { data: noteRow("job-1", "t1") }, // read
      { data: { id: "note-1" } },       // CAS write wins
    ]);
    await resolveNotePendingImage(admin, args);
    expect(admin.query.update).toHaveBeenCalledTimes(1);
    const written = admin.query.update.mock.calls[0][0] as { content: string };
    expect(JSON.parse(written.content).content[1]).toEqual({
      type: "image",
      attrs: { src: "https://img/1.webp" },
    });
    expect(admin.query.eq).toHaveBeenCalledWith("updated_at", "t1");
  });

  it("re-reads and retries when a concurrent save loses the CAS", async () => {
    const admin = stubClient([
      { data: noteRow("job-1", "t1") }, // read
      { data: null },                   // CAS lost — note saved mid-rewrite
      { data: noteRow("job-1", "t2") }, // re-read
      { data: { id: "note-1" } },       // CAS wins
    ]);
    await resolveNotePendingImage(admin, args);
    expect(admin.query.update).toHaveBeenCalledTimes(2);
    expect(admin.query.eq).toHaveBeenCalledWith("updated_at", "t2");
  });

  it("does not write when the anchor is gone (deleted → gallery-only)", async () => {
    const admin = stubClient([
      { data: { content: JSON.stringify(doc([paragraph])), updated_at: "t1" } },
    ]);
    await resolveNotePendingImage(admin, args);
    expect(admin.query.update).not.toHaveBeenCalled();
  });

  it("does not write when the note no longer exists", async () => {
    const admin = stubClient([{ data: null }]);
    await resolveNotePendingImage(admin, args);
    expect(admin.query.update).not.toHaveBeenCalled();
  });
});
