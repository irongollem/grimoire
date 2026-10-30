// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";

// A Previewer that lays a chapter out as `data-pages="N"` pages, putting each
// top-level element on the page named by its data-on-page (page 1 otherwise),
// and leaving a <style> in the head per run, as the real polisher does.
const mocks = vi.hoisted(() => ({
  runs: [] as { html: string; styles: HTMLStyleElement[] }[],
  fail: null as string | null,
}));

vi.mock("pagedjs", () => ({
  Handler: class {},
  registerHandlers: vi.fn(),
  Previewer: class {
    polisher = { inserted: [] as HTMLStyleElement[], styleEl: undefined as HTMLStyleElement | undefined };
    async preview(html: string, _sheets: unknown, renderTo: HTMLElement) {
      const run = { html, styles: [] as HTMLStyleElement[] };
      mocks.runs.push(run);
      const style = document.createElement("style");
      document.head.appendChild(style);
      this.polisher.inserted.push(style);
      run.styles.push(style);
      if (mocks.fail) throw new Error(mocks.fail);
      const tmp = document.createElement("div");
      tmp.innerHTML = html;
      const probe = tmp.querySelector<HTMLElement>("[data-pages]");
      const n = Number(probe?.dataset.pages ?? 1);
      const area = document.createElement("div");
      area.className = "pagedjs_pages";
      for (let i = 1; i <= n; i++) {
        const content = Array.from(probe?.children ?? []).map((el) => el as HTMLElement)
          .filter((el) => (el.dataset.onPage ? Number(el.dataset.onPage) === i : i === 1))
          .map((el) => el.outerHTML)
          .join("");
        const page = document.createElement("div");
        page.className = "pagedjs_page";
        page.innerHTML = `<div class="pagedjs_pagebox"><div class="pagedjs_area"><div class="pagedjs_page_content">${content}</div></div></div>`;
        area.appendChild(page);
      }
      renderTo.appendChild(area);
      return { total: n };
    }
  },
}));

import { createBookLayout } from "./createBookLayout";
import type { BookLayoutInput, BookLayoutSettings } from "./types";

const settings: BookLayoutSettings = {
  pageSize: "A4",
  isTwoColumn: false,
  showPageNumbers: true,
  pageNumberStart: 1,
  footerText: "Foot",
  inkFriendly: false,
  theme: "onednd2024",
};

/** A chapter of `pages` pages; `extra` is more markup in it (headings with data-on-page). */
function chapter(id: string, pages: number, extra = "") {
  return { id, html: `<div data-pages="${pages}">${extra}<p>${id}</p></div>` };
}

function input(chapters: BookLayoutInput["chapters"], over: Partial<BookLayoutInput> = {}): BookLayoutInput {
  return { chapters, settings, stylesheets: [{ "p.css": "@page{}" }], ...over };
}

function setup() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  return { host, book: createBookLayout(host) };
}

