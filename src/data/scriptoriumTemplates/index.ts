/*
 * Scriptorium template gallery (Phase C, #455).
 *
 * Each template is a finished-looking starting document — composed from the
 * cover/class-table JSON factories plus the small node builders — so a new
 * document opens as a styled book skeleton instead of a blank page.
 */

import type { JSONContent } from "@tiptap/core";
import type { ScriptoriumTemplate, ScriptoriumTemplateSettings } from "./types";
import {
  frontCoverTemplate,
  insideCoverTemplate,
  backCoverTemplate,
} from "@/lib/scriptorium/coverTemplates";
import { fullCasterTable } from "@/lib/scriptorium/classTableTemplates";
import { doc, h1, h2, h3, p, em, strong, text, bullets, note, descriptive, toc, pageBreak } from "./builders";

const settings = (over: Partial<ScriptoriumTemplateSettings> = {}): ScriptoriumTemplateSettings => ({
  theme: "onednd2024",
  pageSize: "A4",
  // Single column by default — two-column reads cramped with the sparse starter
  // content, and it's one toolbar click to switch on once a page fills up.
  isTwoColumn: false,
  inkFriendly: false,
  showPageNumbers: true,
  footerText: "",
  pageNumberStart: 1,
  tags: [],
  ...over,
});

// Cover/table factories are typed loosely (CoverPageJSON / object); they emit
// valid Tiptap nodes, so spread/cast them into the content stream.
const cover = (fn: () => unknown): JSONContent[] => fn() as JSONContent[];
const node = (fn: () => unknown): JSONContent => fn() as JSONContent;

// ── Templates ──────────────────────────────────────────────────────────────

const blankBook: ScriptoriumTemplate = {
  id: "blank-book",
  name: "Blank Book",
  description: "A cover and a table of contents — the bare bones of a bound volume, ready for anything.",
  docType: "custom",
  settings: settings(),
  build: () =>
    doc(
      ...cover(() => frontCoverTemplate({ title: "Untitled Tome", subtitle: "An Unofficial Supplement" })),
      toc(),
      h1("Chapter One"),
      p("Begin your tale here."),
    ),
};

const adventureModule: ScriptoriumTemplate = {
  id: "adventure-module",
  name: "Adventure Module",
  description: "Front cover, credits, contents, and chapter scaffolding with read-aloud and DM callouts — a publishable adventure shell.",
  docType: "adventure",
  settings: settings({ footerText: "An Unofficial Adventure" }),
  build: () =>
    doc(
      ...cover(() => frontCoverTemplate({ title: "The Frozen Gate", subtitle: "An Adventure for 4–6 Characters of 3rd–5th Level" })),
      ...cover(() => insideCoverTemplate({ title: "The Frozen Gate", subtitle: "Credits & Acknowledgements" })),
      toc(),
      h1("Chapter 1: A Cold Welcome"),
      descriptive(
        p("Read this aloud when the party first enters the village:"),
        p(em("Snow crunches underfoot as a cluster of fire-lit halls emerges from the white. A figure watches from a doorway, breath fogging the air.")),
      ),
      p("Summarise the situation that greets the characters and the hook that pulls them onward."),
      note(p(strong("DM Note. "), text("Drop a clue here that foreshadows the chapter's central threat."))),
      h2("Areas of Note"),
      h3("1. The Mead Hall"),
      p("Describe the location, who is present, and what the characters can learn."),
      h3("2. The Watchtower"),
      p("A second keyed area. Note any traps, treasure, or encounters."),
      pageBreak(),
      h1("Chapter 2: The Frozen Gate"),
      p("Continue the adventure. Use page breaks to start each major scene on a fresh page."),
      ...cover(() => backCoverTemplate({ subtitle: "The Frozen Gate" })),
    ),
};

