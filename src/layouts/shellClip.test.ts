import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Bug (24 Nov 2026): the DM shell was `h-dvh overflow-hidden`. A hidden box is still a scroll container, and the
 * sidebar's links overflow it, so a `focus()`, a `scrollIntoView` or the browser keeping a caret in view slid the whole
 * shell up by ~700px: the page header left the screen and the docked sound deck rose into the middle of the page. A
 * clipped box cannot be scrolled by anything. The shell's class is read from the source because mounting a whole
 * layout (sidebar, deck, chat, generators) for one class would test everything but this.
 */
const shellClass = (file: string) => {
  const source = readFileSync(new URL(file, import.meta.url), "utf8");
  const tag = source.match(/<div[^>]*data-testid="app-shell"[^>]*>/);
  return tag?.[0].match(/class="([^"]*)"/)?.[1].split(/\s+/) ?? [];
};

describe("the app shells", () => {
  it.each(["./DefaultLayout.vue", "./PlayerLayout.vue"])("%s is clipped, never hidden", (file) => {
    const classes = shellClass(file);
    expect(classes).toContain("h-dvh");
    expect(classes).toContain("overflow-clip");
    expect(classes).not.toContain("overflow-hidden");
  });
});
