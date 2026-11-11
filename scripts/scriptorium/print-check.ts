/*
 * The print test (#1176, "the PDF is the page"). Lays a fixture book out with
 * the app's real engine, prints it with Chrome's own PDF printing and the same
 * print document the export sends to Cloudflare, reads the PDF back with
 * pdf.js and runs the very check the export runs. Exits 1 on any page that
 * printed differently from the page that was laid out.
 *
 * Offline and without Supabase: a bare Vite server serves one test page, and
 * Playwright's Chromium does the printing. Needs Chromium installed
 * (`npx playwright install chromium`).
 *
 *   npm run scriptorium:print-check
 *   PRINT_CHECK_CHANNEL=chrome npm run scriptorium:print-check   (an installed Chrome)
 */
import { chromium } from "playwright";
import { createServer } from "vite";
import path from "node:path";
import { writeFileSync } from "node:fs";
import { readPageTexts } from "../../src/scriptorium/lib/pdfPageTexts";
import { checkPrintedPages, compactText } from "../../src/scriptorium/lib/printCheck";
import type { LaidOutFixture } from "./laidOutFixture";

/** A fixture shorter than this proves nothing about page breaks. */
const MIN_PAGES = 6;

async function main(): Promise<number> {
  const server = await createServer({
    configFile: path.resolve(import.meta.dirname, "vite.config.ts"),
    server: { host: "127.0.0.1", port: 0, strictPort: false },
  });
  await server.listen();
  const origin = server.resolvedUrls?.local[0]?.replace(/\/$/, "");
  if (!origin) throw new Error("The test server did not report where it is listening.");

  // PRINT_CHECK_CHANNEL=chrome prints with an installed Chrome when Playwright's own build is not downloaded.
  const channel = process.env.PRINT_CHECK_CHANNEL;
  const executablePath = process.env.PRINT_CHECK_EXECUTABLE;
  const browser = await chromium.launch({ ...(channel ? { channel } : {}), ...(executablePath ? { executablePath } : {}) });
  try {
    const layoutPage = await browser.newPage();
    layoutPage.on("pageerror", (e) => console.error("page error:", e.message));
    await layoutPage.goto(`${origin}/scripts/scriptorium/browser/print-check.html`);
    await layoutPage.waitForFunction("typeof window.layoutFixture === 'function'");
    // A string, not a function: this file is checked without the DOM types the page code needs.
    const laid = (await layoutPage.evaluate("window.layoutFixture()")) as LaidOutFixture;
    console.log(`laid out ${laid.expected.length} pages`);
    if (laid.expected.length < MIN_PAGES) {
      console.error(`The fixture laid out only ${laid.expected.length} pages; it must fill at least ${MIN_PAGES}.`);
      return 1;
    }

    // The printed document is served from the same origin, so the fonts it names resolve as in the app.
    const printPage = await browser.newPage();
    await printPage.route(`${origin}/__print__`, (route) =>
      route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: laid.html }),
    );
    await printPage.goto(`${origin}/__print__`);
    await printPage.evaluate("document.fonts.ready");
    const pdf = await printPage.pdf({ preferCSSPageSize: true, printBackground: true });

    // PRINT_CHECK_PDF=<file> keeps the printed PDF, to look at a page the check names.
    if (process.env.PRINT_CHECK_PDF) writeFileSync(process.env.PRINT_CHECK_PDF, pdf);
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const printed = await readPageTexts(pdfjs, new Uint8Array(pdf));
    console.log(`printed ${printed.length} pages`);

    if (process.env.PRINT_CHECK_DUMP) writeFileSync(process.env.PRINT_CHECK_DUMP, JSON.stringify({ expected: laid.expected, printed }));
    const result = checkPrintedPages(laid.expected, printed);
    if (result.ok) {
      console.log(`All ${laid.expected.length} pages printed as laid out.`);
      return 0;
    }
    for (const page of result.pages) {
      console.error(`${page.label} printed differently: ${page.reason}`);
      if (process.env.PRINT_CHECK_VERBOSE && page.index < printed.length) {
        console.error(`  laid out: ${JSON.stringify(laid.expected[page.index]?.text)}`);
        console.error(`  ignorable: ${JSON.stringify(laid.expected[page.index]?.ignorable)}`);
        console.error(`  printed:  ${JSON.stringify(printed[page.index])}`);
        {
          const a = compactText(laid.expected[page.index]?.text ?? "");
          const b = compactText(printed[page.index]);
          let i = 0;
          while (i < a.length && a[i] === b[i]) i++;
          console.error(`  lengths ${a.length} vs ${b.length}; first difference at ${i}: laid out "${a.slice(i, i + 40)}" printed "${b.slice(i, i + 40)}"`);
        }
        console.error(`  laid out, compact: ...${compactText(laid.expected[page.index]?.text ?? "").slice(-60)}`);
        console.error(`  printed, compact:  ...${compactText(printed[page.index]).slice(-60)}`);
      }
    }
    return 1;
  } finally {
    await browser.close();
    await server.close();
  }
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
