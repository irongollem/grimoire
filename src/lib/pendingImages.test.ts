import { describe, expect, it } from "vitest";
import { findPendingImages } from "./pendingImages";

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
