import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  invoke: vi.fn(),
  push: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { functions: { invoke: mocked.invoke } },
}));

vi.mock("vue-router", () => ({
  useRouter: () => ({ push: mocked.push }),
}));

vi.mock("@/stores/auth", () => ({
  useAuthStore: () => ({ signOut: mocked.signOut }),
}));

import { accountDeletionErrorMessage, useAccountDeletion } from "./useAccountDeletion";

const { invoke: invokeMock, push: pushMock, signOut: signOutMock } = mocked;

describe("accountDeletionErrorMessage", () => {
  it("maps known server codes to human copy", () => {
    expect(accountDeletionErrorMessage("cannot_delete_admin")).toMatch(/admin/i);
    expect(accountDeletionErrorMessage("user_not_found")).toMatch(/could not be found/i);
  });

  it("passes an unrecognised code through verbatim", () => {
    expect(accountDeletionErrorMessage("some_new_code")).toBe("some_new_code");
  });
});

describe("useAccountDeletion", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    pushMock.mockReset();
    signOutMock.mockReset();
  });

  it("self-deletion: invokes with confirm only, signs out, and redirects to login on success", async () => {
    invokeMock.mockResolvedValue({ data: { ok: true }, error: null });
    const { deleting, error, deleteAccount } = useAccountDeletion();

    const result = await deleteAccount();

    expect(result).toBe(true);
    expect(invokeMock).toHaveBeenCalledWith("delete-account", { body: { confirm: "DELETE" } });
    expect(signOutMock).toHaveBeenCalledOnce();
    expect(pushMock).toHaveBeenCalledWith({ name: "login" });
    expect(error.value).toBeNull();
    expect(deleting.value).toBe(false);
  });

  it("admin deletion: passes targetUserId and does not sign out or redirect", async () => {
    invokeMock.mockResolvedValue({ data: { ok: true }, error: null });
    const { deleteAccount } = useAccountDeletion();

    const result = await deleteAccount("user-123");

    expect(result).toBe(true);
    expect(invokeMock).toHaveBeenCalledWith("delete-account", {
      body: { confirm: "DELETE", targetUserId: "user-123" },
    });
    expect(signOutMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("maps a functions-error JSON payload code to human copy and does not sign out", async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: {
        message: "Edge Function returned a non-2xx status code",
        context: { json: async () => ({ error: "cannot_delete_admin" }) },
      },
    });
    const { deleting, error, deleteAccount } = useAccountDeletion();

    const result = await deleteAccount("user-123");

    expect(result).toBe(false);
    expect(error.value).toBe(accountDeletionErrorMessage("cannot_delete_admin"));
    expect(signOutMock).not.toHaveBeenCalled();
    expect(deleting.value).toBe(false);
  });

  it("falls back to the raw error message when the response has no JSON body", async () => {
    invokeMock.mockResolvedValue({ data: null, error: { message: "network error" } });
    const { error, deleteAccount } = useAccountDeletion();

    await deleteAccount();

    expect(error.value).toBe("network error");
  });

  it("surfaces a `{ error }` body returned with a 2xx status the same way", async () => {
    invokeMock.mockResolvedValue({ data: { error: "storage_purge_failed" }, error: null });
    const { error, deleteAccount } = useAccountDeletion();

    const result = await deleteAccount();

    expect(result).toBe(false);
    expect(error.value).toBe(accountDeletionErrorMessage("storage_purge_failed"));
    expect(signOutMock).not.toHaveBeenCalled();
  });

  it("sets deleting true while in flight and false once settled", async () => {
    let resolveInvoke!: (v: unknown) => void;
    invokeMock.mockReturnValue(
      new Promise((resolve) => {
        resolveInvoke = resolve;
      }),
    );
    const { deleting, deleteAccount } = useAccountDeletion();

    const promise = deleteAccount();
    expect(deleting.value).toBe(true);
    resolveInvoke({ data: { ok: true }, error: null });
    await promise;

    expect(deleting.value).toBe(false);
  });
});
