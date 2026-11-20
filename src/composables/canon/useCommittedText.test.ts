import { describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";
import { useCommittedText } from "./useCommittedText";

function setup(initial = "The river gives back.") {
  const saved = ref(initial);
  const commit = vi.fn();
  const field = useCommittedText(() => saved.value, commit);
  return { saved, commit, ...field };
}

describe("useCommittedText", () => {
  it("saves the trimmed words once an edit is finished", async () => {
    const f = setup();
    f.text.value = "  The river keeps what it takes.  ";
    await nextTick();
    expect(f.commit).toHaveBeenCalledExactlyOnceWith("The river keeps what it takes.");
  });

  it("saves nothing for a blank field and restores the words, so emptying a field by mistake never wipes the row", async () => {
    const f = setup();
    f.text.value = "   ";
    await nextTick();
    expect(f.commit).not.toHaveBeenCalled();
    expect(f.text.value).toBe("The river gives back.");
    expect(f.revision.value).toBe(1);
  });

  it("saves nothing for the words it already holds, but remakes the field to drop stray spaces", async () => {
    const f = setup();
    f.text.value = "The river gives back. ";
    await nextTick();
    expect(f.commit).not.toHaveBeenCalled();
    expect(f.revision.value).toBe(1);
  });

  it("follows the source when it changes elsewhere", async () => {
    const f = setup();
    f.saved.value = "Changed in another tab.";
    await nextTick();
    expect(f.text.value).toBe("Changed in another tab.");
    expect(f.commit).not.toHaveBeenCalled();
  });
});
