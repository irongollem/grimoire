/**
 * Pure binary-STL toolkit (SIMULACRUM_PLAN.md §2 BASELESS decision, #542) —
 * parse/bound/transform/write binary STL triangle soups, plus a procedural
 * cylinder generator for the "plain" base placeholder. NO Deno/Supabase
 * imports on purpose — unit-tested with vitest (stl.test.ts) and imported
 * unmodified by the Deno edge functions (poll-meshy-jobs, forge-mini) and by
 * scripts/ingest-mini-bases.ts (via tsx).
 *
 * Binary STL layout: 80-byte header + uint32 (LE) triangle count, then per
 * triangle: 3×float32 normal + 3×(3×float32) vertices + uint16 attribute byte
 * count = 50 bytes/triangle. This module only ever round-trips VERTEX data —
 * normals are ignored on parse (recomputed from face winding on write) and
 * the attribute byte count is always written as 0.
 */

const STL_HEADER_BYTES = 80;
const STL_COUNT_BYTES = 4;
const STL_PREAMBLE_BYTES = STL_HEADER_BYTES + STL_COUNT_BYTES; // 84
const STL_TRIANGLE_RECORD_BYTES = 50; // 12 (normal) + 36 (3 verts) + 2 (attr count)

const STL_HEADER_TEXT = "Grimoire binary STL — Simulacrum mini-bases export";

export interface StlBounds {
  min: [number, number, number];
  max: [number, number, number];
}

function assertTriangleSoup(floats: ArrayLike<number>, label: string): void {
  if (floats.length === 0 || floats.length % 9 !== 0) {
    throw new Error(`Invalid triangle data (${label}): length ${floats.length} is not a positive multiple of 9`);
  }
}

/**
 * Parses a binary STL into a flat Float32Array of 9 floats/triangle (3
 * vertices × xyz), vertices only — per-triangle normals and the 2-byte
 * attribute field are discarded (writeBinaryStl recomputes normals from face
 * winding, so nothing downstream ever needs the source file's normals).
 */
export function parseBinaryStl(bytes: Uint8Array): Float32Array {
  if (bytes.byteLength < STL_PREAMBLE_BYTES) {
    throw new Error(`Invalid binary STL: file too small (${bytes.byteLength} bytes, need >= ${STL_PREAMBLE_BYTES})`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const triCount = view.getUint32(STL_HEADER_BYTES, true);
  const expectedBytes = STL_PREAMBLE_BYTES + triCount * STL_TRIANGLE_RECORD_BYTES;
  if (bytes.byteLength < expectedBytes) {
    throw new Error(
      `Invalid binary STL: declares ${triCount} triangles but file is too short (${bytes.byteLength} < ${expectedBytes} bytes)`,
    );
  }
  if (triCount === 0) {
    throw new Error("Invalid binary STL: zero triangles");
  }

  const tris = new Float32Array(triCount * 9);
  let offset = STL_PREAMBLE_BYTES;
  for (let t = 0; t < triCount; t++) {
    offset += 12; // skip the stored normal (3×float32) — recomputed on write
    for (let v = 0; v < 9; v++) {
      tris[t * 9 + v] = view.getFloat32(offset, true);
      offset += 4;
    }
    offset += 2; // skip attribute byte count
  }
  return tris;
}

/** Axis-aligned bounding box of a triangle soup (9 floats/triangle). */
export function stlBounds(tris: Float32Array): StlBounds {
  assertTriangleSoup(tris, "stlBounds");
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < tris.length; i += 3) {
    for (let axis = 0; axis < 3; axis++) {
      const value = tris[i + axis];
      if (value < min[axis]) min[axis] = value;
      if (value > max[axis]) max[axis] = value;
    }
  }
  return { min, max };
}

/** Uniform scale, then translate — applied to every vertex of the soup. */
export function transformStl(tris: Float32Array, scale: number, translate: [number, number, number]): Float32Array {
  assertTriangleSoup(tris, "transformStl");
  const out = new Float32Array(tris.length);
  for (let i = 0; i < tris.length; i += 3) {
    out[i] = tris[i] * scale + translate[0];
    out[i + 1] = tris[i + 1] * scale + translate[1];
    out[i + 2] = tris[i + 2] * scale + translate[2];
  }
  return out;
}

/**
 * Rotates a Z-up triangle soup into the Y-up space this module,
 * mesh-compose.ts, and glb-compose.ts otherwise assume. Blender's native
 * binary-STL exporter (the sister repo "plinth"'s STL output) is Z-up with
 * height along +Z and the origin at bottom-center — this is the mechanical
 * axis remap at ingest (scripts/ingest-mini-bases.ts) so a base STL never
 * needs special-casing downstream.
 *
 * Per-vertex mapping: (x, y, z) → (x, z, −y) — a 90° rotation about the X
 * axis. This is a PROPER rotation (its matrix has determinant +1), so
 * triangle winding is preserved exactly: writeBinaryStl's recomputed
 * face normals stay outward-facing without needing to reverse vertex order.
 */
export function rotateStlZUpToYUp(tris: Float32Array): Float32Array {
  assertTriangleSoup(tris, "rotateStlZUpToYUp");
  const out = new Float32Array(tris.length);
  for (let i = 0; i < tris.length; i += 3) {
    out[i] = tris[i];
    out[i + 1] = tris[i + 2];
    out[i + 2] = -tris[i + 1];
  }
  return out;
}

/**
 * Normalized face normal of the triangle (a, b, c) via (b−a)×(c−a) — shared
 * by writeBinaryStl (per-triangle STL normal) and glb-compose.ts
 * (per-vertex flat GLB normals), so the two exporters can never disagree on
 * winding convention.
 */
export function computeFaceNormal(
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
): [number, number, number] {
  const ux = bx - ax, uy = by - ay, uz = bz - az;
  const vx = cx - ax, vy = cy - ay, vz = cz - az;
  let nx = uy * vz - uz * vy;
  let ny = uz * vx - ux * vz;
  let nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz);
  if (len > 0) {
    nx /= len;
    ny /= len;
    nz /= len;
  }
  return [nx, ny, nz];
}

