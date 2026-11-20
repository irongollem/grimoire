import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import CanonImportView from "./CanonImportView.vue";
import { createRouter, createMemoryHistory } from "vue-router";

const sources = import.meta.glob(["/src/**/*.vue", "/src/**/*.ts", "!/src/**/*.test.ts"], { query: "?raw", import: "default", eager: true }) as Record<string, string>;

describe("Bring in a book", () => {
  // Bug caught: a link left pointing at the settings tab the importer moved out of, which now opens Details.
  it("has no link left to the old settings tab", () => {
    const old = `/campaign/settings?tab=${"import"}`;
    const stale = Object.entries(sources).filter(([, text]) => text.includes(old)).map(([path]) => path);
    expect(stale).toEqual([]);
  });

  // Bug caught: the page registered without the importer, or the route name drifting from the link the Canon header uses.
  it("is the route the Canon page links to, and hosts the importer unchanged", async () => {
    const routes = (await import("@/router/routes")).routes ?? [];
    expect(routes.find((r) => r.path === "/canon/import")?.name).toBe("canon-import");
    const w = mount(CanonImportView, {
      global: { plugins: [createRouter({ history: createMemoryHistory(), routes: [{ path: "/:p(.*)*", component: { template: "<div />" } }] })], stubs: { DocumentImportTab: { template: "<div data-testid='importer' />" }, PageHeader: { template: "<div><slot name='actions' /><slot /></div>" } } },
    });
    expect(w.find("[data-testid=importer]").exists()).toBe(true);
  });
});
