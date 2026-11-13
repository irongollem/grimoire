import { ImportError } from "./types";

/** A big-endian cursor that refuses to read past its end, so a lying length cannot walk off the file. */
export class Reader {
  pos: number;
  readonly end: number;
  private readonly view: DataView;

  constructor(
    readonly bytes: Uint8Array,
    start = 0,
    end = bytes.length,
  ) {
    this.pos = start;
    this.end = Math.min(end, bytes.length);
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  get remaining(): number {
    return this.end - this.pos;
  }

  private need(n: number): void {
    if (!Number.isInteger(n) || n < 0 || this.pos + n > this.end) {
      throw new ImportError("The file ends before its data does.");
    }
  }

  u8(): number {
    this.need(1);
    return this.view.getUint8(this.pos++);
  }

  u16(): number {
    this.need(2);
    const v = this.view.getUint16(this.pos);
    this.pos += 2;
    return v;
  }

  u32(): number {
    this.need(4);
    const v = this.view.getUint32(this.pos);
    this.pos += 4;
    return v;
  }

  i32(): number {
    this.need(4);
    const v = this.view.getInt32(this.pos);
    this.pos += 4;
    return v;
  }

  f64(): number {
    this.need(8);
    const v = this.view.getFloat64(this.pos);
    this.pos += 8;
    return v;
  }

  take(n: number): Uint8Array {
    this.need(n);
    const out = this.bytes.subarray(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }

  skip(n: number): void {
    this.need(n);
    this.pos += n;
  }

  /** A reader over the next `n` bytes; this one moves past them. */
  slice(n: number): Reader {
    this.need(n);
    const sub = new Reader(this.bytes, this.pos, this.pos + n);
    this.pos += n;
    return sub;
  }

  ascii(n: number): string {
    return String.fromCharCode(...this.take(n));
  }

  /** One length byte, then that many characters. */
  pascal(): string {
    return this.ascii(this.u8());
  }

  /** A count of UTF-16 characters (u32), then the characters, nulls dropped. */
  unicode(maxChars = 4096): string {
    const count = this.u32();
    if (count > maxChars) throw new ImportError("A name in the file is far too long.");
    let out = "";
    for (let i = 0; i < count; i++) {
      const code = this.u16();
      if (code !== 0) out += String.fromCharCode(code);
    }
    return out;
  }
}
