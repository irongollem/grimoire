import { describe, expect, it } from "vitest";
import {
  findPendingImages,
  markPendingImageFailed,
  replacePendingImageWithImage,
} from "@/lib/pendingImages";

describe("findPendingImages", () => {
  it("finds a top-level pendingImage node", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "pendingImage",
          attrs: { jobId: "job-1", prompt: "a dragon", size: "1024x1024", status: "pending" },
        },
      ],
    };
    expect(findPendingImages(doc)).toEqual([{ jobId: "job-1", prompt: "a dragon" }]);
  });

  it("finds pendingImage nodes nested inside other nodes", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "blockquote",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "pendingImage",
                  attrs: { jobId: "job-nested", prompt: "a tavern", size: "1024x1024", status: "pending" },
                },
              ],
            },
          ],
        },
      ],
    };
    expect(findPendingImages(doc)).toEqual([{ jobId: "job-nested", prompt: "a tavern" }]);
  });

  it("returns an empty array for an empty doc", () => {
    expect(findPendingImages({ type: "doc", content: [] })).toEqual([]);
  });

  it("returns an empty array when content is absent entirely", () => {
    expect(findPendingImages({ type: "doc" })).toEqual([]);
  });

  it("handles malformed/non-node input without throwing", () => {
    expect(findPendingImages(null)).toEqual([]);
    expect(findPendingImages(undefined)).toEqual([]);
    expect(findPendingImages("not a doc")).toEqual([]);
    expect(findPendingImages(42)).toEqual([]);
    expect(findPendingImages([])).toEqual([]);
    expect(
      findPendingImages({
        type: "doc",
        content: [{ type: "pendingImage", attrs: null }, { type: "pendingImage" }, "garbage", 1, null],
      }),
    ).toEqual([]);
  });

  it("excludes anchors whose status is failed", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "pendingImage", attrs: { jobId: "job-ok", prompt: "ok", status: "pending" } },
        { type: "pendingImage", attrs: { jobId: "job-failed", prompt: "nope", status: "failed" } },
      ],
    };
    expect(findPendingImages(doc)).toEqual([{ jobId: "job-ok", prompt: "ok" }]);
  });

  it("dedupes repeated jobIds, keeping the first occurrence", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "pendingImage", attrs: { jobId: "job-dup", prompt: "first", status: "pending" } },
        { type: "pendingImage", attrs: { jobId: "job-dup", prompt: "second", status: "pending" } },
      ],
    };
    expect(findPendingImages(doc)).toEqual([{ jobId: "job-dup", prompt: "first" }]);
  });

  it("skips anchors missing a jobId", () => {
    const doc = {
      type: "doc",
      content: [{ type: "pendingImage", attrs: { prompt: "no id", status: "pending" } }],
    };
    expect(findPendingImages(doc)).toEqual([]);
  });

  it("defaults prompt to an empty string when absent", () => {
    const doc = {
      type: "doc",
      content: [{ type: "pendingImage", attrs: { jobId: "job-no-prompt", status: "pending" } }],
    };
    expect(findPendingImages(doc)).toEqual([{ jobId: "job-no-prompt", prompt: "" }]);
  });
});

describe("replacePendingImageWithImage / markPendingImageFailed", () => {
  const anchor = (jobId: string) => ({
    type: "pendingImage",
    attrs: { jobId, prompt: "a dragon", status: "pending" },
  });
  const doc = () => ({
    type: "doc",
    content: [
      { type: "paragraph" },
      { type: "columns", content: [anchor("job-1"), anchor("job-2")] },
    ],
  });

  it("puts the image where the anchor was, leaving the other anchor alone", () => {
    const original = doc();
    const next = replacePendingImageWithImage(original, "job-1", "https://img/1.webp");
    expect(next).toEqual({
      type: "doc",
      content: [
        { type: "paragraph" },
        {
          type: "columns",
          content: [{ type: "image", attrs: { src: "https://img/1.webp" } }, anchor("job-2")],
        },
      ],
    });
    // The input is not mutated: the viewer relies on a new reference to re-render.
    expect(original).toEqual(doc());
  });

  it("keeps the anchor but marks it failed", () => {
    const next = markPendingImageFailed(doc(), "job-2");
    expect(findPendingImages(next)).toEqual([{ jobId: "job-1", prompt: "a dragon" }]);
    expect(JSON.stringify(next)).toContain('"status":"failed"');
  });

  it("returns null when the anchor is not there", () => {
    expect(replacePendingImageWithImage(doc(), "nope", "u")).toBeNull();
    expect(markPendingImageFailed(doc(), "nope")).toBeNull();
    expect(replacePendingImageWithImage("not a doc", "job-1", "u")).toBeNull();
  });
});
