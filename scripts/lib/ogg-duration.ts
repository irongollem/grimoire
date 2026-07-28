/**
 * Reading a duration out of an Ogg Vorbis file without shelling out.
 *
 * The obvious implementation is `ffprobe`, and the obvious problem with it is
 * that ingestion then silently depends on a binary nobody installed. Ogg
 * carries everything needed in its own container, so this reads it directly:
 * the sample rate from the Vorbis identification header at the start, and the
 * final sample position from the last page's granule position at the end.
 *
 * Ogg page header layout (little-endian throughout):
 *   0..3   "OggS" capture pattern
 *   4      stream structure version
 *   5      header type flags
 *   6..13  granule position (int64) — for Vorbis, samples decoded so far
 *   14..17 bitstream serial number
 *   18..21 page sequence number
 *   22..25 CRC
 *   26     number of segments
 *   27..   segment table, then packet data
 */

const CAPTURE_PATTERN = [0x4f, 0x67, 0x67, 0x53]; // "OggS"
/** A page that completes no packet carries -1 here and must be skipped. */
const NO_GRANULE = 0xffffffffffffffffn;

function matchesCaptureAt(bytes: Uint8Array, offset: number): boolean {
  return CAPTURE_PATTERN.every((byte, i) => bytes[offset + i] === byte);
}

function readUint32LE(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)
  ) >>> 0;
}

function readUint64LE(bytes: Uint8Array, offset: number): bigint {
  let value = 0n;
  for (let i = 7; i >= 0; i--) value = (value << 8n) | BigInt(bytes[offset + i]);
  return value;
}

/**
 * Sample rate from the Vorbis identification header, which by spec is the
 * first packet of the first page.
 *
 * Returns null rather than a default when the file is not Vorbis — guessing
 * 44100 would turn "this is the wrong kind of file" into a plausible-looking
 * wrong duration, which is far harder to notice.
 */
export function vorbisSampleRate(bytes: Uint8Array): number | null {
  if (bytes.length < 4 || !matchesCaptureAt(bytes, 0)) return null;

  const segmentCount = bytes[26];
  const packetStart = 27 + segmentCount;
  if (packetStart + 16 > bytes.length) return null;

  // Identification packet: 0x01 followed by "vorbis"
  const isVorbisIdent =
    bytes[packetStart] === 0x01 &&
    String.fromCharCode(...bytes.subarray(packetStart + 1, packetStart + 7)) === "vorbis";
  if (!isVorbisIdent) return null;

  const rate = readUint32LE(bytes, packetStart + 12);
  return rate > 0 ? rate : null;
}

/**
 * Final granule position — the total decoded sample count.
 *
 * Scans backwards because the last page is where the running total ends up,
 * and skips pages carrying -1 (they complete no packet, so they report no
 * position). Returns null when no page carries a usable value.
 */
export function finalGranulePosition(bytes: Uint8Array): bigint | null {
  for (let offset = bytes.length - 4; offset >= 0; offset--) {
    if (!matchesCaptureAt(bytes, offset)) continue;
    if (offset + 14 > bytes.length) continue;
    const granule = readUint64LE(bytes, offset + 6);
    if (granule !== NO_GRANULE) return granule;
  }
  return null;
}

/**
 * Duration in seconds, or null when the file cannot be read as Ogg Vorbis.
 *
 * Null is a real answer the caller must handle — an unreadable file should be
 * reported and skipped, not ingested with a fabricated length that would then
 * decide which mixer bus it lands on.
 */
export function oggDurationSeconds(bytes: Uint8Array): number | null {
  const rate = vorbisSampleRate(bytes);
  if (rate === null) return null;

  const granule = finalGranulePosition(bytes);
  if (granule === null) return null;

  return Number(granule) / rate;
}
