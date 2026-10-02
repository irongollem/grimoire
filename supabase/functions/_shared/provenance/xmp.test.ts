import { describe, it, expect } from "vitest";
import { buildXmpPacket, parseXmpPacket } from "./xmp";
import type { AiProvenance } from "./types";

const PROV: AiProvenance = {
  generatorType: "npc",
  provider: "openai",
  model: "gpt-image-1",
  generatedAt: "2026-08-04T12:00:00.000Z",
  edited: false,
};

describe("buildXmpPacket", () => {
  it("wraps the packet in a well-formed xpacket begin/end pair", () => {
    const packet = buildXmpPacket(PROV);
    expect(packet.startsWith('<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>')).toBe(true);
    expect(packet.trimEnd().endsWith('<?xpacket end="w"?>')).toBe(true);
  });

  it("declares the IPTC trainedAlgorithmicMedia digital source type", () => {
    const packet = buildXmpPacket(PROV);
    expect(packet).toContain('xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/"');
    expect(packet).toContain(
      'Iptc4xmpExt:DigitalSourceType="http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia"',
    );
  });

  it("sets xmp:CreatorTool to 'Grimoire AI (<generatorType>)'", () => {
    const packet = buildXmpPacket(PROV);
    expect(packet).toContain('xmp:CreatorTool="Grimoire AI (npc)"');
  });

  it("carries provider/model/generatedAt/edited in the grimoire namespace", () => {
    const packet = buildXmpPacket(PROV);
    expect(packet).toContain('xmlns:grimoire="https://dungeongrimoire.com/ns/provenance/1.0/"');
    expect(packet).toContain('grimoire:provider="openai"');
    expect(packet).toContain('grimoire:model="gpt-image-1"');
    expect(packet).toContain('grimoire:generatedAt="2026-08-04T12:00:00.000Z"');
    expect(packet).toContain('grimoire:edited="false"');
  });

  it("reflects edited: true", () => {
    const packet = buildXmpPacket({ ...PROV, edited: true });
    expect(packet).toContain('grimoire:edited="true"');
  });

  it("XML-escapes special characters in every interpolated field", () => {
    const packet = buildXmpPacket({
      generatorType: `npc" onmouseover="alert(1)`,
      provider: "A & B <provider>",
      model: `model'"<>&`,
      generatedAt: `2026-08-04T12:00:00Z" foo="bar`,
      edited: false,
    });

    // A raw `"` from any field must never terminate its enclosing attribute early.
    expect(packet).toContain(
      'xmp:CreatorTool="Grimoire AI (npc&quot; onmouseover=&quot;alert(1))"',
    );
    expect(packet).toContain('grimoire:provider="A &amp; B &lt;provider&gt;"');
    expect(packet).toContain('grimoire:model="model&apos;&quot;&lt;&gt;&amp;"');
    expect(packet).toContain('grimoire:generatedAt="2026-08-04T12:00:00Z&quot; foo=&quot;bar"');

    // The packet must still be attribute-boundary-safe: every attribute we injected
    // untrusted text into is immediately followed by `\n` (the next line), never by
    // stray text that would only appear if a `"` had broken out of the attribute.
    for (const line of packet.split("\n")) {
      const opens = (line.match(/"/g) ?? []).length;
      expect(opens % 2).toBe(0);
    }
  });
});

describe("parseXmpPacket", () => {
  it("round-trips a built packet", () => {
    expect(parseXmpPacket(buildXmpPacket(PROV))).toEqual(PROV);
  });

  it("round-trips values holding every escaped character", () => {
    const nasty: AiProvenance = {
      generatorType: `npc "A" & <B> 'C'`,
      provider: `a&b`,
      model: `m<1>"x"'y'`,
      generatedAt: "2026-08-04T12:00:00.000Z",
      edited: true,
    };
    expect(parseXmpPacket(buildXmpPacket(nasty))).toEqual(nasty);
  });

  it("does not double-unescape an entity written literally", () => {
    const literal: AiProvenance = { ...PROV, model: "&lt;" };
    expect(parseXmpPacket(buildXmpPacket(literal))?.model).toBe("&lt;");
  });

  it("parses edited to a boolean", () => {
    expect(parseXmpPacket(buildXmpPacket({ ...PROV, edited: true }))?.edited).toBe(true);
    expect(parseXmpPacket(buildXmpPacket({ ...PROV, edited: false }))?.edited).toBe(false);
  });

  it("returns null without the IPTC AI source type", () => {
    const stripped = buildXmpPacket(PROV).replace(
      /Iptc4xmpExt:DigitalSourceType="[^"]*"/,
      'Iptc4xmpExt:DigitalSourceType="http://cv.iptc.org/newscodes/digitalsourcetype/digitalCapture"',
    );
    expect(parseXmpPacket(stripped)).toBeNull();
  });

  it("returns null when a grimoire field is missing", () => {
    expect(parseXmpPacket(buildXmpPacket(PROV).replace(/grimoire:model="[^"]*"/, ""))).toBeNull();
  });

  it("returns null for a foreign XMP packet", () => {
    const camera =
      '<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/">' +
      '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" ' +
      'xmlns:tiff="http://ns.adobe.com/tiff/1.0/" tiff:Make="Canon" tiff:Model="EOS R5"/></rdf:RDF></x:xmpmeta><?xpacket end="w"?>';
    expect(parseXmpPacket(camera)).toBeNull();
  });

  it("returns null for garbage and never throws", () => {
    expect(parseXmpPacket("")).toBeNull();
    expect(parseXmpPacket("not xml at all <<<")).toBeNull();
    expect(parseXmpPacket("\u0000￿")).toBeNull();
  });
});
