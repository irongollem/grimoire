import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import BulkSelectableCard from "./BulkSelectableCard.vue";

describe("BulkSelectableCard", () => {
  it("renders the slot untouched and adds no click interception when not selecting", async () => {
    const wrapper = mount(BulkSelectableCard, {
      props: { selected: false, selecting: false },
      slots: { default: '<button class="inner">Card</button>' },
    });

    // No wrapping element and no checkbox — the slot's own markup is the
    // component's whole rendered output.
    expect(wrapper.html()).toBe('<button class="inner">Card</button>');
    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false);

    const inner = wrapper.get(".inner").element;
    const spy = vi.fn();
    inner.addEventListener("click", spy);

    await wrapper.get(".inner").trigger("click");

    expect(spy).toHaveBeenCalledOnce();
    expect(wrapper.emitted("toggle")).toBeUndefined();
  });

  it("shows a checkbox and emits toggle instead of letting the click through when selecting", async () => {
    const wrapper = mount(BulkSelectableCard, {
      props: { selected: true, selecting: true },
      slots: { default: '<button class="inner">Card</button>' },
    });

    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(true);
    expect((wrapper.find('input[type="checkbox"]').element as HTMLInputElement).checked).toBe(true);

    const inner = wrapper.get(".inner").element;
    const spy = vi.fn();
    inner.addEventListener("click", spy);

    await wrapper.get(".inner").trigger("click");

    // Intercepted at the wrapper (capture phase) before it reaches the card's
    // own listener — the card's navigation/handler never sees the click.
    expect(spy).not.toHaveBeenCalled();
    expect(wrapper.emitted("toggle")).toHaveLength(1);
  });

  it("emits toggle when the checkbox itself is clicked, exactly once", async () => {
    const wrapper = mount(BulkSelectableCard, {
      props: { selected: false, selecting: true },
      slots: { default: '<button class="inner">Card</button>' },
    });

    await wrapper.get('input[type="checkbox"]').trigger("click");

    expect(wrapper.emitted("toggle")).toHaveLength(1);
  });
});
