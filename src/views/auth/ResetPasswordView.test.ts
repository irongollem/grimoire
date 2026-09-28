import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { flushPromises, mount, RouterLinkStub } from "@vue/test-utils";
import type { User } from "@supabase/supabase-js";
import ResetPasswordView from "./ResetPasswordView.vue";
import { useAuthStore } from "@/stores/auth";

/**
 * Ending the other sessions is the second half of a reset, and it can fail
 * after the password has already changed. That must reach the user rather than
 * pass as a clean success — whoever had the old password may still be in.
 *
 * The real store runs against a mocked client, so this covers the store's
 * reading of `signOut`'s returned error as well as the page's response to it.
 *
 * No key, parameter or variable here is named after the password field, mock
 * keys and type signatures included: the secret scanner on this repo reads any
 * such name followed by a value as a leaked credential, and its GitHub check
 * ignores `.gitguardian.yaml`.
 */
const mocks = vi.hoisted(() => ({
  updateUser: vi.fn<(attributes: Record<string, string>) => Promise<{ error: Error | null }>>(),
  signOut: vi.fn<(options: { scope: string }) => Promise<{ error: Error | null }>>(),
  push: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { updateUser: mocks.updateUser, signOut: mocks.signOut } },
  getCurrentUser: () => null,
  setCachedUser: () => {},
}));
vi.mock("vue-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("vue-router")>()),
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ success: mocks.toastSuccess, error: mocks.toastError }),
}));

const ENTRY = "a".repeat(12);
const MISMATCH = "b".repeat(12);

async function submit(entry = ENTRY, repeat = entry) {
  const wrapper = mount(ResetPasswordView, { global: { stubs: { RouterLink: RouterLinkStub } } });
  await wrapper.find("#password").setValue(entry);
  await wrapper.find("#password-confirm").setValue(repeat);
  await wrapper.find("form").trigger("submit");
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  setActivePinia(createPinia());
  // Signed in by the recovery link — what the page needs to show the form.
  useAuthStore().user = { id: "u1", email: "someone@example.invalid" } as User;
});

// Each test sets its own implementations; the config's `clearMocks` clears the
// calls between them.
describe("ResetPasswordView", () => {
  it("sets the new password, ends the other sessions and returns to the app", async () => {
    mocks.updateUser.mockResolvedValue({ error: null });
    mocks.signOut.mockResolvedValue({ error: null });

    await submit();

    expect(Object.values(mocks.updateUser.mock.calls[0][0])).toEqual([ENTRY]);
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "others" });
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Password updated.");
    expect(mocks.push).toHaveBeenCalledWith("/dashboard");
  });

  it("says so when the other devices could not be signed out", async () => {
    mocks.updateUser.mockResolvedValue({ error: null });
    mocks.signOut.mockResolvedValue({ error: new Error("network down") });

    await submit();

    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining("could not be signed out"));
    expect(mocks.push).toHaveBeenCalledWith("/dashboard");
  });

  it("refuses mismatched entries before calling the server", async () => {
    const wrapper = await submit(ENTRY, MISMATCH);

    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain("The passwords do not match.");
  });
});
