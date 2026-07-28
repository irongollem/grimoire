import { describe, it, expect } from "vitest";
import { oggDurationSeconds, vorbisSampleRate, finalGranulePosition } from "./ogg-duration";

/**
 * Builds one Ogg page. Only the fields this parser reads are meaningful; the
 * CRC and sequence numbers are left zero because nothing here verifies them.
 */
function page(granule: bigint, payload: Uint8Array): Uint8Array {
  const header = new Uint8Array(27 + 1);
  header.set([0x4f, 0x67, 0x67, 0x53], 0); // "OggS"
  for (let i = 0; i < 8; i++) {
    header[6 + i] = Number((granule >> BigInt(8 * i)) & 0xffn);
  }
  header[26] = 1; // one segment
  header[27] = payload.length;
  const out = new Uint8Array(header.length + payload.length);
  out.set(header, 0);
  out.set(payload, header.length);
  return out;
}

/** A Vorbis identification packet declaring the given sample rate. */
function identPacket(sampleRate: number): Uint8Array {
  const packet = new Uint8Array(30);
  packet[0] = 0x01;
  packet.set([..."vorbis"].map((c) => c.charCodeAt(0)), 1);
  packet[11] = 2; // channels
  packet[12] = sampleRate & 0xff;
  packet[13] = (sampleRate >> 8) & 0xff;
  packet[14] = (sampleRate >> 16) & 0xff;
  packet[15] = (sampleRate >> 24) & 0xff;
  return packet;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

describe("vorbisSampleRate", () => {
  it("reads the rate from the identification header", () => {
    expect(vorbisSampleRate(page(0n, identPacket(44100)))).toBe(44100);
    expect(vorbisSampleRate(page(0n, identPacket(48000)))).toBe(48000);
  });

  it("is null when the capture pattern is missing", () => {
    expect(vorbisSampleRate(new Uint8Array([1, 2, 3, 4, 5]))).toBeNull();
  });

  it("is null for an Ogg stream that is not Vorbis", () => {
    // An Opus page, say. Guessing 44100 here would produce a wrong duration
    // that looks entirely plausible.
    const notVorbis = new Uint8Array(30);
    notVorbis.set([..."OpusHead"].map((c) => c.charCodeAt(0)), 0);
    expect(vorbisSampleRate(page(0n, notVorbis))).toBeNull();
  });
});

describe("finalGranulePosition", () => {
  it("takes the last page's position, not the first", () => {
    const file = concat(page(0n, identPacket(44100)), page(441000n, new Uint8Array([9])));
    expect(finalGranulePosition(file)).toBe(441000n);
  });

  it("skips trailing pages that complete no packet", () => {
    // -1 means "no packet finished on this page" and is not a position.
    const file = concat(
      page(0n, identPacket(44100)),
      page(88200n, new Uint8Array([9])),
      page(0xffffffffffffffffn, new Uint8Array([9])),
    );
    expect(finalGranulePosition(file)).toBe(88200n);
  });

  it("is null when there is no page at all", () => {
    expect(finalGranulePosition(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});

describe("oggDurationSeconds", () => {
  it("divides the final sample position by the rate", () => {
    const file = concat(page(0n, identPacket(44100)), page(441000n, new Uint8Array([9])));
    expect(oggDurationSeconds(file)).toBeCloseTo(10, 6);
  });

  it("handles a non-integer length", () => {
    const file = concat(page(0n, identPacket(48000)), page(72000n, new Uint8Array([9])));
    expect(oggDurationSeconds(file)).toBeCloseTo(1.5, 6);
  });

  it("is null rather than zero for an unreadable file", () => {
    // The caller must skip these; a zero would silently classify the file as a
    // one-shot effect.
    expect(oggDurationSeconds(new Uint8Array([0, 1, 2, 3]))).toBeNull();
  });
});