beforeEach(() => {
  mocks.runs = [];
  mocks.fail = null;
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

describe("blank pages", () => {
  it("opens every chapter on a right-hand page: one blank after a 3-page chapter, none after a 4-page one, none after the last", async () => {
    const { book, host } = setup();
    const res = await book.layout(input([chapter("a", 3), chapter("b", 4), chapter("c", 3)]));
    expect(res?.pages.map((p) => [p.chapterId, p.blank])).toEqual([
      ["a", false], ["a", false], ["a", false], ["a", true],
      ["b", false], ["b", false], ["b", false], ["b", false],
      ["c", false], ["c", false], ["c", false],
    ]);
    // Each chapter's first page sits at an even physical index (a recto).
    expect(res?.chapters.map((c) => c.firstIndex)).toEqual([0, 4, 8]);
    expect(host.querySelectorAll("[data-blank-page]")).toHaveLength(1);
  });

  it("counts a blank in the numbering but prints no number or footer on it", async () => {
    const { book, host } = setup();
    const res = await book.layout(input([chapter("a", 1), chapter("b", 1)]));
    expect(res?.pages.map((p) => p.label)).toEqual(["1", null, "3"]);
    const pages = Array.from(host.querySelectorAll<HTMLElement>(".pagedjs_page"));
    expect(pages.map((p) => p.querySelector(".sc-footer") !== null)).toEqual([true, false, true]);
    expect(pages.map((p) => p.querySelector(".sc-footer-num")?.textContent ?? null)).toEqual(["1", null, "3"]);
  });

  it("reports each chapter's printed range for the chapter list", async () => {
    const { book } = setup();
    const res = await book.layout(input([chapter("a", 3), chapter("b", 2)]));
    expect(res?.chapters.map((c) => [c.firstLabel, c.lastLabel, c.pageCount])).toEqual([
      ["1", "3", 3],
      ["5", "6", 2],
    ]);
  });

  it("re-derives blanks when a change in one chapter changes its parity", async () => {
    const { book, host } = setup();
    await book.layout(input([chapter("a", 2), chapter("b", 1)]));
    expect(host.querySelectorAll("[data-blank-page]")).toHaveLength(0);
    const res = await book.layout(input([chapter("a", 3), chapter("b", 1)]));
    expect(host.querySelectorAll("[data-blank-page]")).toHaveLength(1);
    expect(res?.pageCount).toBe(5);
  });

  it("removes a blank that is no longer needed instead of stacking a second one on re-layout", async () => {
    const { book, host } = setup();
    await book.layout(input([chapter("a", 3), chapter("b", 1)]));
    await book.layout(input([chapter("a", 3), chapter("b", 1)]));
    expect(host.querySelectorAll("[data-blank-page]")).toHaveLength(1);
    const res = await book.layout(input([chapter("a", 4), chapter("b", 1)]));
    expect(host.querySelectorAll("[data-blank-page]")).toHaveLength(0);
    expect(res?.pageCount).toBe(5);
  });
});

describe("the cache", () => {
  it("lays out only the chapter that changed", async () => {
    const { book } = setup();
    await book.layout(input([chapter("a", 2), chapter("b", 2), chapter("c", 2)]));
    expect(mocks.runs).toHaveLength(3);
    const res = await book.layout(input([chapter("a", 2), chapter("b", 2, "<p>edited</p>"), chapter("c", 2)]));
    expect(mocks.runs).toHaveLength(4);
    expect(res?.laidOutChapterIds).toEqual(["b"]);
  });

  it("lays out nothing when nothing changed, yet still writes the footers", async () => {
    const { book, host } = setup();
    const chapters = [chapter("a", 2)];
    await book.layout(input(chapters));
    host.querySelectorAll(".sc-footer").forEach((f) => f.remove());
    await book.layout(input(chapters));
    expect(mocks.runs).toHaveLength(1);
    expect(host.querySelectorAll(".sc-footer")).toHaveLength(2);
  });

  it("lays every chapter out again when a setting that changes layout changes", async () => {
    const { book } = setup();
    const chapters = [chapter("a", 2), chapter("b", 2)];
    await book.layout(input(chapters));
    await book.layout(input(chapters, { settings: { ...settings, pageSize: "A5" } }));
    expect(mocks.runs).toHaveLength(4);
  });

  it("does not lay out again for a footer text or page number start, which only rewrite the pages", async () => {
    const { book } = setup();
    const chapters = [chapter("a", 2), chapter("b", 2)];
    await book.layout(input(chapters));
    const res = await book.layout(input(chapters, { settings: { ...settings, pageNumberStart: 9, footerText: "New" } }));
    expect(mocks.runs).toHaveLength(2);
    expect(res?.pages[0].label).toBe("9");
  });

  it("renumbers later chapters when an earlier one grows, without laying them out again", async () => {
    const { book } = setup();
    await book.layout(input([chapter("a", 2), chapter("b", 2)]));
    const res = await book.layout(input([chapter("a", 4), chapter("b", 2)]));
    expect(res?.laidOutChapterIds).toEqual(["a"]);
    expect(res?.chapters[1].firstLabel).toBe("5");
  });

  it("forgets a chapter that left the book", async () => {
    const { book, host } = setup();
    await book.layout(input([chapter("a", 2), chapter("b", 2)]));
    const res = await book.layout(input([chapter("a", 2)]));
    expect(host.querySelectorAll(".sc-book-chapter")).toHaveLength(1);
    expect(res?.pageCount).toBe(2);
  });
});

describe("order of work", () => {
  it("lays out the named chapter first, then the rest in book order, with the pages still in book order", async () => {
    const { book, host } = setup();
    await book.layout(input([chapter("a", 2), chapter("b", 2), chapter("c", 2)]), { focusChapterId: "c" });
    expect(mocks.runs.map((r) => /<p>(\w)<\/p>/.exec(r.html)?.[1])).toEqual(["c", "a", "b"]);
    const order = Array.from(host.querySelectorAll(".pagedjs_page")).map((p) => p.getAttribute("data-chapter-id"));
    expect(order).toEqual(["a", "a", "b", "b", "c", "c"]);
  });

  it("stops between chapters when told to, and keeps what it finished", async () => {
    const { book } = setup();
    let stop = false;
    const res = await book.layout(input([chapter("a", 2), chapter("b", 2)]), {
      shouldAbort: () => stop,
      onChapter: () => {
        stop = true;
      },
    });
    expect(res).toBeNull();
    expect(mocks.runs).toHaveLength(1);
    const next = await book.layout(input([chapter("a", 2), chapter("b", 2)]));
    expect(next?.laidOutChapterIds).toEqual(["b"]);
  });
});

describe("empty chapters", () => {
  it("never hands Paged.js empty HTML (it would paginate the whole app)", async () => {
    const { book } = setup();
    const res = await book.layout(input([{ id: "a", html: "  \n" }]));
    expect(mocks.runs).toHaveLength(0);
    expect(res?.pageCount).toBe(0);
  });

  // #1115: a new handout is `<p></p>`, which preparation strips to "", so the
  // guard on the raw html let it through and the whole app vanished into Paged.js.
  it("never hands Paged.js a chapter that is only an empty paragraph", async () => {
    const { book } = setup();
    const res = await book.layout(input([{ id: "a", html: '<p data-block-id="x"></p>' }]));
    expect(mocks.runs).toHaveLength(0);
    expect(res?.pageCount).toBe(0);
  });

  it("adds no blank for the empty chapter between two others, and the last filled chapter gets none", async () => {
    const { book } = setup();
    const res = await book.layout(input([chapter("a", 2), { id: "gap", html: "" }, chapter("b", 3)]));
    expect(res?.pages.filter((p) => p.blank)).toHaveLength(0);
    expect(res?.chapters[1]).toMatchObject({ pageCount: 0, firstIndex: null, firstLabel: null });
  });
});

describe("the contents page", () => {
  it("lists the headings of every chapter, not only the chapter it sits in", async () => {
    const { book } = setup();
    await book.layout(
      input([
        chapter("a", 1, '<nav data-type="toc"></nav><h1>Alpha</h1>'),
        chapter("b", 1, "<h1>Beta heading</h1>"),
      ]),
    );
    expect(mocks.runs[0].html).toContain("Beta heading");
  });

  it("numbers each entry with the printed page its heading landed on, across chapters and a blank", async () => {
    const { book, host } = setup();
    await book.layout(
      input([
        chapter("a", 1, '<nav data-type="toc"></nav><h1 data-on-page="1">Alpha</h1>'),
        chapter("b", 2, '<h1 data-on-page="2">Beta</h1>'),
      ]),
    );
    const cells = Array.from(host.querySelectorAll(".sc-toc-page")).map((c) => c.textContent);
    // a is page 1, the blank is 2, b opens on 3 and its heading is on 4.
    expect(cells).toEqual(["1", "4"]);
  });

  it("lays the contents chapter out again when another chapter's headings change, and only that one", async () => {
    const { book } = setup();
    const toc = chapter("a", 1, '<nav data-type="toc"></nav>');
    await book.layout(input([toc, chapter("b", 1, "<h1>One</h1>"), chapter("c", 1)]));
    const res = await book.layout(input([toc, chapter("b", 1, "<h1>One</h1>"), chapter("c", 1, "<h1>New</h1>")]));
    expect(res?.laidOutChapterIds.sort()).toEqual(["a", "c"]);
  });
});

describe("furniture and markers", () => {
  it("anchors a page's furniture to its page within its chapter", async () => {
    const { book, host } = setup();
    await book.layout(
      input([chapter("a", 1), chapter("b", 2)], {
        furniture: {
          items: [
            {
              id: "f1",
              kind: "art",
              anchor: { type: "page", chapterId: "b", page: 2 },
              x: 0, y: 0, width: 10, z: "over", props: { src: "x.png" },
            },
          ],
        },
      }),
    );
    const pages = Array.from(host.querySelectorAll(".pagedjs_page"));
    // a, blank, b1, b2
    expect(pages.map((p) => p.querySelector(".sc-furniture") !== null)).toEqual([false, false, false, true]);
  });

  it("gives every page a unique id even though Paged.js numbers each run from 1", async () => {
    const { book, host } = setup();
    await book.layout(input([chapter("a", 2), chapter("b", 2)]));
    const ids = Array.from(host.querySelectorAll(".pagedjs_page")).map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("Paged.js styles", () => {
  it("keeps only the newest run's styles in the head", async () => {
    const { book } = setup();
    await book.layout(input([chapter("a", 2), chapter("b", 2)]));
    const all = mocks.runs.flatMap((r) => r.styles);
    expect(all.map((s) => s.isConnected)).toEqual([false, true]);
    expect(book.styleElements()).toEqual([all[1]]);
  });

  it("removes them on dispose, and the book with them", async () => {
    const { book, host } = setup();
    await book.layout(input([chapter("a", 2)]));
    const style = mocks.runs[0].styles[0];
    book.dispose();
    expect(style.isConnected).toBe(false);
    expect(host.children).toHaveLength(0);
  });

  it("takes a failed run's styles back out and leaves the earlier layout on screen", async () => {
    const { book, host } = setup();
    await book.layout(input([chapter("a", 2)]));
    mocks.fail = "boom";
    await expect(book.layout(input([chapter("a", 2, "<p>edit</p>")]))).rejects.toThrow("boom");
    expect(mocks.runs[1].styles[0].isConnected).toBe(false);
    expect(mocks.runs[0].styles[0].isConnected).toBe(true);
    expect(host.querySelectorAll(".pagedjs_page")).toHaveLength(2);
  });
});

describe("flattenPages", () => {
  it("puts every page, blanks included, in one wrapper in book order", async () => {
    const { book, host } = setup();
    await book.layout(input([chapter("a", 1), chapter("b", 2)]));
    book.flattenPages();
    expect(host.children).toHaveLength(1);
    expect(host.firstElementChild?.className).toBe("pagedjs_pages");
    expect(host.querySelectorAll(":scope > .pagedjs_pages > .pagedjs_page")).toHaveLength(4);
  });
});

describe("input checks", () => {
  it("refuses two chapters with one id (the cache and the furniture anchors are keyed by it)", async () => {
    const { book } = setup();
    await expect(book.layout(input([chapter("a", 1), chapter("a", 1)]))).rejects.toThrow(/share the id/);
  });
});
