import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminTableReopen from "./AdminTableReopen.vue";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ success: mocks.success, error: mocks.error, fromError: (e: unknown, f: string) => (e instanceof Error ? e.message : f) }),
}));

function mountIt() {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return mount(AdminTableReopen, { props: { userId: "u1" }, global: { plugins: [[VueQueryPlugin, { queryClient: qc }]] } });
}

async function openField(w: ReturnType<typeof mountIt>) {
  await w.findAllComponents({ name: "AppButton" }).find((b) => b.text() === "Reopen AI table")!.trigger("click");
}

describe("AdminTableReopen", () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    mocks.success.mockReset();
    mocks.error.mockReset();
  });

  // Bug caught: an account's table reopened with no reason on record, or a request sent that the server would refuse.
  it("refuses an empty or blank reason and makes no request", async () => {
    const w = mountIt();
    await openField(w);
    await w.find("input").setValue("   ");
    await w.find("form").trigger("submit");
    await flushPromises();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalled();
  });

  // Bug caught: the RPC called for the wrong account, or without the reason the audit log must keep.
  it("calls the RPC with the account and the trimmed reason, and confirms with a toast", async () => {
    const w = mountIt();
    await openField(w);
    await w.find("input").setValue("  Parent confirmed it was a sibling  ");
    await w.find("form").trigger("submit");
    await flushPromises();
    expect(mocks.rpc).toHaveBeenCalledWith("admin_reopen_table", { p_user_id: "u1", p_reason: "Parent confirmed it was a sibling" });
    expect(mocks.success).toHaveBeenCalled();
  });

  // Bug caught: a failed reopening reported as done.
  it("reports a failed reopening and not success", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: new Error("not authorised") });
    const w = mountIt();
    await openField(w);
    await w.find("input").setValue("why");
    await w.find("form").trigger("submit");
    await flushPromises();
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalledWith("not authorised");
  });
});
