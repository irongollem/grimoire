/**
 * GLB composition via @gltf-transform/core (SIMULACRUM_PLAN.md §2 BASELESS
 * decision, #542): builds a base GLB from a plain color + triangle soup
 * (ingest-mini-bases.ts), and merges a sculpted figure GLB onto a base GLB
 * for the VTT/preview model.
 *
 * Deliberately depends on @gltf-transform/core (+ @gltf-transform/extensions,
 * for KHR extension I/O — see the WebIO.registerExtensions calls below)
 * ALONE — `mergeDocuments` / `copyToDocument` from `@gltf-transform/functions`
 * would shrink the copy routine below, but pulling in a second package for
 * ~50 lines of accessor/material/texture copying isn't worth it. `copyNode`
 * below is our own minimal, recursive "copy utility" built on core's
 * Document API.
 *
 * Working unit: millimetres, same Y-up space as mesh-compose.ts/stl.ts —
 * model-viewer auto-frames, so absolute units don't matter for display.
 */
import { Accessor, Document, WebIO } from "@gltf-transform/core";
import type { Buffer, Material, Mesh, Node, Texture } from "@gltf-transform/core";
import { ALL_EXTENSIONS, KHRMaterialsEmissiveStrength } from "@gltf-transform/extensions";
import type { EmissiveStrength } from "@gltf-transform/extensions";
import { computeFaceNormal } from "./stl.ts";
import { figureScaleFor } from "./mesh-compose.ts";

// ── color helper ─────────────────────────────────────────────────────────────

function hexToRgba(hex: string): [number, number, number, number] {
  const clean = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) throw new Error(`Invalid hex color: ${hex}`);
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return [r, g, b, 1];
}

// ── stlToGlb ──────────────────────────────────────────────────────────────────

/** Per-vertex flat normals for an unindexed triangle soup (3 verts/triangle, same winding convention as stl.ts writeBinaryStl). */
function flatNormalsForTriangleSoup(positions: Float32Array): Float32Array<ArrayBuffer> {
  if (positions.length === 0 || positions.length % 9 !== 0) {
    throw new Error(`Invalid position data: length ${positions.length} is not a positive multiple of 9`);
  }
  const normals = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 9) {
    const [nx, ny, nz] = computeFaceNormal(
      positions[i], positions[i + 1], positions[i + 2],
      positions[i + 3], positions[i + 4], positions[i + 5],
      positions[i + 6], positions[i + 7], positions[i + 8],
    );
    for (let v = 0; v < 3; v++) {
      normals[i + v * 3] = nx;
      normals[i + v * 3 + 1] = ny;
      normals[i + v * 3 + 2] = nz;
    }
  }
  return normals;
}

/**
 * Builds a single-mesh, single-material GLB from a triangle soup (9
 * floats/triangle, same layout as stl.ts) + a flat PBR color. Used by
 * scripts/ingest-mini-bases.ts to derive each base's GLB from its STL.
 */
export async function stlToGlb(tris: Float32Array, colorHex: string): Promise<Uint8Array> {
  if (tris.length === 0 || tris.length % 9 !== 0) {
    throw new Error(`Invalid triangle data: length ${tris.length} is not a positive multiple of 9`);
  }

  const doc = new Document();
  const buffer = doc.createBuffer();
  const normals = flatNormalsForTriangleSoup(tris);

  const positionAccessor = doc.createAccessor("POSITION")
    .setType(Accessor.Type.VEC3)
    .setArray(new Float32Array(tris))
    .setBuffer(buffer);
  const normalAccessor = doc.createAccessor("NORMAL")
    .setType(Accessor.Type.VEC3)
    .setArray(normals)
    .setBuffer(buffer);

  const material = doc.createMaterial("miniBase")
    .setBaseColorFactor(hexToRgba(colorHex))
    .setRoughnessFactor(0.9)
    .setMetallicFactor(0);

  const primitive = doc.createPrimitive()
    .setAttribute("POSITION", positionAccessor)
    .setAttribute("NORMAL", normalAccessor)
    .setMaterial(material);

  const mesh = doc.createMesh("mesh").addPrimitive(primitive);
  const node = doc.createNode("node").setMesh(mesh);
  const scene = doc.createScene("scene").addChild(node);
  doc.getRoot().setDefaultScene(scene);

  return new WebIO().registerExtensions(ALL_EXTENSIONS).writeBinary(doc);
}

// ── composeGlb ──────────────────────────────────────────────────────────────

interface Bounds3 {
  min: [number, number, number];
  max: [number, number, number];
}

/** Bounding box across every POSITION accessor in the document's meshes (ignores node transforms — matches stl.ts's local-space bounds convention). */
function positionBounds(doc: Document): Bounds3 {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const position = primitive.getAttribute("POSITION");
      const array = position?.getArray();
      if (!array) continue;
      for (let i = 0; i < array.length; i += 3) {
        for (let axis = 0; axis < 3; axis++) {
          const value = array[i + axis];
          if (value < min[axis]) min[axis] = value;
          if (value > max[axis]) max[axis] = value;
        }
      }
    }
  }
  if (!Number.isFinite(min[0])) throw new Error("Document has no POSITION data to bound");
  return { min, max };
}

