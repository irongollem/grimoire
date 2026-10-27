import { afterEach, describe, it, expect, vi } from "vitest";
import { createImageTo3dTask, getImageTo3dTask, type MeshyTaskParams } from "./mesh3d";

const PRINT_PARAMS: MeshyTaskParams = {
  should_texture: false,
  topology: "triangle",
  target_polycount: 200_000,
  target_formats: ["stl", "3mf", "glb"],
  ai_model: "latest",
  auto_size: true,
  origin_at: "bottom",
};

const VTT_PARAMS: MeshyTaskParams = {
  should_texture: true,
  target_polycount: 20_000,
  target_formats: ["glb", "usdz"],
  ai_model: "latest",
  auto_size: true,
  origin_at: "bottom",
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
});

describe("the real Meshy API", () => {
  afterEach(() => vi.unstubAllGlobals());
  const stub = (body: unknown, status = 200) => {
    const fetchMock = vi.fn(async (..._args: unknown[]) => new Response(JSON.stringify(body), { status }));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  };

  it.each([
    ["wraps the id in { result }", { result: "task-1" }],
    ["answers with a bare id", "task-1"],
    ["answers with { id }", { id: "task-1" }],
  ])("create reads the task id when Meshy %s", async (_label, reply) => {
    stub(reply);
    await expect(createImageTo3dTask("sk-meshy", "https://example.com/p.webp", PRINT_PARAMS)).resolves.toBe("task-1");
  });

  it("create sends the key as a bearer token and the image with the chosen parameters", async () => {
    const fetchMock = stub({ result: "task-1" });
    await createImageTo3dTask("sk-meshy", "https://example.com/p.webp", PRINT_PARAMS);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-meshy");
    expect(JSON.parse(init.body as string)).toMatchObject({ image_url: "https://example.com/p.webp", should_texture: false, target_formats: ["stl", "3mf", "glb"] });
  });

  it("create refuses a reply with no task id, and surfaces Meshy's own message on failure", async () => {
    stub({});
    await expect(createImageTo3dTask("k", "u", PRINT_PARAMS)).rejects.toThrow(/no task id/);
    stub({ message: "Insufficient credits" }, 402);
    await expect(createImageTo3dTask("k", "u", PRINT_PARAMS)).rejects.toThrow("Insufficient credits");
  });

  it("get maps a finished task, and a failed one carries Meshy's error message", async () => {
    stub({
      id: "task-1",
      status: "SUCCEEDED",
      progress: 100,
      model_urls: { glb: "https://cdn/m.glb" },
      thumbnail_url: "https://cdn/t.webp",
      polycount: 18000,
    });
    await expect(getImageTo3dTask("k", "task-1")).resolves.toEqual({
      id: "task-1",
      status: "SUCCEEDED",
      progress: 100,
      modelUrls: { glb: "https://cdn/m.glb" },
      thumbnailUrl: "https://cdn/t.webp",
      polycount: 18000,
      error: null,
    });
    stub({ id: "task-1", status: "FAILED", task_error: { message: "image unusable" } });
    await expect(getImageTo3dTask("k", "task-1")).resolves.toMatchObject({ status: "FAILED", error: "image unusable" });
  });

  it("get reads absent progress as 0 and absent polycount as unknown, not as zero polygons", async () => {
    stub({ id: "task-1", status: "IN_PROGRESS" });
    await expect(getImageTo3dTask("k", "task-1")).resolves.toMatchObject({ progress: 0, polycount: null, thumbnailUrl: null, modelUrls: {} });
  });

  it("get throws on a non-2xx answer", async () => {
    stub({}, 500);
    await expect(getImageTo3dTask("k", "task-1")).rejects.toThrow("500");
  });
});
