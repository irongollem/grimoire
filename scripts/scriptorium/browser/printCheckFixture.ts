/*
 * The book the print test lays out and prints (#1176). Markup in the shape the
 * editor hands the layout (TipTap's own HTML), written out by hand so the test
 * needs no editor, no Supabase and no campaign. It holds every thing the
 * printer has been known to move: running two-column text, a stat block, a
 * read-aloud box, a table, a wrapped picture, and explicit page and column
 * breaks. Two chapters, so a chapter's blank page is in the book too.
 */
import type { BookChapterInput } from "@/scriptorium/lib/bookLayout/types";

const SUBJECTS = ["Mara", "The keeper", "A drowned acolyte", "The lamplighter", "Oren the ferryman", "The toll clerk"];
const DEEDS = [
  "counts the doors twice and finds one more than the map allows",
  "lifts the lantern until the oil gutters and the water answers",
  "reads the ledger of tolls aloud, every entry dated the day the bells changed",
  "wades the lower stair with a rusted key held clear of the flood",
  "listens at the low door where the damp has eaten the plaster",
  "marks the wall at the waterline and watches the mark go under",
];

// Every sentence carries its own number, so no two pages (and no two ends of
// one page) share their first or last words: the check compares those.
let sentenceNo = 0;
function sentence(): string {
  const n = ++sentenceNo;
  return `${SUBJECTS[n % SUBJECTS.length]} ${DEEDS[(n * 5) % DEEDS.length]}, and nothing has changed by bell ${n}.`;
}

function prose(paragraphs: number): string {
  return Array.from({ length: paragraphs }, () => `<p>${sentence()} ${sentence()}</p>`).join("");
}

// A 4x3 picture as an SVG data URL: nothing to fetch, so the printer needs no network.
const PICTURE =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="180"><rect width="240" height="180" fill="#b9a27a"/><circle cx="120" cy="90" r="50" fill="#5c4a2e"/></svg>',
  );

const statBlock = (n: number) => `
<div class="sc-statblock sc-statblock--column">
  <h4>Drowned Sentry ${n}</h4>
  <p><em>Medium undead, neutral evil</em></p>
  <p><strong>Armor Class</strong> 13 (rusted mail) <strong>Hit Points</strong> 45 (6d8 + 18) <strong>Speed</strong> 30 ft., swim 30 ft.</p>
  <table><thead><tr><th>STR</th><th>DEX</th><th>CON</th><th>INT</th><th>WIS</th><th>CHA</th></tr></thead>
  <tbody><tr><td>16 (+3)</td><td>10 (+0)</td><td>16 (+3)</td><td>6 (-2)</td><td>10 (+0)</td><td>5 (-3)</td></tr></tbody></table>
  <p><strong>Water Weird Grip.</strong> The sentry pulls a creature it has grappled under the water and holds it there until it drowns or the sentry falls.</p>
  <p><strong>Slam.</strong> Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 11 (2d6 + 4) bludgeoning damage.</p>
</div>`;

const readAloud = (n: number) => `
<div data-type="descriptiveBlock" class="sc-descriptive">
  <p>The water in the cellar is black and perfectly still. Somewhere below it a bell rings once, slowly, and the surface does not so much as shiver. This was the ${n}th bell.</p>
</div>`;

const table = (n: number) => `
<table>
  <thead><tr><th>d6</th><th>What the party finds in cellar ${n}</th></tr></thead>
  <tbody>
    <tr><td>1</td><td>A drowned lantern that still burns with a cold green flame</td></tr>
    <tr><td>2</td><td>A ledger of tolls, every entry dated the day the bells changed</td></tr>
    <tr><td>3</td><td>The keeper's boots, standing upright and perfectly dry</td></tr>
    <tr><td>4</td><td>A door that was not on the map</td></tr>
    <tr><td>5</td><td>Nothing at all, which is worse</td></tr>
    <tr><td>6</td><td>A second key, on the same nail as the first</td></tr>
  </tbody>
</table>`;

const WRAPPED_PICTURE = `
<div class="sc-img-wrap sc-img-wrap--wrapRight"><img data-layout-mode="wrapRight" width="200" src="${PICTURE}" alt=""></div>`;

const PAGE_BREAK = '<div data-type="page-break" class="sc-page-break"></div>';
const COLUMN_BREAK = '<div data-type="column-break" class="sc-column-break"></div>';

/** Chapter one: three to four pages of two-column text with every block above. */
const CHAPTER_ONE = [
  "<h1>The Sunken Gate</h1>",
  prose(6),
  "<h2>The first cellar</h2>",
  WRAPPED_PICTURE,
  prose(4),
  readAloud(1),
  statBlock(1),
  prose(5),
  "<h2>What the water keeps</h2>",
  table(1),
  prose(8),
  PAGE_BREAK,
  "<h2>The long stair</h2>",
  prose(3),
  // Early in the page, so it moves the rest into the second column. A break
  // taken while already in the second column puts the text in a third that is
  // off the page: print drops it, and this test exists to say so.
  COLUMN_BREAK,
  prose(11),
  statBlock(2),
  prose(10),
].join("\n");

/** Chapter two opens on a right-hand page, so chapter one is followed by a blank when its page count is odd. */
const CHAPTER_TWO = ["<h1>The Keeper's Bell</h1>", prose(9), readAloud(2), table(2), prose(7)].join("\n");

export const FIXTURE_CHAPTERS: BookChapterInput[] = [
  { id: "sunken-gate", html: CHAPTER_ONE },
  { id: "keepers-bell", html: CHAPTER_TWO },
];
