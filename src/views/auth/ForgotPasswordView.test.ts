import { describe, it, expect, vi } from "vitest";
import { flushPromises, mount, RouterLinkStub } from "@vue/test-utils";
import { AuthApiError } from "@supabase/supabase-js";
import ForgotPasswordView from "./ForgotPasswordView.vue";

/**
 * The page must answer every address alike, or it tells a visitor who has an
 * account. Supabase's per-account cooldown answers a repeat request with a 429
 * only for an address that exists, so its message is the leak under test.
 */
const mocks = vi.hoisted(() => ({
  requestPasswordReset: vi.fn<(email: string) => Promise<void>>(),
}));

vi.mock("@/stores/auth", () => ({
  useAuthStore: () => ({ loading: false, requestPasswordReset: mocks.requestPasswordReset }),
}));

const SENT = "If an account exists for that address";

async function submit() {
  const wrapper = mount(ForgotPasswordView, { global: { stubs: { RouterLink: RouterLinkStub } } });
  await wrapper.find("input[type=email]").setValue("someone@example.invalid");
  await wrapper.find("form").trigger("submit");
  await flushPromises();
  return wrapper;
}

describe("ForgotPasswordView", () => {
  it("says a link is on its way when the request succeeds", async () => {
    // Each test sets its own implementation; the config's `clearMocks` clears
    // the calls between them.
    mocks.requestPasswordReset.mockResolvedValue();

    const wrapper = await submit();

    expect(mocks.requestPasswordReset).toHaveBeenCalledWith("someone@example.invalid");
    expect(wrapper.text()).toContain(SENT);
  });

  it("answers the account-only cooldown exactly like a success", async () => {
    mocks.requestPasswordReset.mockImplementation(async () => {
      throw new AuthApiError("For security purposes, you can only request this after 42 seconds.", 429, "over_email_send_rate_limit");
    });

    const wrapper = await submit();

    expect(wrapper.text()).toContain(SENT);
    expect(wrapper.text()).not.toContain("42 seconds");
  });

  it("reports a failure to reach the server, which no account can cause", async () => {
    mocks.requestPasswordReset.mockImplementation(async () => {
      throw new TypeError("Failed to fetch");
    });

    const wrapper = await submit();

    expect(wrapper.text()).not.toContain(SENT);
    expect(wrapper.text()).toContain("Could not reach the server");
  });
});
