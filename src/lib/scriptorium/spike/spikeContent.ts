/*
 * Paged.js spike — PHB-representative content generator.
 *
 * Phase B go/no-go (SCRIPTORIUM_PLAN.md §3, issue #330): generates the HTML
 * the spike harness feeds through Paged.js. Deterministic (no randomness) so
 * runs are comparable. Each scenario isolates one fragmentation risk; "full"
 * combines everything a real adventure module would contain.
 */

import {
  monsterStatBlockTemplate,
  monsterStatBlockWideTemplate,
} from "@/lib/scriptorium/templates";

export const SPIKE_SCENARIOS = [
  "single",
  "twocol",
  "floats",
  "gutter",
  "widespan",
  "full",
] as const;
export type SpikeScenario = (typeof SPIKE_SCENARIOS)[number];

const SENTENCES = [
  "The wind howls across the dale as the party approaches the ruined watchtower.",
  "Ten-day-old snow crunches underfoot, and somewhere below the ice groans against black stone.",
  "A narrow stair descends into darkness, its steps slick with frost.",
  "Legends claim the tower predates the founding of Ten-Towns by a thousand years.",
  "Those who linger after dusk report whispers in a tongue no scholar can place.",
  "The air grows colder with every step, far beyond what the season explains.",
  "Carved reliefs along the walls depict robed figures kneeling before a frozen star.",
  "Your torchlight gutters as though something unseen draws breath beside you.",
];

/** Deterministic paragraph: `idx` rotates through the sentence pool. */
function paragraph(idx: number, sentences = 4): string {
  const parts: string[] = [];
  for (let s = 0; s < sentences; s++) {
    parts.push(SENTENCES[(idx + s) % SENTENCES.length]);
  }
  return `<p>${parts.join(" ")}</p>`;
}

/** Inline SVG placeholder art — no network, deterministic, visibly labelled. */
function placeholderArt(label: string, w: number, h: number): string {
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'>` +
    `<rect width='100%25' height='100%25' fill='%237d1c1c'/>` +
    `<text x='50%25' y='50%25' fill='%23f9f6ef' font-size='14' text-anchor='middle' dominant-baseline='middle'>${label}</text></svg>`;
  return `data:image/svg+xml,${svg}`;
}

function floatImage(side: "wrapLeft" | "wrapRight", gutter: boolean, label: string): string {
  const cls = `sc-img-wrap sc-img-wrap--${side}${gutter ? " sc-img-wrap--gutter" : ""}`;
  return `<div class="${cls}"><img src="${placeholderArt(label, 200, 260)}" alt="${label}" style="width:200px" /></div>`;
}

function noteBlock(idx: number): string {
  return `<div class="sc-note" data-type="note">${paragraph(idx, 2)}</div>`;
}

function descriptiveBlock(idx: number): string {
  return `<div class="sc-descriptive" data-type="descriptive">${paragraph(idx, 3)}</div>`;
}

function wideTable(): string {
  const head = `<tr>${["Level", "Proficiency", "Features", "Rages", "Rage Damage"].map((h) => `<th>${h}</th>`).join("")}</tr>`;
  const rows = Array.from({ length: 10 }, (_, i) =>
    `<tr><td>${i + 1}</td><td>+${2 + Math.floor(i / 4)}</td><td>Feature ${i + 1}</td><td>${2 + Math.floor(i / 3)}</td><td>+2</td></tr>`,
  ).join("");
  return `<div class="sc-wide"><table class="sc-class-table"><thead>${head}</thead><tbody>${rows}</tbody></table></div>`;
}

function coverPage(title: string): string {
  return (
    `<div class="spike-cover" data-type="coverPage" data-variant="front">` +
    `<h1 style="font-size:2.5rem;margin:40% 0 0;text-align:center;background:none;color:#f9f6ef">${title}</h1>` +
    `<p style="text-align:center;color:#f9f6ef">A Paged.js fragmentation spike</p></div>`
  );
}

interface ChapterOptions {
  twoCol: boolean;
  floats: boolean;
  gutter: boolean;
  wideSpan: boolean;
  callouts: boolean;
  statBlocks: boolean;
}

/** One chapter ≈ 2–3 rendered A4 pages of two-column content. */
function chapter(n: number, opts: ChapterOptions): string {
  const body: string[] = [];
  body.push(`<h1>Chapter ${n}: The Frozen Gate</h1>`);
  for (let i = 0; i < 14; i++) {
    if (i === 1 && opts.floats) body.push(floatImage("wrapLeft", false, `art ${n}.1`));
    if (i === 5 && opts.floats) body.push(floatImage("wrapRight", opts.gutter, `art ${n}.2${opts.gutter ? " (gutter)" : ""}`));
    if (i === 3) body.push(`<h2>Area ${n}.${i}</h2>`);
    if (i === 9) body.push(`<h3>Encounter ${n}.${i}</h3>`);
    if (i === 4 && opts.callouts) body.push(noteBlock(n + i));
    if (i === 8 && opts.callouts) body.push(descriptiveBlock(n + i));
    if (i === 6 && opts.wideSpan) body.push(wideTable());
    if (i === 11 && opts.statBlocks) {
      // The Tiptap noteBlock node adds .sc-note at render time; raw spike
      // HTML needs the class inline for the theme CSS + break-inside rules.
      const block = n % 2 === 0 ? monsterStatBlockWideTemplate() : monsterStatBlockTemplate();
      body.push(
        block.replace('data-type="noteBlock"', 'class="sc-note sc-stat-block" data-type="noteBlock"'),
      );
    }
    body.push(paragraph(n * 7 + i));
  }
  const inner = body.join("\n");
  return opts.twoCol ? `<section class="phb-two-col">${inner}</section>` : `<section>${inner}</section>`;
}

/**
 * Build a spike document. `targetPages` is approximate — chapters are sized
 * so a two-column chapter spans ~2.5 A4 pages.
 */
export function buildSpikeContent(scenario: SpikeScenario, targetPages: number): string {
  const opts: ChapterOptions = {
    twoCol: scenario !== "single",
    floats: scenario === "floats" || scenario === "gutter" || scenario === "full",
    gutter: scenario === "gutter" || scenario === "full",
    wideSpan: scenario === "widespan" || scenario === "full",
    callouts: scenario !== "twocol",
    statBlocks: scenario === "full",
  };
  const pagesPerChapter = scenario === "single" ? 1.6 : 2.5;
  const chapters = Math.max(1, Math.round(targetPages / pagesPerChapter));
  const parts: string[] = [coverPage("The Frozen Gate")];
  for (let c = 1; c <= chapters; c++) parts.push(chapter(c, opts));
  return parts.join("\n");
}
