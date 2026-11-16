import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PROVENANCE_SIDECAR, provenanceFor } from "./bookImages";

const AT = "2026-11-16T18:00:00.000Z";

function pipelinePicture(name: string): string {
  const dir = join(mkdtempSync(join(tmpdir(), "book-images-")), "art-955", "kind-country", "out");
  return join(dir, name);
}

function withSidecar(file: string, body: string): string {
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(`${file}${PROVENANCE_SIDECAR}`, body);
  return file;
}

describe("provenanceFor", () => {
  // Bug: an Images API render in the pipeline folder was disclosed as gpt-image-2, a model that did not draw it.
  it("names the model a sidecar records, over the pipeline folder's guess", () => {
    const file = withSidecar(pipelinePicture("creature-rindstilt.png"), JSON.stringify({ provider: "openai", model: "gpt-image-2.6-flare" }));
    expect(provenanceFor(file, AT)).toMatchObject({ provider: "openai", model: "gpt-image-2.6-flare" });
  });

  it("keeps the pipeline folder's generator when there is no sidecar", () => {
    expect(provenanceFor(pipelinePicture("creature-peelwalker.png"), AT)).toMatchObject({ provider: "openai", model: "gpt-image-2" });
  });

  it("refuses a sidecar that names no model rather than disclose a wrong one", () => {
    const file = withSidecar(pipelinePicture("creature-broken.png"), JSON.stringify({ provider: "openai" }));
    expect(() => provenanceFor(file, AT)).toThrow(/must name a provider and a model/);
  });
});
