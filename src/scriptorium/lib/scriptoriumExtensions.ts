/*
 * The full Tiptap extension stack used by the Scriptorium editor.
 *
 * Returned as a function (rather than a static array) so each editor instance
 * gets its own extension objects — Tiptap mutates these during configuration.
 *
 * Watercolor/Watermark/ArtistCredit are deliberately NOT registered here
 * (#915 story 2). They were content-stream nodes only ever needed to parse
 * documents from before page furniture existed; `documentContent.ts`'s
 * import-boundary normalization now lifts those legacy shapes into
 * `page_furniture` before this schema ever sees them, so the nodes — and the
 * "stay registered forever so old JSON parses" caveat that used to live here
 * — are gone rather than carried indefinitely.
 */

import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";

import { ScriptoriumImage } from "@/scriptorium/tiptap/scriptoriumImage";
import { SpacerVertical } from "@/scriptorium/tiptap/SpacerVertical";
import { SpacerHorizontal } from "@/scriptorium/tiptap/SpacerHorizontal";
import { ColumnBreak } from "@/scriptorium/tiptap/columnBreak";
import { SkipCounting } from "@/scriptorium/tiptap/skipCounting";
import { ResetCounting } from "@/scriptorium/tiptap/resetCounting";
import { WideBlock } from "@/scriptorium/tiptap/wideBlock";
import { NoteBlock } from "@/scriptorium/tiptap/noteBlock";
import { DescriptiveBlock } from "@/scriptorium/tiptap/descriptiveBlock";
import { QuoteBlock } from "@/scriptorium/tiptap/quoteBlock";
import { Attribution } from "@/scriptorium/tiptap/attribution";
import { TocBlock } from "@/scriptorium/tiptap/tocBlock";
import { CoverPage } from "@/scriptorium/tiptap/coverPage";
import { BlockId } from "@/scriptorium/tiptap/blockId";
import { PageBreak, PageBreakKeys } from "@/scriptorium/tiptap/pageBreak";
import { EntityEmbed } from "@/scriptorium/tiptap/entityEmbed";
import { DropCap } from "@/scriptorium/tiptap/dropCap";
import { BlockKeep } from "@/scriptorium/tiptap/blockKeep";
import { KitDrop } from "@/scriptorium/tiptap/kitDrop";
import { SlashMenu } from "@/scriptorium/tiptap/slashMenu";
import { lensPairExtensions } from "@/lib/tiptap/lensPair";
import { SecretBlock } from "@/lib/tiptap/secretBlock";

/*
 * Tiptap nodes don't have a public-facing generic for `extend()`'s config that
 * lets us write a clean `withClassAttribute(node)` helper without `any`. So
 * instead the `class` attribute is added via a shared object literal that each
 * table-family node spreads into its own `addAttributes()`.
 */
const CLASS_ATTRIBUTE = {
  default: null as string | null,
  parseHTML: (el: HTMLElement) => el.getAttribute("class") ?? null,
  renderHTML: (attrs: { class?: string }) =>
    attrs.class ? { class: attrs.class } : {},
};

const TableWithClass = Table.extend({
  addAttributes() {
    return { ...this.parent?.(), class: CLASS_ATTRIBUTE };
  },
}).configure({ resizable: false });

const TableCellWithClass = TableCell.extend({
  addAttributes() {
    return { ...this.parent?.(), class: CLASS_ATTRIBUTE };
  },
});

const TableHeaderWithClass = TableHeader.extend({
  addAttributes() {
    return { ...this.parent?.(), class: CLASS_ATTRIBUTE };
  },
});

export function createScriptoriumExtensions() {
  return [
    StarterKit,
    Placeholder.configure({ placeholder: "Begin your document here…" }),
    ScriptoriumImage,
    SpacerVertical,
    SpacerHorizontal,
    ColumnBreak,
    TableWithClass,
    TableRow,
    TableCellWithClass,
    TableHeaderWithClass,
    SkipCounting,
    ResetCounting,
    WideBlock,
    NoteBlock,
    DescriptiveBlock,
    QuoteBlock,
    Attribution,
    TocBlock,
    CoverPage,
    BlockId,
    PageBreak,
    // Ctrl+Enter starts a new page at the caret.
    PageBreakKeys,
    EntityEmbed,
    // The book kit's writing tools: a drop cap, "keep on one page", dropping a kit item on the
    // page, and "/" for any block. The last two only act in an editable editor.
    DropCap,
    BlockKeep,
    KitDrop,
    SlashMenu,
    ...lensPairExtensions({ creatable: true }),
    // "Only you see this" (#1115): a DM-only passage. It never prints and never
    // reaches a player; layoutContent.ts takes it out before anything is laid out.
    SecretBlock.configure({ creatable: true }),
  ];
}
