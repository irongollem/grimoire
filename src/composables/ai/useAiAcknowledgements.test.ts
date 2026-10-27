import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
const session = vi.hoisted(() => ({ user: { id: "me" } as { id: string } | null }));

vi.mock("@/lib/supabase", () => ({ supabase: fake.client }));
vi.mock("@/stores/auth", () => ({
  useAuthStore: () => ({ get user() { return session.user; } }),
}));

import { findAcknowledgement, useAiAcknowledgements, type AiAcknowledgementRow } from "./useAiAcknowledgements";

function row(overrides: Partial<AiAcknowledgementRow> = {}): AiAcknowledgementRow {
  return {
    id: "ack-1",
    user_id: "user-1",
    kind: "ai_use",
    version: "2026-08-04",
    created_at: "2026-08-04T00:00:00Z",
    updated_at: "2026-08-04T00:00:00Z",
    ...overrides,
  };
}

describe("findAcknowledgement", () => {
  it("matches a row with the same kind and exact version", () => {
    expect(findAcknowledgement([row()], "ai_use", "2026-08-04")).toBe(true);
  });

  it("does not match a different version: a version bump must re-prompt", () => {
    expect(findAcknowledgement([row({ version: "2026-01-01" })], "ai_use", "2026-08-04")).toBe(false);
  });

  it("does not match a different kind: ai_use and likeness are separate consents", () => {
    expect(findAcknowledgement([row({ kind: "likeness" })], "ai_use", "2026-08-04")).toBe(false);
  });

  it("finds the matching row among several that each match on only one of kind and version", () => {
    const rows = [
      row({ id: "a", kind: "likeness", version: "2026-08-04" }),
      row({ id: "b", kind: "ai_use", version: "2025-01-01" }),
      row({ id: "c", kind: "ai_use", version: "2026-08-04" }),
    ];
    expect(findAcknowledgement(rows, "ai_use", "2026-08-04")).toBe(true);
    expect(findAcknowledgement(rows.slice(0, 2), "ai_use", "2026-08-04")).toBe(false);
  });
});

describe("useAiAcknowledgements", () => {
  function run() {
    let api!: ReturnType<typeof useAiAcknowledgements>;
    const client = new QueryClient();
    mount(defineComponent({ setup() { api = useAiAcknowledgements(); return () => null; } }), {
      global: { plugins: [[VueQueryPlugin, { queryClient: client }]] },
    });
    return api;
  }

  beforeEach(() => {
    fake.reset();
    session.user = { id: "me" };
  });

  // CLAUDE.md "Client Reads": an admin can read every row, so the read has to
  // name the caller itself. Another account's consent must never count as mine.
  it("counts only the signed-in account's own acknowledgements", async () => {
    fake.seed("ai_acknowledgements", [
      { id: "a1", user_id: "someone-else", kind: "ai_use", version: "v1" },
      { id: "a2", user_id: "me", kind: "likeness", version: "v1" },
    ]);
    const api = run();
    await flushPromises();
    expect(api.hasAcknowledged("ai_use", "v1")).toBe(false);
    expect(api.hasAcknowledged("likeness", "v1")).toBe(true);
  });

  it("reports a failed read as an error, not as 'nothing acknowledged yet'", async () => {
    fake.failNext("ai_acknowledgements", { message: "boom" });
    const api = run();
    await flushPromises();
    expect(api.isError.value).toBe(true);
  });

  it("records an acknowledgement for the caller and then reports it as acknowledged", async () => {
    const api = run();
    await flushPromises();
    await api.acknowledge("ai_use", "v2");
    await flushPromises();
    expect(fake.rows("ai_acknowledgements")).toMatchObject([{ user_id: "me", kind: "ai_use", version: "v2" }]);
    expect(api.hasAcknowledged("ai_use", "v2")).toBe(true);
  });

  it("treats re-recording the same acknowledgement as success, but surfaces any other failure", async () => {
    const api = run();
    await flushPromises();
    fake.failNext("ai_acknowledgements", { message: "duplicate", code: "23505" });
    await expect(api.acknowledge("ai_use", "v2")).resolves.toBeUndefined();

    fake.failNext("ai_acknowledgements", { message: "denied", code: "42501" });
    await expect(api.acknowledge("ai_use", "v2")).rejects.toMatchObject({ code: "42501" });
  });

  it("refuses to record while signed out", async () => {
    session.user = null;
    const api = run();
    await expect(api.acknowledge("ai_use", "v2")).rejects.toThrow("signed in");
    expect(fake.rows("ai_acknowledgements")).toEqual([]);
  });
});
