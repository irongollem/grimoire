import { describe, expect, it } from "vitest";
import { effectScope, ref } from "vue";
import { barCreateAction, useBarCreate } from "./useBarCreate";

function register(get: Parameters<typeof useBarCreate>[0]) {
  const scope = effectScope();
  scope.run(() => useBarCreate(get));
  return scope;
}

describe("useBarCreate", () => {
  // Fails if a leaving page's create outlives its scope: the bar's "+" would
  // create in the section the DM just left.
  it("offers nothing once the registering scope is gone", () => {
    const scope = register({ label: "New Note", run: () => {} });
    expect(barCreateAction.value?.label).toBe("New Note");
    scope.stop();
    expect(barCreateAction.value).toBeNull();
  });

  // Fails if the oldest registration wins: on a route change the arriving
  // page sets up before the leaving one is disposed.
  it("prefers the newest live registration, and falls back when it leaves", () => {
    const leaving = register({ label: "New NPC", run: () => {} });
    const arriving = register({ label: "New Note", run: () => {} });
    expect(barCreateAction.value?.label).toBe("New Note");
    arriving.stop();
    expect(barCreateAction.value?.label).toBe("New NPC");
    leaving.stop();
  });

  // Fails if a registration returning null shadows the one beneath it (a
  // Dungeon Craft tab with nothing to create, the NPC desktop layout).
  it("lets a registration step aside by returning null", () => {
    const base = register({ label: "New Feature", run: () => {} });
    const offered = ref(false);
    const conditional = register(() => (offered.value ? { label: "New NPC", run: () => {} } : null));
    expect(barCreateAction.value?.label).toBe("New Feature");
    offered.value = true;
    expect(barCreateAction.value?.label).toBe("New NPC");
    conditional.stop();
    base.stop();
  });
});
