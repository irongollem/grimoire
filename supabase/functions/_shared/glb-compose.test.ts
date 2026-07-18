import { describe, it, expect } from "vitest";
import { Accessor, Document, WebIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS, KHRMaterialsEmissiveStrength } from "@gltf-transform/extensions";
import type { EmissiveStrength } from "@gltf-transform/extensions";
import { stlToGlb, composeGlb, figureScaleForGlb } from "./glb-compose";
import { generateCylinderStl, parseBinaryStl, stlBounds } from "./stl";
import { figureScaleFor } from "./mesh-compose";

// Reuses the exact minimal valid GLB fixture from mesh3d.ts's MESHY_MOCK
// fixtures (a single unindexed-by-POSITION, indexed-by-triangle mesh: POSITION
// accessor bounds [0,0,0]..[1,1,0], no material/normals) — good enough to
// exercise composeGlb's merge path against a "real" (if minimal) Meshy-style
// GLB rather than only our own stlToGlb output.
const MOCK_FIGURE_GLB_BASE64 =
  "Z2xURgIAAABMAgAABAIAAEpTT057ImFzc2V0Ijp7InZlcnNpb24iOiIyLjAifSwic2NlbmUiOjAsInNjZW5lcyI6W3sibm9kZXMiOlswXX1dLCJub2RlcyI6W3sibWVzaCI6MH1dLCJtZXNoZXMiOlt7InByaW1pdGl2ZXMiOlt7ImF0dHJpYnV0ZXMiOnsiUE9TSVRJT04iOjB9LCJpbmRpY2VzIjoxfV19XSwiYnVmZmVycyI6W3siYnl0ZUxlbmd0aCI6NDR9XSwiYnVmZmVyVmlld3MiOlt7ImJ1ZmZlciI6MCwiYnl0ZU9mZnNldCI6MCwiYnl0ZUxlbmd0aCI6MzYsInRhcmdldCI6MzQ5NjJ9LHsiYnVmZmVyIjowLCJieXRlT2Zmc2V0IjozNiwiYnl0ZUxlbmd0aCI6NiwidGFyZ2V0IjozNDk2M31dLCJhY2Nlc3NvcnMiOlt7ImJ1ZmZlclZpZXciOjAsImJ5dGVPZmZzZXQiOjAsImNvbXBvbmVudFR5cGUiOjUxMjYsImNvdW50IjozLCJ0eXBlIjoiVkVDMyIsIm1heCI6WzEsMSwwXSwibWluIjpbMCwwLDBdfSx7ImJ1ZmZlclZpZXciOjEsImJ5dGVPZmZzZXQiOjAsImNvbXBvbmVudFR5cGUiOjUxMjMsImNvdW50IjozLCJ0eXBlIjoiU0NBTEFSIn1dfSAsAAAAQklOAAAAAAAAAAAAAAAAAAAAgD8AAAAAAAAAAAAAAAAAAIA/AAAAAAAAAQACAAAA";

function mockFigureGlb(): Uint8Array {
  return new Uint8Array(Buffer.from(MOCK_FIGURE_GLB_BASE64, "base64"));
}

/**
 * A single-mesh GLB whose material carries KHR_materials_emissive_strength —
 * stands in for a plinth/Blender-baked "glowing lava" base export (round25-1-2)
 * so composeGlb's extension-preservation path has something real to exercise.
 */
async function buildGlbWithEmissiveMaterial(strength: number): Promise<Uint8Array> {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const tris = parseBinaryStl(generateCylinderStl(12.5, 3.5, 8));

  const positionAccessor = doc.createAccessor("POSITION")
    .setType(Accessor.Type.VEC3)
    .setArray(new Float32Array(tris))
    .setBuffer(buffer);

  const emissiveExtension = doc.createExtension(KHRMaterialsEmissiveStrength);
  const emissiveStrength = emissiveExtension.createEmissiveStrength().setEmissiveStrength(strength);

  const material = doc.createMaterial("lava")
    .setEmissiveFactor([1, 0.3, 0])
    .setExtension("KHR_materials_emissive_strength", emissiveStrength);

  const primitive = doc.createPrimitive().setAttribute("POSITION", positionAccessor).setMaterial(material);
  const mesh = doc.createMesh("mesh").addPrimitive(primitive);
  const node = doc.createNode("node").setMesh(mesh);
  const scene = doc.createScene("scene").addChild(node);
  doc.getRoot().setDefaultScene(scene);

  return new WebIO().registerExtensions(ALL_EXTENSIONS).writeBinary(doc);
}

