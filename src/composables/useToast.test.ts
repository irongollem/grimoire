import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { useToast } from "./useToast";
import ToastHost from "@/components/common/ToastHost.vue";

describe("useToast", () => {
  // `toasts` is a module-level singleton (see useToast.ts) shared by every
  // caller, so each test clears it rather than inheriting toasts a previous
  // test in this file pushed.
  const { toasts, error, success, info, dismiss } = useToast();

  beforeEach(() => {
    toasts.value = [];
  });

  it("pushes a plain toast unchanged in shape, with the type's default duration", () => {
    const id = success("Saved.");
    expect(toasts.value).toEqual([{ id, type: "success", message: "Saved.", duration: 3500, action: undefined }]);
  });

  it("still honours the positional duration argument every existing call site uses", () => {
    // usePlayerRemovalGuard.ts's real call shape: an error toast pinned open.
    const id = error("You have been removed from the campaign by the DM.", 0);
    expect(toasts.value[0]).toMatchObject({ id, duration: 0 });

    info("Session started — reveals now announce to your players.");
    expect(toasts.value[1]).toMatchObject({ duration: 4500 });
  });

  it("attaches an action, and running it removes the toast from the stack", () => {
    const run = vi.fn();
    const id = success("Reset to default.", undefined, { action: { label: "Undo", run } });

    expect(toasts.value[0]?.action?.label).toBe("Undo");

    toasts.value[0]?.action?.run();

    expect(run).toHaveBeenCalledTimes(1);
    expect(toasts.value.find((t) => t.id === id)).toBeUndefined();
  });

  it("never runs the action a second time, even if it is invoked twice before the toast unmounts", () => {
    const run = vi.fn();
    success("Reset to default.", undefined, { action: { label: "Undo", run } });
    const action = toasts.value[0]?.action;

    action?.run();
    action?.run();

    expect(run).toHaveBeenCalledTimes(1);
  });

  it("gives an action toast a longer default duration than a plain toast of the same type", () => {
    const id = success("Reset to default.", undefined, { action: { label: "Undo", run: vi.fn() } });
    const toast = toasts.value.find((t) => t.id === id);
    // The plain `success` default is 3500ms — this only holds if the presence
    // of an action, not the type, is what widened the window.
    expect(toast?.duration).toBeGreaterThan(3500);
  });

  it("still lets an action toast take an explicit duration, including 0 to require manual dismissal", () => {
    const id = success("Reset to default.", 0, { action: { label: "Undo", run: vi.fn() } });
    expect(toasts.value.find((t) => t.id === id)?.duration).toBe(0);
  });

  it("dismiss() removes a toast by id whether or not it carries an action", () => {
    const id = info("Just letting you know.");
    dismiss(id);
    expect(toasts.value).toEqual([]);
  });
});

describe("ToastHost action button", () => {
  const { toasts, success } = useToast();
  const global = { stubs: { Teleport: true } };

  beforeEach(() => {
    toasts.value = [];
  });

  it("renders no action button on a plain toast", () => {
    success("Saved.");
    const wrapper = mount(ToastHost, { global });

    expect(wrapper.findAll("button")).toHaveLength(1); // dismiss control only
    wrapper.unmount();
  });

  it("renders the action beside the message, and clicking it runs the action once and removes the toast", async () => {
    const run = vi.fn();
    success("Reset to default.", undefined, { action: { label: "Undo", run } });
    const wrapper = mount(ToastHost, { global });

    const buttons = wrapper.findAll("button");
    expect(buttons).toHaveLength(2); // action + dismiss
    const actionButton = buttons.find((b) => b.text() === "Undo");
    expect(actionButton).toBeDefined();
    // The visible label alone repeats across every "Undo" toast the app can
    // show, so the accessible name folds in which toast it belongs to.
    expect(actionButton?.attributes("aria-label")).toBe("Undo: Reset to default.");

    await actionButton?.trigger("click");
    await actionButton?.trigger("click");

    expect(run).toHaveBeenCalledTimes(1);
    expect(toasts.value).toEqual([]);
    wrapper.unmount();
  });

  // `hasRun` is spent before the callback can throw, so without a `finally` a
  // failed undo would strand the toast on screen wearing a dead button.
  it("dismisses the toast even when the action throws", () => {
    const { toasts, error } = useToast();
    const before = toasts.value.length;
    error("Reset failed to stick", undefined, {
      action: {
        label: "Undo",
        run: () => {
          throw new Error("network");
        },
      },
    });
    const pushed = toasts.value[toasts.value.length - 1];
    expect(pushed?.action).toBeDefined();
    expect(() => pushed?.action?.run()).toThrow("network");
    expect(toasts.value).toHaveLength(before);
  });
});