function copyAccessor(target: Document, buffer: Buffer, source: Accessor): Accessor {
  const array = source.getArray();
  if (!array) throw new Error("Source accessor has no data array");
  return target.createAccessor(source.getName())
    .setType(source.getType())
    .setArray(array.slice())
    .setBuffer(buffer);
}

function copyTexture(target: Document, textureMap: Map<Texture, Texture>, source: Texture): Texture {
  const cached = textureMap.get(source);
  if (cached) return cached;
  const texture = target.createTexture(source.getName());
  const image = source.getImage();
  if (image) texture.setImage(image.slice());
  const mimeType = source.getMimeType();
  if (mimeType) texture.setMimeType(mimeType);
  textureMap.set(source, texture);
  return texture;
}

/**
 * Copies the KHR_materials_emissive_strength extension (HDR emissive
 * intensity beyond the plain [0,1] emissiveFactor range — how a
 * Blender-baked glowing-lava base material stays glowing) from source to
 * target material, if present. Registering ALL_EXTENSIONS on a WebIO only
 * teaches read/write how to (de)serialize the JSON — the ExtensionProperty
 * itself still has to be explicitly re-created on the target Document, same
 * as every other property this file copies by hand.
 */
function copyEmissiveStrength(target: Document, targetMaterial: Material, source: Material): void {
  const sourceStrength = source.getExtension<EmissiveStrength>("KHR_materials_emissive_strength");
  if (!sourceStrength) return;
  const extension = target.createExtension(KHRMaterialsEmissiveStrength);
  const strength = extension.createEmissiveStrength().setEmissiveStrength(sourceStrength.getEmissiveStrength());
  targetMaterial.setExtension("KHR_materials_emissive_strength", strength);
}

function copyMaterial(target: Document, textureMap: Map<Texture, Texture>, source: Material): Material {
  const material = target.createMaterial(source.getName())
    .setBaseColorFactor(source.getBaseColorFactor())
    .setRoughnessFactor(source.getRoughnessFactor())
    .setMetallicFactor(source.getMetallicFactor())
    .setEmissiveFactor(source.getEmissiveFactor());

  const baseColorTexture = source.getBaseColorTexture();
  if (baseColorTexture) material.setBaseColorTexture(copyTexture(target, textureMap, baseColorTexture));

  copyEmissiveStrength(target, material, source);

  return material;
}

function copyMesh(
  target: Document,
  buffer: Buffer,
  textureMap: Map<Texture, Texture>,
  materialMap: Map<Material, Material>,
  source: Mesh,
): Mesh {
  const mesh = target.createMesh(source.getName());
  for (const sourcePrimitive of source.listPrimitives()) {
    const primitive = target.createPrimitive().setMode(sourcePrimitive.getMode());

    const semantics = sourcePrimitive.listSemantics();
    const attributes = sourcePrimitive.listAttributes();
    semantics.forEach((semantic, i) => {
      primitive.setAttribute(semantic, copyAccessor(target, buffer, attributes[i]));
    });

    const indices = sourcePrimitive.getIndices();
    if (indices) primitive.setIndices(copyAccessor(target, buffer, indices));

    const sourceMaterial = sourcePrimitive.getMaterial();
    if (sourceMaterial) {
      let material = materialMap.get(sourceMaterial);
      if (!material) {
        material = copyMaterial(target, textureMap, sourceMaterial);
        materialMap.set(sourceMaterial, material);
      }
      primitive.setMaterial(material);
    }

    mesh.addPrimitive(primitive);
  }
  return mesh;
}

/** Recursively rebuilds a node (and its mesh/material/texture dependencies, and its children) inside `target`. */
function copyNode(
  target: Document,
  buffer: Buffer,
  textureMap: Map<Texture, Texture>,
  materialMap: Map<Material, Material>,
  meshMap: Map<Mesh, Mesh>,
  source: Node,
): Node {
  const node = target.createNode(source.getName())
    .setTranslation(source.getTranslation())
    .setRotation(source.getRotation())
    .setScale(source.getScale());

  const sourceMesh = source.getMesh();
  if (sourceMesh) {
    let mesh = meshMap.get(sourceMesh);
    if (!mesh) {
      mesh = copyMesh(target, buffer, textureMap, materialMap, sourceMesh);
      meshMap.set(sourceMesh, mesh);
    }
    node.setMesh(mesh);
  }

  for (const child of source.listChildren()) {
    node.addChild(copyNode(target, buffer, textureMap, materialMap, meshMap, child));
  }

  return node;
}

function sceneRoots(doc: Document): Node[] {
  const scenes = doc.getRoot().listScenes();
  return scenes.length ? scenes[0].listChildren() : doc.getRoot().listNodes();
}