const monsterCompendium: ScriptoriumTemplate = {
  id: "monster-compendium",
  name: "Monster Compendium",
  description: "A bestiary shell — cover, contents, and a section layout ready for stat blocks dropped in via the Insert panel.",
  docType: "monster",
  settings: settings({ footerText: "Bestiary" }),
  build: () =>
    doc(
      ...cover(() => frontCoverTemplate({ title: "Tome of Beasts", subtitle: "A Bestiary of the North" })),
      toc(),
      h1("Introduction"),
      p("Describe how to use this bestiary — challenge ratings, habitats, and any house rules for the creatures within."),
      note(p(strong("Tip. "), text('Use the toolbar\'s Insert button to drop a monster\'s stat block straight from your campaign, or Block → Monster Stat Block for a blank one.'))),
      pageBreak(),
      h1("Monsters"),
      h2("Creatures of the Tundra"),
      p("Group your creatures by habitat, type, or alphabetically — whatever suits the tome."),
    ),
};

const spellCompendium: ScriptoriumTemplate = {
  id: "spell-compendium",
  name: "Spell Compendium",
  description: "A grimoire shell with spells organised by level — example entry included.",
  docType: "spell",
  settings: settings({ footerText: "Grimoire of Spells" }),
  build: () =>
    doc(
      ...cover(() => frontCoverTemplate({ title: "Whispered Words", subtitle: "A Grimoire of New Magic" })),
      toc(),
      h1("Introduction"),
      p("Introduce the theme of these spells and who might learn them."),
      pageBreak(),
      h1("Spell Descriptions"),
      h2("1st-Level Spells"),
      h3("Frostbind"),
      p(em("1st-level evocation")),
      p(strong("Casting Time "), text("1 action")),
      p(strong("Range "), text("60 feet")),
      p(strong("Components "), text("V, S, M (a sliver of clear ice)")),
      p(strong("Duration "), text("Concentration, up to 1 minute")),
      p("Describe the spell's effect here."),
      h3("At Higher Levels"),
      p("Describe how the spell scales when cast using a higher-level slot."),
    ),
};

const subclassSupplement: ScriptoriumTemplate = {
  id: "subclass-supplement",
  name: "Subclass Supplement",
  description: "A class options booklet — intro, a pre-built progression table, and feature scaffolding.",
  docType: "subclass",
  settings: settings({ footerText: "Class Options" }),
  build: () =>
    doc(
      ...cover(() => frontCoverTemplate({ title: "Paths Untrodden", subtitle: "New Subclasses for Every Hero" })),
      toc(),
      h1("The Frostwarden"),
      p(em("A subclass for the Ranger")),
      p("Open with the flavour and fantasy of this subclass — who takes it, and why."),
      node(() => fullCasterTable()),
      h2("Subclass Features"),
      h3("Frostwarden Magic"),
      p(em("3rd-level Frostwarden feature")),
      p("Describe the feature the character gains, in the present tense."),
      h3("Winter's Embrace"),
      p(em("7th-level Frostwarden feature")),
      p("A second feature. Add as many as the subclass needs."),
    ),
};

const onePageDungeon: ScriptoriumTemplate = {
  id: "one-page-dungeon",
  name: "One-Page Dungeon",
  description: "A single dense page — title, read-aloud intro, and keyed areas. No covers, no page numbers.",
  docType: "adventure",
  settings: settings({ showPageNumbers: false }),
  build: () =>
    doc(
      h1("The Sunken Crypt"),
      descriptive(p(em("A short read-aloud to set the scene as the characters arrive at the dungeon's threshold."))),
      p("A line or two of overview: the dungeon's history, its current danger, and what the party seeks within."),
      h2("Keyed Areas"),
      h3("1. Collapsed Entry"),
      p("What the characters see, hear, and can interact with."),
      h3("2. The Flooded Hall"),
      p("Describe hazards, secrets, and any encounter."),
      h3("3. The Crypt Proper"),
      p("The climax area — the prize and the price of taking it."),
      h2("Wandering Threats"),
      bullets("Roll a d6 each hour; on a 1, a threat appears.", "List 2–3 possible threats here."),
    ),
};

export const SCRIPTORIUM_TEMPLATES: ScriptoriumTemplate[] = [
  blankBook,
  adventureModule,
  monsterCompendium,
  spellCompendium,
  subclassSupplement,
  onePageDungeon,
];

export type { ScriptoriumTemplate, ScriptoriumTemplateSettings } from "./types";
