import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { nextTick } from "vue";
import ConfirmDialog from "./ConfirmDialog.vue";
import { useConfirm } from "@/composables/useConfirm";

/**
 * The app-wide confirm, mounted once in `App.vue` and driven by the `useConfirm`
 * module singleton rather than by props — so these drive it the way the app
 * does, through `confirm()` / `notify()`.
 *
 * happy-dom has no Web Animations, so the shell's `canAnimate` is false and
 * every transition resolves synchronously. That is also the path a reader with
 * `prefers-reduced-motion` takes.
 */
function mountDialog() {
  return mount(ConfirmDialog, { attachTo: document.body, global: { stubs: { transition: false } } });
}

function panel() {
  return document.body.querySelector<HTMLElement>("[data-modal-panel]");
}

function container() {
  return document.body.querySelector<HTMLElement>("[data-modal-backdrop]")!.parentElement!;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("ConfirmDialog", () => {
  it("shows the question, and resolves true when the confirm button is pressed", async () => {
    const wrapper = mountDialog();
    const { confirm } = useConfirm();

    const answer = confirm("Delete the owlbear?", { confirmLabel: "Delete" });
    await flushPromises();

    expect(panel()!.textContent).toContain("Delete the owlbear?");

    panel()!.querySelectorAll("button")[1].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(await answer).toBe(true);
    wrapper.unmount();
  });

  it("resolves false when Cancel is pressed", async () => {
    const wrapper = mountDialog();
    const { confirm } = useConfirm();

    const answer = confirm("Delete the owlbear?");
    await flushPromises();

    panel()!.querySelectorAll("button")[0].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(await answer).toBe(false);
    wrapper.unmount();
  });

  // The #746 decision. Backdrop dismissal never actually fired here — the
  // handler was copied in the form where `.self` cannot match — so migrating
  // onto the shell would otherwise have *added* "a stray click cancels" to all
  // 73 call sites. A dialog that asks a question should get an answer.
  it("ignores a click beside the panel", async () => {
    const wrapper = mountDialog();
    const { confirm } = useConfirm();

    let settled = false;
    void confirm("Delete the owlbear?").then(() => { settled = true; });
    await flushPromises();

    container().dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    await flushPromises();

    expect(settled).toBe(false);
    expect(panel()).not.toBeNull();
    wrapper.unmount();
  });

  // ...but Escape is the other half of that decision, and must still work:
  // `dismissable: false` would have taken away the only keyboard way out.
  it("cancels on Escape", async () => {
    const wrapper = mountDialog();
    const { confirm } = useConfirm();

    const answer = confirm("Delete the owlbear?");
    await flushPromises();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(await answer).toBe(false);
    wrapper.unmount();
  });

  it("gives an alert a single button and no Cancel", async () => {
    const wrapper = mountDialog();
    const { notify } = useConfirm();

    void notify("Your export is ready.");
    await flushPromises();

    const buttons = panel()!.querySelectorAll("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0].textContent?.trim()).toBe("OK");
    wrapper.unmount();
  });

  /**
   * The panel outlives the answer by the length of its leave animation, and
   * this component renders the slot content — so a naive read of `dialog` blanks
   * the title and message out the instant the user answers, leaving an empty
   * card to animate away. Reading a stale-but-present question during the exit
   * is correct; reading an empty one is the regression.
   */
  it("keeps the question on screen while the panel is leaving", async () => {
    const wrapper = mountDialog();
    const { confirm } = useConfirm();

    void confirm("Delete the owlbear?");
    await flushPromises();

    const leaving = panel()!;
    panel()!.querySelectorAll("button")[0].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await nextTick();

    expect(leaving.textContent).toContain("Delete the owlbear?");
    wrapper.unmount();
  });
});
