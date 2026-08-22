import { afterEach, describe, expect, it } from "vitest";
import { effectScope, ref } from "vue";
import { _resetModalStack, useModalStack } from "./modalStack";

/**
 * The stack is module state shared by every modal on the page, so each test
 * starts from empty and every scope it opens is stopped again.
 */
afterEach(_resetModalStack);

/** Mirrors how `AppModal` uses it: one scope per modal, driven by an `open` ref. */
function modal(open = ref(false)) {
  const scope = effectScope();
  const z = scope.run(() => useModalStack(() => open.value))!;
  return { open, z, stop: () => scope.stop() };
}

describe("useModalStack", () => {
  it("has no level while closed — nothing is painted, so nothing is held", () => {
    const a = modal();
    expect(a.z.value).toBeNull();
    a.stop();
  });

  it("stacks each newly opened modal above the ones already open", () => {
    const a = modal();
    const b = modal();
    const c = modal();

    a.open.value = true;
    b.open.value = true;
    c.open.value = true;

    expect(a.z.value).toBeLessThan(b.z.value!);
    expect(b.z.value).toBeLessThan(c.z.value!);
    [a, b, c].forEach((m) => m.stop());
  });

  /**
   * The case the stack exists for: a picker declared *before* its host in the
   * same template, so it mounts first, but opens second. Declaration order must
   * not decide which one is painted on top.
   */
  it("orders by when a modal opened, not by when it was created", () => {
    const declaredFirst = modal();
    const declaredSecond = modal();

    declaredSecond.open.value = true;
    declaredFirst.open.value = true;

    expect(declaredFirst.z.value).toBeGreaterThan(declaredSecond.z.value!);
    declaredFirst.stop();
    declaredSecond.stop();
  });

  it("gives the level back on close, so repeated opens do not climb", () => {
    const a = modal();

    a.open.value = true;
    const first = a.z.value;
    a.open.value = false;
    expect(a.z.value).toBeNull();

    a.open.value = true;
    expect(a.z.value).toBe(first);
    a.stop();
  });

  // A modal torn down while still open would otherwise strand its level, and
  // every later modal would sit a step higher than it needs to, for ever.
  it("releases the level when the modal is disposed while still open", () => {
    const a = modal();
    a.open.value = true;
    const held = a.z.value!;
    a.stop();

    const b = modal();
    b.open.value = true;
    expect(b.z.value).toBe(held);
    b.stop();
  });

  it("keeps the survivor above when a modal underneath closes", () => {
    const under = modal();
    const over = modal();
    under.open.value = true;
    over.open.value = true;
    const overZ = over.z.value!;

    under.open.value = false;

    // The one still open keeps its level rather than being renumbered — a modal
    // that shuffled downward while visible would flicker behind its neighbours.
    expect(over.z.value).toBe(overZ);
    under.stop();
    over.stop();
  });
});