describe("stlToGlb", () => {
  it("produces a parseable GLB with one mesh and the requested base color", async () => {
    const tris = parseBinaryStl(generateCylinderStl(5, 10, 8));
    const glb = await stlToGlb(tris, "#8a8a8a");

    const doc = await new WebIO().readBinary(glb);
    const meshes = doc.getRoot().listMeshes();
    expect(meshes.length).toBe(1);
    expect(meshes[0].listPrimitives().length).toBe(1);

    const materials = doc.getRoot().listMaterials();
    expect(materials.length).toBe(1);
    const [r, g, b, a] = materials[0].getBaseColorFactor();
    expect(r).toBeCloseTo(0x8a / 255, 2);
    expect(g).toBeCloseTo(0x8a / 255, 2);
    expect(b).toBeCloseTo(0x8a / 255, 2);
    expect(a).toBeCloseTo(1);
  });

  it("the mesh's POSITION accessor round-trips the same vertex count as the source triangle soup", async () => {
    const tris = parseBinaryStl(generateCylinderStl(12.5, 3.5, 6));
    const glb = await stlToGlb(tris, "#4c7a3d");
    const doc = await new WebIO().readBinary(glb);
    const position = doc.getRoot().listMeshes()[0].listPrimitives()[0].getAttribute("POSITION");
    expect(position?.getArray()?.length).toBe(tris.length);
  });

  it("rejects a colorHex that isn't a 6-digit hex code", async () => {
    const tris = parseBinaryStl(generateCylinderStl(5, 10, 6));
    await expect(stlToGlb(tris, "not-a-color")).rejects.toThrow();
  });

  it("throws on degenerate (non-multiple-of-9) triangle data", async () => {
    await expect(stlToGlb(new Float32Array(5), "#ffffff")).rejects.toThrow();
  });
});

describe("composeGlb", () => {
  it("merges a figure GLB onto a base GLB — both meshes present in the combined document", async () => {
    const baseTris = parseBinaryStl(generateCylinderStl(12.5, 3.5, 16));
    const baseGlb = await stlToGlb(baseTris, "#8a8a8a");
    const figureGlb = mockFigureGlb();

    const composed = await composeGlb(figureGlb, baseGlb, 28, 16);
    const doc = await new WebIO().readBinary(composed);

    // One mesh from the base, one from the (single-mesh) mock figure fixture.
    expect(doc.getRoot().listMeshes().length).toBe(2);
  });

  it("the combined scene has two top-level nodes: the base root and the figure wrapper", async () => {
    const baseTris = parseBinaryStl(generateCylinderStl(12.5, 3.5, 16));
    const baseGlb = await stlToGlb(baseTris, "#8a8a8a");
    const figureGlb = mockFigureGlb();

    const composed = await composeGlb(figureGlb, baseGlb, 32, 18.3);
    const doc = await new WebIO().readBinary(composed);
    const roots = doc.getRoot().listScenes()[0].listChildren();
    expect(roots.length).toBe(2);
  });

  it("the figure wrapper node carries the given scale factor", async () => {
    const baseTris = parseBinaryStl(generateCylinderStl(12.5, 3.5, 16));
    const baseGlb = await stlToGlb(baseTris, "#8a8a8a");
    const figureGlb = mockFigureGlb();

    const composed = await composeGlb(figureGlb, baseGlb, 28, 16);
    const doc = await new WebIO().readBinary(composed);
    const wrapper = doc.getRoot().listScenes()[0].listChildren().find((n) => n.getName().startsWith("figure-"));
    expect(wrapper).toBeDefined();
    expect(wrapper!.getScale()).toEqual([16, 16, 16]);
  });

  it("preserves the figure's own POSITION vertex count after copying", async () => {
    const baseTris = parseBinaryStl(generateCylinderStl(12.5, 3.5, 16));
    const baseGlb = await stlToGlb(baseTris, "#8a8a8a");
    const figureGlb = mockFigureGlb();

    const composed = await composeGlb(figureGlb, baseGlb, 28, 16);
    const doc = await new WebIO().readBinary(composed);
    const totalPrimitives = doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives());
    // Base (1 primitive) + figure (1 primitive, 3 POSITION verts from the fixture).
    const figurePrimitive = totalPrimitives.find((p) => p.getAttribute("POSITION")?.getCount() === 3);
    expect(figurePrimitive).toBeDefined();
  });
});

describe("figureScaleForGlb", () => {
  it("agrees with figureScaleFor computed from the equivalent STL bounds", async () => {
    // A cylinder's own STL bounds, fed through both paths, must produce the
    // same scale factor — the whole point of this helper is parity with the
    // sibling STL composition for print sculpts.
    const tris = parseBinaryStl(generateCylinderStl(12.5, 3.5, 16));
    const glb = await stlToGlb(tris, "#8a8a8a");

    const fromStl = figureScaleFor(stlBounds(tris), 28);
    const fromGlb = await figureScaleForGlb(glb, 28);
    expect(fromGlb).toBeCloseTo(fromStl, 5);
  });
});

