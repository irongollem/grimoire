import { describe, it, expect } from "vitest";
import { createImageTo3dTask, getImageTo3dTask, type MeshyTaskParams } from "./mesh3d";

const PRINT_PARAMS: MeshyTaskParams = {
  should_texture: false,
  topology: "triangle",
  target_polycount: 200_000,
  target_formats: ["stl", "3mf", "glb"],
  ai_model: "latest",
};

const VTT_PARAMS: MeshyTaskParams = {
  should_texture: true,
  target_polycount: 20_000,
  target_formats: ["glb", "usdz"],
  ai_model: "latest",
};

// Node has no Deno global, so isMockMode() only ever takes the apiKey==="mock"
// branch here — this exercises exactly what forge-mini's mock fallback does
// when MESHY_MOCK isn't set as a real env var (its own local-testing path).
describe("mesh3d mock mode — lifecycle", () => {
  it("create returns a mock-prefixed task id", async () => {
    const id = await createImageTo3dTask("mock", "https://example.com/portrait.webp", PRINT_PARAMS);
    expect(id).toMatch(/^mock-/);
  });

  it("get immediately resolves SUCCEEDED with 100% progress and no error", async () => {
    const id = await createImageTo3dTask("mock", "https://example.com/portrait.webp", PRINT_PARAMS);
    const task = await getImageTo3dTask("mock", id);
    expect(task.status).toBe("SUCCEEDED");
    expect(task.progress).toBe(100);
    expect(task.error).toBeNull();
    expect(task.thumbnailUrl).toMatch(/^data:image\/webp;base64,/);
    expect(task.polycount).toBeGreaterThan(0);
  });

  it("only returns model URLs for formats requested at create time — print", async () => {
    const id = await createImageTo3dTask("mock", "https://example.com/portrait.webp", PRINT_PARAMS);
    const task = await getImageTo3dTask("mock", id);
    expect(Object.keys(task.modelUrls).sort()).toEqual(["3mf", "glb", "stl"]);
    expect(task.modelUrls.usdz).toBeUndefined();
    expect(task.modelUrls.obj).toBeUndefined();
  });

  it("only returns model URLs for formats requested at create time — vtt", async () => {
    const id = await createImageTo3dTask("mock", "https://example.com/portrait.webp", VTT_PARAMS);
    const task = await getImageTo3dTask("mock", id);
    expect(Object.keys(task.modelUrls).sort()).toEqual(["glb", "usdz"]);
    expect(task.modelUrls.stl).toBeUndefined();
    expect(task.modelUrls["3mf"]).toBeUndefined();
  });

  it("an unknown task id (never created) still resolves — defaults to a glb-only result", async () => {
    const task = await getImageTo3dTask("mock", "mock-never-created");
    expect(task.status).toBe("SUCCEEDED");
    expect(Object.keys(task.modelUrls)).toEqual(["glb"]);
  });

  it("each mock task gets a distinct id", async () => {
    const id1 = await createImageTo3dTask("mock", "https://example.com/a.webp", PRINT_PARAMS);
    const id2 = await createImageTo3dTask("mock", "https://example.com/b.webp", PRINT_PARAMS);
    expect(id1).not.toBe(id2);
  });
});

describe("mesh3d mock mode — fixture validity", () => {
  it("the mock GLB decodes to bytes starting with the 'glTF' binary magic, version 2", async () => {
    const id = await createImageTo3dTask("mock", "https://example.com/portrait.webp", VTT_PARAMS);
    const task = await getImageTo3dTask("mock", id);
    const glbUrl = task.modelUrls.glb;
    expect(glbUrl).toBeDefined();
    const base64 = glbUrl!.split(",")[1];
    const bytes = Buffer.from(base64, "base64");

    // 12-byte header: magic "glTF", uint32 version, uint32 total length.
    expect(bytes.length).toBeGreaterThanOrEqual(12);
    expect(bytes.subarray(0, 4).toString("ascii")).toBe("glTF");
    expect(bytes.readUInt32LE(4)).toBe(2); // version
    expect(bytes.readUInt32LE(8)).toBe(bytes.length); // declared length matches actual

    // First chunk must be the JSON chunk (chunk type 0x4E4F534A === "JSON").
    const jsonChunkLength = bytes.readUInt32LE(12);
    const jsonChunkType = bytes.readUInt32LE(16);
    expect(jsonChunkType).toBe(0x4e4f534a);
    const json = JSON.parse(bytes.subarray(20, 20 + jsonChunkLength).toString("utf8").trim());
    expect(json.asset.version).toBe("2.0");
  });

  it("the mock STL is a valid, if empty, binary STL (>= 84 bytes: 80-byte header + uint32 triangle count)", async () => {
    const id = await createImageTo3dTask("mock", "https://example.com/portrait.webp", PRINT_PARAMS);
    const task = await getImageTo3dTask("mock", id);
    const stlUrl = task.modelUrls.stl;
    expect(stlUrl).toBeDefined();
    const base64 = stlUrl!.split(",")[1];
    const bytes = Buffer.from(base64, "base64");
    expect(bytes.length).toBeGreaterThanOrEqual(84);
    // Triangle count (uint32 at offset 80) is 0 for this minimal fixture.
    expect(bytes.readUInt32LE(80)).toBe(0);
  });

  it("the mock thumbnail is a data: webp URL", async () => {
    const id = await createImageTo3dTask("mock", "https://example.com/portrait.webp", VTT_PARAMS);
    const task = await getImageTo3dTask("mock", id);
    expect(task.thumbnailUrl).toMatch(/^data:image\/webp;base64,/);
    const base64 = task.thumbnailUrl!.split(",")[1];
    expect(() => Buffer.from(base64, "base64")).not.toThrow();
  });
});
