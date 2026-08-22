import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";
import AppModal from "./AppModal.vue";
import ModalHeader from "./ModalHeader.vue";
import { IconWarning } from "@/lib/icons";

/**
 * The point of this component is that a dialog comes out named and described
 * without the call site wiring anything, so most of what is worth testing is
 * the aria that results — not the markup.
 */
type HeaderProps = InstanceType<typeof ModalHeader>["$props"];

function inModal(headerProps: HeaderProps) {
  const Host = defineComponent({
    setup: () => () =>
      h(AppModal, { open: true }, { default: () => h(ModalHeader, headerProps) }),
  });
  return mount(Host, { attachTo: document.body, global: { stubs: { transition: false } } });
}

const panel = () => document.body.querySelector<HTMLElement>("[data-modal-panel]");

afterEach(() => {
  document.body.innerHTML = "";
});

describe("ModalHeader", () => {
  it("names the surrounding dialog after its own heading, with no wiring at the call site", async () => {
    const wrapper = inModal({ title: "Board settings" });
    await nextTick();

    const heading = panel()!.querySelector("h2")!;
    expect(heading.textContent?.trim()).toBe("Board settings");
    expect(heading.id).toBeTruthy();
    expect(panel()!.getAttribute("aria-labelledby")).toBe(heading.id);
    // A name via labelledby means aria-label must not also be set, or it is read twice.
    expect(panel()!.getAttribute("aria-label")).toBeNull();
    wrapper.unmount();
  });

  it("describes the dialog with its subtitle", async () => {
    const wrapper = inModal({ title: "Delete", subtitle: "This cannot be undone." });
    await nextTick();

    const p = panel()!.querySelector("p")!;
    expect(p.textContent?.trim()).toBe("This cannot be undone.");
    expect(panel()!.getAttribute("aria-describedby")).toBe(p.id);
    wrapper.unmount();
  });

  // Pointing aria-describedby at an id that is not in the document is worse
  // than omitting it — assistive tech skips it silently, so the dialog reads as
  // described when it is not.
  it("leaves the dialog undescribed when there is no subtitle", async () => {
    const wrapper = inModal({ title: "Board settings" });
    await nextTick();

    expect(panel()!.getAttribute("aria-describedby")).toBeNull();
    expect(panel()!.querySelector("p")).toBeNull();
    wrapper.unmount();
  });

  it("lets an explicit labelledBy on the modal win over the header's own heading", async () => {
    const Host = defineComponent({
      setup: () => () =>
        h(AppModal, { open: true, labelledBy: "named-elsewhere" }, {
          default: () => h(ModalHeader, { title: "Board settings" }),
        }),
    });
    const wrapper = mount(Host, { attachTo: document.body, global: { stubs: { transition: false } } });
    await nextTick();

    expect(panel()!.getAttribute("aria-labelledby")).toBe("named-elsewhere");
    wrapper.unmount();
  });

  // The circle repeats what the title says; announcing both reads the dialog twice.
  it("hides the decorative icon from assistive tech", async () => {
    const wrapper = inModal({ title: "Are you sure?", icon: IconWarning, tone: "danger" });
    await nextTick();

    const circle = panel()!.querySelector('[aria-hidden="true"]');
    expect(circle).not.toBeNull();
    expect(circle!.className).toContain("text-destructive");
    wrapper.unmount();
  });

  it("omits the close control unless asked, so a footer-answered dialog has no × ", async () => {
    const without = inModal({ title: "Are you sure?" });
    await nextTick();
    expect(panel()!.querySelector('[aria-label="Close"]')).toBeNull();
    without.unmount();

    const withClose = inModal({ title: "Board settings", closeable: true });
    await nextTick();
    expect(panel()!.querySelector('[aria-label="Close"]')).not.toBeNull();
    withClose.unmount();
  });

  it("emits close from the × control", async () => {
    const seen: string[] = [];
    const Host = defineComponent({
      setup: () => () =>
        h(AppModal, { open: true }, {
          default: () =>
            h(ModalHeader, { title: "Board settings", closeable: true, onClose: () => seen.push("close") }),
        }),
    });
    const wrapper = mount(Host, { attachTo: document.body, global: { stubs: { transition: false } } });
    await nextTick();

    panel()!.querySelector<HTMLElement>('[aria-label="Close"]')!.click();
    expect(seen).toEqual(["close"]);
    wrapper.unmount();
  });

  it("renders as a real <header> with a real heading", async () => {
    const wrapper = inModal({ title: "Board settings" });
    await nextTick();

    expect(panel()!.querySelector("header")).not.toBeNull();
    expect(panel()!.querySelector("header > div h2")).not.toBeNull();
    wrapper.unmount();
  });

  /**
   * The registry belongs to the `AppModal`, which outlives any one header —
   * `ConfirmDialog` is mounted once in `App.vue` and reused for every call. A
   * header that goes away without withdrawing would leave the panel naming an
   * element that is no longer in the document.
   */
  it("withdraws its registration when it unmounts", async () => {
    const show = ref(true);
    const Host = defineComponent({
      setup: () => () =>
        h(AppModal, { open: true }, {
          default: () => (show.value ? h(ModalHeader, { title: "Board settings" }) : h("p", "no header")),
        }),
    });
    const wrapper = mount(Host, { attachTo: document.body, global: { stubs: { transition: false } } });
    await nextTick();
    expect(panel()!.getAttribute("aria-labelledby")).toBeTruthy();

    show.value = false;
    await nextTick();

    expect(panel()!.querySelector("h2")).toBeNull();
    expect(panel()!.getAttribute("aria-labelledby")).toBeNull();
    wrapper.unmount();
  });

  // The outgoing header's teardown runs after the newcomer has registered, so a
  // blind reset there would wipe the live registration.
  it("does not clobber a replacement header's registration", async () => {
    const which = ref<"a" | "b">("a");
    const Host = defineComponent({
      setup: () => () =>
        h(AppModal, { open: true }, {
          default: () =>
            which.value === "a"
              ? h(ModalHeader, { key: "a", title: "First" })
              : h(ModalHeader, { key: "b", title: "Second" }),
        }),
    });
    const wrapper = mount(Host, { attachTo: document.body, global: { stubs: { transition: false } } });
    await nextTick();

    which.value = "b";
    await nextTick();
    await nextTick();

    const heading = panel()!.querySelector("h2")!;
    expect(heading.textContent?.trim()).toBe("Second");
    expect(panel()!.getAttribute("aria-labelledby")).toBe(heading.id);
    wrapper.unmount();
  });

  // Outside a modal there is nothing to register with; it must not throw.
  it("works as a plain heading block outside a modal", () => {
    const wrapper = mount(ModalHeader, { props: { title: "Standalone" } });
    expect(wrapper.find("h2").text()).toBe("Standalone");
    wrapper.unmount();
  });
});
