import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { createApp, defineComponent } from "vue";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
vi.mock("@/lib/supabase", () => ({ supabase: fake.client }));

import {
  DSR_DEADLINE_DAYS,
  DSR_REQUEST_LIMIT,
  daysUntilDue,
  useDsrRequests,
  useFulfilDsrRequest,
  type DsrRequest,
} from "./useDsrRequests";

function request(overrides: Partial<DsrRequest> = {}): DsrRequest {
  return {
    id: "r1",
    request_type: "access",
    channel: "email",
    user_id: null,
    subject_email: "someone@example.invalid",
    identity_verification: "email round-trip",
    received_at: "2026-08-01T00:00:00Z",
    fulfilled_at: null,
    outcome: null,
    notes: null,
    anonymized_at: null,
    ...overrides,
  };
}

describe("daysUntilDue", () => {
  it("counts the Art. 12(3) month from receipt, not from now", () => {
    const received = request({ received_at: "2026-08-01T00:00:00Z" });
    expect(daysUntilDue(received, new Date("2026-08-01T00:00:00Z"))).toBe(DSR_DEADLINE_DAYS);
  });

  it("counts down as the deadline approaches", () => {
    const received = request({ received_at: "2026-08-01T00:00:00Z" });
    expect(daysUntilDue(received, new Date("2026-08-21T00:00:00Z"))).toBe(10);
  });

  it("goes negative once the deadline has passed — an overdue request must not read as due today", () => {
    const received = request({ received_at: "2026-08-01T00:00:00Z" });
    expect(daysUntilDue(received, new Date("2026-09-05T00:00:00Z"))).toBe(-5);
  });

  it("reads a request an hour past its deadline as overdue, never as due today", () => {
    const received = request({ received_at: "2026-08-01T00:00:00Z" });
    expect(daysUntilDue(received, new Date("2026-08-31T01:00:00Z"))).toBe(-1);
  });

  it("counts a part day as gone: half a day after receipt leaves one day fewer, not the full month", () => {
    const received = request({ received_at: "2026-08-01T00:00:00Z" });
    expect(daysUntilDue(received, new Date("2026-08-01T12:00:00Z"))).toBe(DSR_DEADLINE_DAYS - 1);
    expect(daysUntilDue(received, new Date("2026-08-30T23:00:00Z"))).toBe(0);
  });

  it("is exactly 0 on the deadline itself", () => {
    const received = request({ received_at: "2026-08-01T00:00:00Z" });
    expect(daysUntilDue(received, new Date("2026-08-31T00:00:00Z"))).toBe(0);
  });
});

function run<T>(setup: () => T): { result: T; qc: QueryClient } {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let result!: T;
  const app = createApp(
    defineComponent({
      setup() {
        result = setup();
        return () => null;
      },
    }),
  );
  app.use(VueQueryPlugin, { queryClient: qc });
  app.mount(document.createElement("div"));
  return { result, qc };
}

describe("useDsrRequests", () => {
  beforeEach(() => fake.reset());

  it("lists the most recent request first and stops at the cap", async () => {
    const rows = Array.from({ length: DSR_REQUEST_LIMIT + 5 }, (_, i) =>
      request({ id: `r${i}`, received_at: new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString() }),
    );
    fake.seed("dsr_requests", rows.map((r) => ({ ...r })));
    const { result } = run(() => useDsrRequests());
    await vi.waitFor(() => expect(result.data.value).toBeDefined());
    expect(result.data.value).toHaveLength(DSR_REQUEST_LIMIT);
    expect(result.data.value?.[0]?.id).toBe(`r${DSR_REQUEST_LIMIT + 4}`);
  });

  it("reports a failed read instead of showing an empty queue", async () => {
    fake.failNext("dsr_requests", { message: "boom" });
    const { result } = run(() => useDsrRequests());
    await vi.waitFor(() => expect(result.isError.value).toBe(true));
  });
});

describe("useFulfilDsrRequest", () => {
  beforeEach(() => fake.reset());

  it("refreshes the queue after closing a request, and throws the guard's refusal", async () => {
    fake.onRpc("admin_fulfil_dsr_request", () => null);
    const { result, qc } = run(() => useFulfilDsrRequest());
    qc.setQueryData(["admin", "dsr-requests"], []);
    await result.mutateAsync({ id: "r1", outcome: "fulfilled" });
    expect(qc.getQueryState(["admin", "dsr-requests"])?.isInvalidated).toBe(true);

    fake.failNext("admin_fulfil_dsr_request", { message: "already answered" });
    await expect(result.mutateAsync({ id: "r1", outcome: "refused" })).rejects.toMatchObject({
      message: "already answered",
    });
  });
});
