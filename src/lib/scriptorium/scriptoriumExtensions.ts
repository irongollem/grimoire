/*
 * The full Tiptap extension stack used by the Scriptorium editor.
 *
 * Returned as a function (rather than a static array) so each editor instance
 * gets its own extension objects — Tiptap mutates these during configuration.
 */

import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";

import { ScriptoriumImage } from "@/lib/tiptap/scriptoriumImage";
import { SpacerVertical } from "@/lib/tiptap/SpacerVertical";
import { SpacerHorizontal } from "@/lib/tiptap/SpacerHorizontal";
import { Watercolor } from "@/lib/tiptap/watercolor";
import { Watermark } from "@/lib/tiptap/watermark";
import { ArtistCredit } from "@/lib/tiptap/artistCredit";
import { ColumnBreak } from "@/lib/tiptap/columnBreak";
import { SkipCounting } from "@/lib/tiptap/skipCounting";
import { ResetCounting } from "@/lib/tiptap/resetCounting";
import { WideBlock } from "@/lib/tiptap/wideBlock";
import { NoteBlock } from "@/lib/tiptap/noteBlock";
import { DescriptiveBlock } from "@/lib/tiptap/descriptiveBlock";
import { QuoteBlock } from "@/lib/tiptap/quoteBlock";
import { Attribution } from "@/lib/tiptap/attribution";
import { TocBlock } from "@/lib/tiptap/tocBlock";
import { CoverPage } from "@/lib/tiptap/coverPage";

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
    Watercolor,
    Watermark,
    ArtistCredit,
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
  ];
}
