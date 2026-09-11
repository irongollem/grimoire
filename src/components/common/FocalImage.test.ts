import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FocalImage from "./FocalImage.vue";

// initPlaceholderFocalPoints/getPlaceholderFocalPoint are mocked so the test
// exercises only the URL-parsing trap in resolvePlaceholder(), not the
// smartcrop fallback or the admin DB round-trip.
vi.mock("@/lib/placeholderFocalPoints", () => ({
  initPlaceholderFocalPoints: vi.fn().mockResolvedValue(undefined),
  getPlaceholderFocalPoint: vi.fn(),
}));

import { getPlaceholderFocalPoint } from "@/lib/placeholderFocalPoints";

const mockedGetFp = vi.mocked(getPlaceholderFocalPoint);

describe("FocalImage placeholder entity-type extraction", () => {
  beforeEach(() => {
    mockedGetFp.mockReset();
    mockedGetFp.mockReturnValue({ x: 10, y: 20 });
  });

  // `print: true` is the component's own escape hatch for skipping the
  // IntersectionObserver gate — Card Forge relies on it to resolve focal
  // points inside an off-screen container. Reused here so the placeholder
  // watcher fires immediately instead of waiting on a real viewport.
  it("extracts the entity type from a local placeholder path", async () => {
    mount(FocalImage, {
      props: {
        format: "portrait",
        placeholder: "/assets/placeholders/npc.webp",
        print: true,
      },
    });
    await flushPromises();

    expect(mockedGetFp).toHaveBeenCalledWith("npc");
  });

  // The trap: once art-manifest routing lands, a placeholder URL can be
  // CDN-shaped and content-hashed — e.g.
  // `https://cdn.example.com/app-art/assets/placeholders/npc.a1b2c3d4.webp`.
  // A naive "strip the last extension" parse returns "npc.a1b2c3d4" instead
  // of "npc", which silently stops matching admin-configured focal points.
  it("extracts the entity type from a CDN-shaped, content-hashed placeholder URL", async () => {
    mount(FocalImage, {
      props: {
        format: "portrait",
        placeholder: "https://cdn.example.com/app-art/assets/placeholders/npc.a1b2c3d4.webp",
        print: true,
      },
    });
    await flushPromises();

    expect(mockedGetFp).toHaveBeenCalledWith("npc");
  });
});
