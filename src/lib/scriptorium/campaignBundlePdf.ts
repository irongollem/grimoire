/*
 * Campaign-data PDF embedding (Phase E, #329).
 *
 * A Scriptorium export can carry its referenced campaign entities as a
 * GrimoireBundle (the same world-bundle format used by manual import/export),
 * embedded as an invisible `grimoire-campaign.json` attachment inside the PDF.
 * Importing that PDF feeds the bundle straight into the existing world-bundle
 * import flow — one-click campaign population from a shared adventure module.
 *
 * Both attach (write) and extract (read) use pdf-lib so the round-trip is pure
 * and testable in node — no pdf.js worker needed.
 */

import {
  PDFDocument,
  PDFName,
  PDFDict,
  PDFArray,
  PDFRawStream,
  decodePDFRawStream,
} from "pdf-lib";
import type { GrimoireBundle } from "@/composables/useWorldBundle";

export const CAMPAIGN_ATTACHMENT_NAME = "grimoire-campaign.json";

/** A value is a usable bundle if it self-identifies as a world bundle. */
export function isGrimoireBundle(v: unknown): v is GrimoireBundle {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return o.file_type === "world_bundle" && typeof o.version === "string";
}

/**
 * Embed `bundle` as an invisible JSON attachment in the given PDF bytes,
 * returning the new PDF bytes. Invisible to readers, survives normal sharing.
 */
export async function attachBundleToPdf(
  pdfBytes: Uint8Array | ArrayBuffer,
  bundle: GrimoireBundle,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes);
  const json = new TextEncoder().encode(JSON.stringify(bundle));
  await doc.attach(json, CAMPAIGN_ATTACHMENT_NAME, {
    mimeType: "application/json",
    description: "Grimoire campaign data — import this PDF into Grimoire to populate your campaign.",
  });
  return doc.save();
}

/**
 * Extract an embedded GrimoireBundle from PDF bytes, or null if there's none.
 * Scans every embedded file and returns the first that parses as a world
 * bundle, so it's robust to the exact attachment name / other attachments.
 */
export async function extractBundleFromPdf(
  pdfBytes: Uint8Array | ArrayBuffer,
): Promise<GrimoireBundle | null> {
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  } catch {
    return null;
  }

  // lookupMaybe returns undefined (rather than throwing) for missing/wrong-type
  // keys, so a PDF without attachments just yields null.
  const names = doc.catalog.lookupMaybe(PDFName.of("Names"), PDFDict);
  const embeddedFiles = names?.lookupMaybe(PDFName.of("EmbeddedFiles"), PDFDict);
  const entries = embeddedFiles?.lookupMaybe(PDFName.of("Names"), PDFArray);
  if (!entries) return null;

  // entries alternate [name, fileSpec, name, fileSpec, …]; we only need the specs.
  for (let i = 1; i < entries.size(); i += 2) {
    const fileSpec = entries.lookupMaybe(i, PDFDict);
    const ef = fileSpec?.lookupMaybe(PDFName.of("EF"), PDFDict);
    // lookupMaybe has no PDFRawStream overload — resolve then narrow.
    const stream = ef?.lookup(PDFName.of("F"));
    if (!(stream instanceof PDFRawStream)) continue;
    let text: string;
    try {
      text = new TextDecoder().decode(decodePDFRawStream(stream).decode());
    } catch {
      continue;
    }
    try {
      const parsed = JSON.parse(text);
      if (isGrimoireBundle(parsed)) return parsed;
    } catch {
      /* not our JSON — keep scanning */
    }
  }
  return null;
}
