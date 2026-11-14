import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ insert: vi.fn() }));

vi.mock("@tanstack/vue-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: (opts: { mutationFn: (i: unknown) => Promise<unknown> }) => ({ mutateAsync: opts.mutationFn }),
  useQuery: vi.fn(),
}));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: "camp-1" }) }));
vi.mock("@/lib/supabase", () => ({
  getCurrentUser: () => ({ id: "user-1" }),
  supabase: {
    from: () => ({
      insert: (row: unknown) => {
        mocks.insert(row);
        return { select: () => ({ single: async () => ({ data: { id: "r1" }, error: null }) }) };
      },
    }),
  },
}));

import { useCreateDocumentImport } from "./useDocumentImport";

const base = {
  files: [],
  sourceKind: "text" as const,
  sourceText: "plan",
  displayName: "Plan",
  pageCount: 1,
  rightsAttested: true,
};

describe("useCreateDocumentImport own_writing", () => {
  beforeEach(() => mocks.insert.mockReset());

  it("stores own_writing true when asked and false otherwise", async () => {
    const { mutateAsync } = useCreateDocumentImport() as unknown as { mutateAsync: (i: unknown) => Promise<unknown> };
    await mutateAsync({ ...base, ownWriting: true });
    await mutateAsync(base);
    expect(mocks.insert.mock.calls[0]?.[0]).toMatchObject({ own_writing: true });
    expect(mocks.insert.mock.calls[1]?.[0]).toMatchObject({ own_writing: false });
  });
});