describe("composeGlb base-unit normalization (25mm-footprint heuristic)", () => {
  it("leaves an already-mm base (x-span ~25) unscaled", async () => {
    const mmTris = parseBinaryStl(generateCylinderStl(12.5, 3.5, 16));
    const mmBaseGlb = await stlToGlb(mmTris, "#8a8a8a");

    const composed = await composeGlb(mockFigureGlb(), mmBaseGlb, 28, 16);
    const doc = await new WebIO().registerExtensions(ALL_EXTENSIONS).readBinary(composed);
    const baseWrapper = doc.getRoot().listScenes()[0].listChildren().find((n) => n.getName() === "base");
    expect(baseWrapper).toBeDefined();
    expect(baseWrapper!.getScale()).toEqual([1, 1, 1]);
  });

  it("scales a meters-scale base (plinth's glTF export, x-span ~0.025) ×1000 to occupy ~25 units, not 0.025", async () => {
    // Same physical shape as the mm cylinder above, but built at 1/1000th
    // scale — the numeric signature Blender's glTF exporter leaves behind
    // (spec base unit is metres) for the SAME geometry a native STL export
    // would report in millimetres.
    const metersTris = parseBinaryStl(generateCylinderStl(0.0125, 0.0035, 16));
    const metersBaseGlb = await stlToGlb(metersTris, "#8a8a8a");
    // Sanity-check the fixture itself really is ~0.025 wide, not 25.
    const rawSpanX = stlBounds(metersTris).max[0] - stlBounds(metersTris).min[0];
    expect(rawSpanX).toBeCloseTo(0.025, 5);

    const composed = await composeGlb(mockFigureGlb(), metersBaseGlb, 28, 16);
    const doc = await new WebIO().registerExtensions(ALL_EXTENSIONS).readBinary(composed);
    const baseWrapper = doc.getRoot().listScenes()[0].listChildren().find((n) => n.getName() === "base");
    expect(baseWrapper).toBeDefined();
    expect(baseWrapper!.getScale()).toEqual([1000, 1000, 1000]);

    // Effective (world-space) footprint = raw POSITION span × wrapper scale.
    const baseMesh = doc.getRoot().listMeshes().find((m) => m.getName() === "mesh")!;
    const positions = baseMesh.listPrimitives()[0].getAttribute("POSITION")!.getArray()!;
    let minX = Infinity, maxX = -Infinity;
    for (let i = 0; i < positions.length; i += 3) {
      if (positions[i] < minX) minX = positions[i];
      if (positions[i] > maxX) maxX = positions[i];
    }
    const worldSpanX = (maxX - minX) * baseWrapper!.getScale()[0];
    expect(worldSpanX).toBeCloseTo(25, 1);
  });

  it("seats the figure on top of the NORMALIZED base height, agreeing between an mm base and its meters-scale equivalent", async () => {
    const mmTris = parseBinaryStl(generateCylinderStl(12.5, 3.5, 16));
    const mmBaseGlb = await stlToGlb(mmTris, "#8a8a8a");
    const metersTris = parseBinaryStl(generateCylinderStl(0.0125, 0.0035, 16));
    const metersBaseGlb = await stlToGlb(metersTris, "#8a8a8a");

    const composedMm = await composeGlb(mockFigureGlb(), mmBaseGlb, 28, 16);
    const composedMeters = await composeGlb(mockFigureGlb(), metersBaseGlb, 28, 16);

    const docMm = await new WebIO().registerExtensions(ALL_EXTENSIONS).readBinary(composedMm);
    const docMeters = await new WebIO().registerExtensions(ALL_EXTENSIONS).readBinary(composedMeters);

    const figureWrapperMm = docMm.getRoot().listScenes()[0].listChildren().find((n) => n.getName().startsWith("figure-"))!;
    const figureWrapperMeters = docMeters.getRoot().listScenes()[0].listChildren().find((n) => n.getName().startsWith("figure-"))!;

    // Both bases are the same physical 3.5mm-tall shape (one native mm, one
    // meters-scale) — after normalization the figure must be seated at the
    // same height regardless of which unit convention the base GLB used.
    expect(figureWrapperMm.getTranslation()[1]).toBeCloseTo(3.5, 3);
    expect(figureWrapperMeters.getTranslation()[1]).toBeCloseTo(figureWrapperMm.getTranslation()[1], 3);
  });
});

describe("composeGlb KHR extension preservation", () => {
  it("survives KHR_materials_emissive_strength through composition (glowing lava bases)", async () => {
    const baseGlb = await buildGlbWithEmissiveMaterial(5);

    const composed = await composeGlb(mockFigureGlb(), baseGlb, 28, 16);
    const doc = await new WebIO().registerExtensions(ALL_EXTENSIONS).readBinary(composed);

    const material = doc.getRoot().listMaterials().find((m) => m.getName() === "lava");
    expect(material).toBeDefined();

    const strength = material!.getExtension<EmissiveStrength>("KHR_materials_emissive_strength");
    expect(strength).not.toBeNull();
    expect(strength!.getEmissiveStrength()).toBeCloseTo(5);
  });

  it("a material with no emissive-strength extension composes without gaining one", async () => {
    const baseTris = parseBinaryStl(generateCylinderStl(12.5, 3.5, 16));
    const baseGlb = await stlToGlb(baseTris, "#8a8a8a"); // stlToGlb never sets this extension

    const composed = await composeGlb(mockFigureGlb(), baseGlb, 28, 16);
    const doc = await new WebIO().registerExtensions(ALL_EXTENSIONS).readBinary(composed);

    const material = doc.getRoot().listMaterials().find((m) => m.getName() === "miniBase");
    expect(material).toBeDefined();
    expect(material!.getExtension<EmissiveStrength>("KHR_materials_emissive_strength")).toBeNull();
  });
});
