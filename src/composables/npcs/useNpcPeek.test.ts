import { describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { provideNpcModalNav, useNpcPeek, useOpenNpc } from "./useNpcPeek";

function opener() {
  let open: ((id: string) => void) | null = null;
  const Child = defineComponent({
    setup() {
      open = useOpenNpc();
      return () => h("span");
    },
  });
  return { Child, call: (id: string) => open?.(id) };
}

describe("useOpenNpc", () => {
  it("opens a name over the page when no NPC modal encloses it", () => {
    const { Child, call } = opener();
    mount(Child);
    call("npc-2");
    expect(useNpcPeek().peekId.value).toBe("npc-2");
    useNpcPeek().close();
  });

  it("opens a name in the enclosing NPC modal instead of a new one", () => {
    const open = vi.fn();
    const { Child, call } = opener();
    const Modal = defineComponent({
      setup() {
        provideNpcModalNav({ open });
        return () => h(Child);
      },
    });
    mount(Modal);
    call("npc-3");
    expect(open).toHaveBeenCalledWith("npc-3");
    expect(useNpcPeek().peekId.value).toBeNull();
  });
});
