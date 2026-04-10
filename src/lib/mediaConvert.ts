/**
 * Client-side media conversion utilities.
 *
 * toWebP  — converts any image File to WebP (max 1920px, 85% quality).
 * toOpus  — converts WAV files to WebM/Opus (or OGG/Opus in Firefox) using
 *            the Web Audio API + MediaRecorder. Non-WAV files pass through
 *            unchanged. Falls back to the original file on any error or if
 *            the browser doesn't support Opus encoding (Safari).
 *
 * Both functions are pure: they never throw; they return the original file
 * on failure so callers don't need to handle errors.
 */

// ── Image ────────────────────────────────��────────────────────────────────

export async function toWebP(file: File, maxPx = 1920, quality = 0.85): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(new File([blob], file.name.replace(/\.[^.]+$/, ".webp"), { type: "image/webp" }));
          } else {
            resolve(file);
          }
        },
        "image/webp",
        quality,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(file); };
    img.src = objectUrl;
  });
}

// ── Audio ─────────────────────────────────────────────────────────────────

/**
 * Compress a WAV file to WebM/Opus (Chrome/Edge) or OGG/Opus (Firefox) using
 * the Web Audio API + MediaRecorder. Compression ratio is typically 10–20×.
 *
 * Note: encoding runs in real time (a 3-minute WAV takes ~3 minutes to
 * encode). Show a "Converting…" indicator while awaiting this function.
 *
 * Non-WAV files (MP3, OGG, M4A, AAC, FLAC, WebM) are already compressed and
 * are returned unchanged.
 */
export async function toOpus(file: File): Promise<File> {
  const isWav =
    file.type === "audio/wav" ||
    file.type === "audio/x-wav" ||
    file.name.toLowerCase().endsWith(".wav");
  if (!isWav) return file;

  // Prefer OGG/Opus — it plays in Chrome, Firefox, and Safari 14+.
  // Fall back to WebM/Opus (Chrome-only recording but wide playback).
  const mimeType =
    MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")
      ? "audio/ogg;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : null;

  // No Opus encoder available (Safari) — upload original WAV.
  if (!mimeType) return file;

  try {
    const arrayBuffer = await file.arrayBuffer();

    // Decode WAV → AudioBuffer
    const decodeCtx = new AudioContext();
    const audioBuffer = await decodeCtx.decodeAudioData(arrayBuffer);
    await decodeCtx.close();

    // Pipe decoded audio through a MediaStreamDestination so MediaRecorder
    // can capture and encode it. This runs at real-time playback speed.
    const playCtx = new AudioContext();
    await playCtx.resume(); // browsers may auto-suspend AudioContexts
    const dest = playCtx.createMediaStreamDestination();
    const source = playCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(dest);

    return await new Promise<File>((resolve) => {
      const recorder = new MediaRecorder(dest.stream, { mimeType });
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = async () => {
        await playCtx.close();
        const blob = new Blob(chunks, { type: mimeType });
        const ext = mimeType.includes("ogg") ? "ogg" : "webm";
        resolve(new File([blob], file.name.replace(/\.[^.]+$/, `.${ext}`), { type: mimeType }));
      };

      recorder.start(250); // flush chunks every 250 ms
      source.start(0);
      source.onended = () => recorder.stop();
    });
  } catch {
    return file; // any error → upload original
  }
}
