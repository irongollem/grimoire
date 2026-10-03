import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CharacterContentReview } from "@/composables/party/useCharacterContentReviews";

const refetch = vi.fn();
const seenIds: (string | null)[] = [];

vi.mock("@/composables/party/useCharacterContentReviews", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/composables/party/useCharacterContentReviews")>();
  return {
    ...actual,
    useCharacterContentReviews: (id: { value: string | null }) => {
      seenIds.push(id.value);
      return { refetch: () => { seenIds.push(id.value); return refetch(); } };
    },
  };
});

import { benchedMessage, useBenchedAfterAttach } from "./useBenchedAfterAttach";

function review(status: "pending" | "approved"): CharacterContentReview {
  return { status } as CharacterContentReview;
}

describe("benchedMessage", () => {
  it("names the character and the table and counts the choices", () => {
    expect(benchedMessage("Mira", "Strahd", 1)).toBe(
      "Mira joined Strahd, but 1 choice is waiting for the DM's approval. They cannot be made active yet.",
    );
    expect(benchedMessage("Mira", "Strahd", 3)).toContain("3 choices are waiting");
    expect(benchedMessage("Mira", null, 2)).toContain("joined the table");
    expect(benchedMessage(null, "Strahd", 2)).toMatch(/^Your character joined Strahd/);
  });
});

describe("useBenchedAfterAttach", () => {
  beforeEach(() => {
    refetch.mockReset();
    seenIds.length = 0;
  });

  it("counts only the pending flags on the attached character", async () => {
    refetch.mockResolvedValue({ data: [review("pending"), review("approved"), review("pending")] });
    const { waitingAfterAttach } = useBenchedAfterAttach();
    expect(await waitingAfterAttach("char-1")).toBe(2);
    expect(seenIds.at(-1)).toBe("char-1");
  });

  it("is zero when nothing is flagged", async () => {
    refetch.mockResolvedValue({ data: [] });
    const { waitingAfterAttach } = useBenchedAfterAttach();
    expect(await waitingAfterAttach("char-1")).toBe(0);
  });

  it("lets a failed read reach the caller", async () => {
    refetch.mockRejectedValue(new Error("offline"));
    const { waitingAfterAttach } = useBenchedAfterAttach();
    await expect(waitingAfterAttach("char-1")).rejects.toThrow("offline");
  });
});