/**
 * Concatenates one or more triangle soups into a single binary STL,
 * recomputing every triangle's normal from its winding (never trusts a
 * caller-provided normal — composeStl's scaled/translated parts have no
 * normals of their own to preserve anyway).
 */
export function writeBinaryStl(parts: Float32Array[]): Uint8Array {
  if (parts.length === 0) throw new Error("writeBinaryStl: no parts given");
  let totalFloats = 0;
  for (const part of parts) {
    assertTriangleSoup(part, "writeBinaryStl part");
    totalFloats += part.length;
  }
  const triCount = totalFloats / 9;

  const bytes = new Uint8Array(STL_PREAMBLE_BYTES + triCount * STL_TRIANGLE_RECORD_BYTES);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < STL_HEADER_TEXT.length && i < STL_HEADER_BYTES; i++) {
    bytes[i] = STL_HEADER_TEXT.charCodeAt(i);
  }
  view.setUint32(STL_HEADER_BYTES, triCount, true);

  let offset = STL_PREAMBLE_BYTES;
  for (const part of parts) {
    for (let i = 0; i < part.length; i += 9) {
      const ax = part[i], ay = part[i + 1], az = part[i + 2];
      const bx = part[i + 3], by = part[i + 4], bz = part[i + 5];
      const cx = part[i + 6], cy = part[i + 7], cz = part[i + 8];
      const [nx, ny, nz] = computeFaceNormal(ax, ay, az, bx, by, bz, cx, cy, cz);

      view.setFloat32(offset, nx, true); offset += 4;
      view.setFloat32(offset, ny, true); offset += 4;
      view.setFloat32(offset, nz, true); offset += 4;
      view.setFloat32(offset, ax, true); offset += 4;
      view.setFloat32(offset, ay, true); offset += 4;
      view.setFloat32(offset, az, true); offset += 4;
      view.setFloat32(offset, bx, true); offset += 4;
      view.setFloat32(offset, by, true); offset += 4;
      view.setFloat32(offset, bz, true); offset += 4;
      view.setFloat32(offset, cx, true); offset += 4;
      view.setFloat32(offset, cy, true); offset += 4;
      view.setFloat32(offset, cz, true); offset += 4;
      offset += 2; // attribute byte count, always 0
    }
  }
  return bytes;
}

/**
 * Procedural placeholder base geometry — a closed cylinder, origin at
 * bottom-center, Y-up (height along +Y) to match Meshy's `origin_at:"bottom"`
 * convention (SIMULACRUM_PLAN.md §2) so composeStl never needs an axis remap
 * between figure and base. Used for the "plain" base until real plinth STLs
 * land in art-src/bases/ (scripts/ingest-mini-bases.ts).
 */
export function generateCylinderStl(radiusMm: number, heightMm: number, segments: number): Uint8Array {
  if (!(radiusMm > 0) || !(heightMm > 0) || !Number.isInteger(segments) || segments < 3) {
    throw new Error(`Invalid cylinder params: radius=${radiusMm}, height=${heightMm}, segments=${segments}`);
  }

  const step = (Math.PI * 2) / segments;
  const triCount = segments * 4; // 2 side triangles + 1 bottom-fan + 1 top-fan, per segment
  const tris = new Float32Array(triCount * 9);
  let o = 0;
  const push = (vals: number[]) => {
    for (const v of vals) tris[o++] = v;
  };

  for (let i = 0; i < segments; i++) {
    const a0 = i * step;
    const a1 = (i + 1) * step;
    const b0 = [radiusMm * Math.cos(a0), 0, radiusMm * Math.sin(a0)];
    const b1 = [radiusMm * Math.cos(a1), 0, radiusMm * Math.sin(a1)];
    const t0 = [radiusMm * Math.cos(a0), heightMm, radiusMm * Math.sin(a0)];
    const t1 = [radiusMm * Math.cos(a1), heightMm, radiusMm * Math.sin(a1)];

    // Side quad (outward-facing, verified by winding: (b0,t0,t1) and
    // (b0,t1,b1) both cross-product to the same radially-outward direction).
    push([...b0, ...t0, ...t1]);
    push([...b0, ...t1, ...b1]);
    // Bottom fan (downward normal — increasing angle order gives -Y).
    push([0, 0, 0, ...b0, ...b1]);
    // Top fan (upward normal — reversed angle order gives +Y).
    push([0, heightMm, 0, ...t1, ...t0]);
  }

  return writeBinaryStl([tris]);
}