/**
 * Bases are ALWAYS a 25mm footprint (mini-bases.ts) — that's a hard
 * invariant we can measure a base GLB against to tell its unit convention
 * apart, since plinth can hand us either of two Blender exports for the same
 * physical base: the native STL path (millimetres, matches stl.ts) or the
 * glTF path (metres, per glTF's own base-unit convention). A base whose
 * x-span (the footprint axis — Y is height, and varies per base, so it isn't
 * a reliable normalization signal) comes out under 1 unit is unambiguously
 * the metres export (~0.025) and needs ×1000 to land at 25; anything else
 * (~25) is already mm and gets factor 1.
 */
const BASE_UNIT_SCALE_THRESHOLD = 1;
const METERS_TO_MM = 1000;

function baseUnitScaleFactor(baseBounds: Bounds3): number {
  const spanX = baseBounds.max[0] - baseBounds.min[0];
  return spanX < BASE_UNIT_SCALE_THRESHOLD ? METERS_TO_MM : 1;
}

/**
 * Merges a figure GLB onto a base GLB into one combined GLB: the base's
 * nodes are copied under a wrapper node carrying the 25mm-footprint
 * normalization scale (see `baseUnitScaleFactor`), and the figure's nodes
 * are wrapped in a parent node carrying `figureHeightScale` + a translation
 * that centers the figure on x/z and seats its scaled minY exactly on the
 * NORMALIZED (mm) base top surface. Mirrors composeStl's seating math
 * exactly — `figureHeightScale` is expected to be the SAME number
 * `figureScaleFor` produced for the sibling STL composition, so the GLB
 * preview and the printable STL agree on scale.
 *
 * Base height is read from the base document's own POSITION bounds rather
 * than taken as a param — keeps this function self-contained for any base
 * without the caller needing to know its geometry (the "pick the cleaner"
 * option from the brief).
 */
export async function composeGlb(
  figureGlb: Uint8Array,
  baseGlb: Uint8Array,
  scaleMm: 28 | 32,
  figureHeightScale: number,
): Promise<Uint8Array> {
  const io = new WebIO().registerExtensions(ALL_EXTENSIONS);
  const [figureDoc, baseDoc] = await Promise.all([io.readBinary(figureGlb), io.readBinary(baseGlb)]);

  const target = new Document();
  const buffer = target.createBuffer();
  const scene = target.createScene("scene");
  target.getRoot().setDefaultScene(scene);

  const textureMap = new Map<Texture, Texture>();
  const materialMap = new Map<Material, Material>();
  const meshMap = new Map<Mesh, Mesh>();

  const baseBounds = positionBounds(baseDoc);
  const baseUnitScale = baseUnitScaleFactor(baseBounds);

  const baseWrapper = target.createNode("base").setScale([baseUnitScale, baseUnitScale, baseUnitScale]);
  scene.addChild(baseWrapper);
  for (const node of sceneRoots(baseDoc)) {
    baseWrapper.addChild(copyNode(target, buffer, textureMap, materialMap, meshMap, node));
  }

  const normalizedBaseMaxY = baseBounds.max[1] * baseUnitScale;
  const figureBounds = positionBounds(figureDoc);
  const centerX = ((figureBounds.min[0] + figureBounds.max[0]) / 2) * figureHeightScale;
  const centerZ = ((figureBounds.min[2] + figureBounds.max[2]) / 2) * figureHeightScale;
  const translateY = normalizedBaseMaxY - figureBounds.min[1] * figureHeightScale;

  const figureWrapper = target.createNode(`figure-${scaleMm}mm`)
    .setScale([figureHeightScale, figureHeightScale, figureHeightScale])
    .setTranslation([-centerX, translateY, -centerZ]);
  scene.addChild(figureWrapper);

  for (const node of sceneRoots(figureDoc)) {
    figureWrapper.addChild(copyNode(target, buffer, textureMap, materialMap, meshMap, node));
  }

  return io.writeBinary(target);
}

/**
 * `figureScaleFor` (mesh-compose.ts) works on STL bounds, but VTT sculpts
 * never fetch an STL from Meshy (meshyParamsForFormat's target_formats is
 * glb+usdz only) — this reads the same bounds straight from the figure GLB's
 * own POSITION accessors, so poll-meshy-jobs/forge-mini can compute a
 * `figureHeightScale` for composeGlb without requiring a sibling STL to
 * exist. For print sculpts (which DO have a figure STL), callers should
 * prefer deriving the scale from the STL once and reuse it for both
 * composeStl and composeGlb — see SIMULACRUM_PLAN.md #542 pipeline notes.
 */
export async function figureScaleForGlb(figureGlb: Uint8Array, scaleMm: 28 | 32): Promise<number> {
  const doc = await new WebIO().registerExtensions(ALL_EXTENSIONS).readBinary(figureGlb);
  return figureScaleFor(positionBounds(doc), scaleMm);
}
