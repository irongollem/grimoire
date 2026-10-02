/**
 * XMP packet builder for AiProvenance. Pure string templating — no XML
 * library, so callers in both Deno edge functions and the browser get the
 * exact same packet bytes once TextEncoder'd by embed.ts.
 */
import type { AiProvenance } from "./types.ts";

const XPACKET_ID = "W5M0MpCehiHzreSzNTczkc9d";
const XMP_NS = "http://ns.adobe.com/xap/1.0/";
const IPTC_EXT_NS = "http://iptc.org/std/Iptc4xmpExt/2008-02-29/";
const GRIMOIRE_NS = "https://dungeongrimoire.com/ns/provenance/1.0/";

/** IPTC's controlled-vocabulary code for "produced by a trained algorithmic model" — the standard machine-readable "AI-generated" mark recognised by Adobe/C2PA-aware tooling, chosen over inventing our own value so third-party viewers already understand it. */
const DIGITAL_SOURCE_TYPE_TRAINED_ALGORITHMIC_MEDIA =
  "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Builds a standalone XMP packet marking `prov`. IPTC `DigitalSourceType`
 * carries the standard AI-generated signal; the custom `grimoire:`
 * namespace carries provider/model/generatedAt/edited, the fields no
 * standard namespace covers, so a human or another tool can attribute the
 * mark back to a specific Grimoire generation. Every AiProvenance field
 * that ends up in the packet is XML-escaped — generator/provider/model
 * strings are provider-controlled, not user free text, but the packet must
 * stay well-formed either way.
 */
export function buildXmpPacket(prov: AiProvenance): string {
  const creatorTool = escapeXml(`Grimoire AI (${prov.generatorType})`);
  const provider = escapeXml(prov.provider);
  const model = escapeXml(prov.model);
  const generatedAt = escapeXml(prov.generatedAt);
  const edited = prov.edited ? "true" : "false";

  return (
    `<?xpacket begin="﻿" id="${XPACKET_ID}"?>\n` +
    `<x:xmpmeta xmlns:x="adobe:ns:meta/">\n` +
    `  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n` +
    `    <rdf:Description rdf:about=""\n` +
    `      xmlns:xmp="${XMP_NS}"\n` +
    `      xmlns:Iptc4xmpExt="${IPTC_EXT_NS}"\n` +
    `      xmlns:grimoire="${GRIMOIRE_NS}"\n` +
    `      xmp:CreatorTool="${creatorTool}"\n` +
    `      Iptc4xmpExt:DigitalSourceType="${DIGITAL_SOURCE_TYPE_TRAINED_ALGORITHMIC_MEDIA}"\n` +
    `      grimoire:provider="${provider}"\n` +
    `      grimoire:model="${model}"\n` +
    `      grimoire:generatedAt="${generatedAt}"\n` +
    `      grimoire:edited="${edited}"/>\n` +
    `  </rdf:RDF>\n` +
    `</x:xmpmeta>\n` +
    `<?xpacket end="w"?>`
  );
}

function unescapeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Value of `name="..."` inside the packet, unescaped, or null when absent. */
function attributeOf(packet: string, name: string): string | null {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(?:^|\\s)${escapedName}="([^"]*)"`).exec(packet);
  return match ? unescapeXml(match[1]) : null;
}

const CREATOR_TOOL_PATTERN = /^Grimoire AI \(([\s\S]*)\)$/;

/**
 * Inverse of `buildXmpPacket`. Returns the provenance only when the packet
 * carries the IPTC trainedAlgorithmicMedia source type AND every `grimoire:`
 * field, so a camera's XMP or any other tool's packet reads as "not ours"
 * (null) rather than as a half-filled record. Never throws.
 */
export function parseXmpPacket(packet: string): AiProvenance | null {
  try {
    if (typeof packet !== "string") return null;
    if (attributeOf(packet, "Iptc4xmpExt:DigitalSourceType") !== DIGITAL_SOURCE_TYPE_TRAINED_ALGORITHMIC_MEDIA) {
      return null;
    }
    const creatorTool = attributeOf(packet, "xmp:CreatorTool");
    const provider = attributeOf(packet, "grimoire:provider");
    const model = attributeOf(packet, "grimoire:model");
    const generatedAt = attributeOf(packet, "grimoire:generatedAt");
    const edited = attributeOf(packet, "grimoire:edited");
    if (creatorTool === null || provider === null || model === null || generatedAt === null || edited === null) {
      return null;
    }
    const generator = CREATOR_TOOL_PATTERN.exec(creatorTool);
    if (!generator) return null;
    if (edited !== "true" && edited !== "false") return null;
    return { generatorType: generator[1], provider, model, generatedAt, edited: edited === "true" };
  } catch {
    return null;
  }
}
