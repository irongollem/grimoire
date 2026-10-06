import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import type { TurnstileOptions } from "@/lib/auth/captcha";

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  render: vi.fn(),
  reset: vi.fn(),
  remove: vi.fn(),
  report: vi.fn(),
}));

vi.mock("@/lib/auth/captcha", async (original) => ({
  ...(await original<typeof import("@/lib/auth/captcha")>()),
  loadTurnstile: mocks.load,
}));
vi.mock("@/lib/observability/sentry", () => ({ reportHandledError: mocks.report }));

import CaptchaGate from "./CaptchaGate.vue";
import { CaptchaUnavailableError } from "@/lib/auth/captcha";

/** The options the component handed to `turnstile.render`, i.e. the widget's side of the conversation. */
let widget: TurnstileOptions;

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "site-key");
  mocks.render.mockImplementation((_el: HTMLElement, options: TurnstileOptions) => {
    widget = options;
    return "w1";
  });
  mocks.load.mockResolvedValue({ render: mocks.render, reset: mocks.reset, remove: mocks.remove });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

async function mountGate() {
  const wrapper = mount(CaptchaGate);
  await flushPromises();
  return wrapper;
}

describe("CaptchaGate", () => {
  it("does nothing without a site key, and hands out no token", async () => {
    vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "");
    const wrapper = await mountGate();

    await expect(wrapper.vm.take()).resolves.toBeUndefined();
    expect(mocks.load).not.toHaveBeenCalled();
  });

  it("renders a widget that only shows itself when it needs a click", async () => {
    await mountGate();

    expect(widget.sitekey).toBe("site-key");
    expect(widget.appearance).toBe("interaction-only");
  });

  it("hands out a token that was ready before the form was submitted", async () => {
    const wrapper = await mountGate();
    widget.callback("tok-1");

    await expect(wrapper.vm.take()).resolves.toBe("tok-1");
  });

  it("waits for the token when the form is submitted first", async () => {
    const wrapper = await mountGate();
    const taken = wrapper.vm.take();
    widget.callback("tok-1");

    await expect(taken).resolves.toBe("tok-1");
  });

  it("never hands the same token out twice, and starts the next challenge at once", async () => {
    const wrapper = await mountGate();
    widget.callback("tok-1");
    await wrapper.vm.take();
    expect(mocks.reset).toHaveBeenCalledWith("w1");

    const second = wrapper.vm.take();
    widget.callback("tok-2");
    await expect(second).resolves.toBe("tok-2");
  });

  it("drops a token that expired while the form sat open", async () => {
    const wrapper = await mountGate();
    widget.callback("stale");
    widget["expired-callback"]();

    const taken = wrapper.vm.take();
    widget.callback("fresh");
    await expect(taken).resolves.toBe("fresh");
  });

  it("rejects a waiting submit when the widget errors, and reports only a configuration error", async () => {
    const wrapper = await mountGate();

    const first = wrapper.vm.take();
    expect(widget["error-callback"]("300030")).toBe(true);
    await expect(first).rejects.toBeInstanceOf(CaptchaUnavailableError);
    expect(mocks.report).not.toHaveBeenCalled();

    const second = wrapper.vm.take();
    widget["error-callback"]("110200");
    await expect(second).rejects.toBeInstanceOf(CaptchaUnavailableError);
    expect(mocks.report).toHaveBeenCalledTimes(1);
  });

  it("rejects when the script is blocked, and loads it again on the next submit", async () => {
    mocks.load.mockRejectedValueOnce(new CaptchaUnavailableError());
    const wrapper = await mountGate();
    expect(mocks.render).not.toHaveBeenCalled();

    const taken = wrapper.vm.take();
    await flushPromises();
    widget.callback("tok-1");

    await expect(taken).resolves.toBe("tok-1");
    expect(mocks.load).toHaveBeenCalledTimes(2);
  });

  it("rejects the submit when the retried load is blocked too", async () => {
    mocks.load.mockRejectedValue(new CaptchaUnavailableError());
    const wrapper = await mountGate();

    await expect(wrapper.vm.take()).rejects.toBeInstanceOf(CaptchaUnavailableError);
  });

  it("stays out of the form's flow until Turnstile asks for a click", async () => {
    const wrapper = await mountGate();
    expect(wrapper.classes()).toContain("absolute");

    widget["before-interactive-callback"]();
    await flushPromises();
    expect(wrapper.classes()).not.toContain("absolute");

    widget["after-interactive-callback"]();
    await flushPromises();
    expect(wrapper.classes()).toContain("absolute");
  });

  it("removes the widget and settles a waiting submit when the form goes away", async () => {
    const wrapper = await mountGate();
    const taken = wrapper.vm.take();
    wrapper.unmount();

    await expect(taken).rejects.toBeInstanceOf(CaptchaUnavailableError);
    expect(mocks.remove).toHaveBeenCalledWith("w1");
  });
});
