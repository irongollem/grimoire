import { beforeEach, describe, expect, it, vi } from "vitest";

const detect = vi.fn();
const saveLocal = vi.fn();
const persist = vi.fn();
const fromVideo = vi.fn();
const fromAnimated = vi.fn();

vi.mock("@/lib/mapImport/motionDetect", () => ({ detectMotion: (f: File) => detect(f) }));
vi.mock("@/lib/mapImport/localMedia", () => ({
  saveLocalMap: (...a: unknown[]) => saveLocal(...a),
  requestPersistence: () => persist(),
}));
vi.mock("@/lib/mapImport/posterFrame", () => ({
  posterFromVideo: (...a: unknown[]) => fromVideo(...a),
  posterFromAnimatedImage: (...a: unknown[]) => fromAnimated(...a),
}));

import { storePicture } from "./storePicture";

const poster = new File(["p"], "ambush.webp", { type: "image/webp" });

beforeEach(() => {
  vi.clearAllMocks();
  saveLocal.mockResolvedValue(true);
  fromVideo.mockResolvedValue({ poster, width: 4096, height: 2731, durationSeconds: 12 });
  fromAnimated.mockResolvedValue({ poster, width: 1000, height: 800, durationSeconds: null });
});

describe("storePicture", () => {
  it("uploads a still as it is and keeps nothing on the device", async () => {
    detect.mockResolvedValue("still");
    const upload = vi.fn().mockResolvedValue("https://cdn/x.webp");
    const file = new File(["x"], "map.png", { type: "image/png" });
    const out = await storePicture(file, "place1", upload);
    expect(upload).toHaveBeenCalledWith(file);
    expect(saveLocal).not.toHaveBeenCalled();
    expect(out).toEqual({ mapUrl: "https://cdn/x.webp", motion: null, couldNotKeepMoving: false });
  });

  it("keeps a video on the device and uploads only its still (a 48 MB file never reaches the store)", async () => {
    detect.mockResolvedValue("video");
    const upload = vi.fn().mockResolvedValue("https://cdn/still.webp");
    const video = new File(["v".repeat(10)], "ambush.webm", { type: "video/webm" });
    const out = await storePicture(video, "place1", upload);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(upload).toHaveBeenCalledWith(poster);
    expect(saveLocal).toHaveBeenCalledWith("place1", video);
    expect(out.motion).toEqual({ kind: "video", file_name: "ambush.webm", mime: "video/webm", bytes: 10, width: 4096, height: 2731 });
  });

  it("takes the still of an animated image from its first frame, not a video seek", async () => {
    detect.mockResolvedValue("animated");
    const upload = vi.fn().mockResolvedValue("https://cdn/still.webp");
    await storePicture(new File(["g"], "fire.gif", { type: "image/gif" }), "p", upload);
    expect(fromAnimated).toHaveBeenCalled();
    expect(fromVideo).not.toHaveBeenCalled();
  });

  it("takes the still from the frame the DM chose", async () => {
    detect.mockResolvedValue("video");
    await storePicture(new File(["v"], "a.mp4", { type: "video/mp4" }), "p", vi.fn().mockResolvedValue("u"), 7.5);
    expect(fromVideo.mock.calls[0][1]).toBe(7.5);
  });

  it("says so when the browser will not store the moving file, rather than recording motion that is not there", async () => {
    detect.mockResolvedValue("video");
    saveLocal.mockResolvedValue(false);
    const out = await storePicture(new File(["v"], "a.mp4", { type: "video/mp4" }), "p", vi.fn().mockResolvedValue("u"));
    expect(out.motion).toBeNull();
    expect(out.couldNotKeepMoving).toBe(true);
  });

  it("fails loudly when the upload does, instead of saving a map with no picture", async () => {
    detect.mockResolvedValue("still");
    await expect(storePicture(new File(["x"], "a.png"), "p", vi.fn().mockResolvedValue(null))).rejects.toThrow(/uploaded/);
  });
});
