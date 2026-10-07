import { describe, expect, it } from "vitest";
import { archiveDisplayName, filesToArchiveInput } from "./readFiles";

const file = (name: string, text: string, webkitRelativePath?: string) => ({
  name,
  webkitRelativePath,
  arrayBuffer: async () => new TextEncoder().encode(text).buffer as ArrayBuffer,
});

describe("filesToArchiveInput", () => {
  it("uses the folder path when a folder was picked and the plain name otherwise", async () => {
    const out = await filesToArchiveInput([file("Mara.md", "hi", "Vault/NPCs/Mara.md"), file("export.zip", "zz")]);
    expect(out.map((f) => f.name)).toEqual(["Vault/NPCs/Mara.md", "export.zip"]);
    expect(new TextDecoder().decode(out[0].bytes)).toBe("hi");
  });
});

describe("archiveDisplayName", () => {
  it("names the import after the folder, the zip, or the count", () => {
    expect(archiveDisplayName([file("a.md", "", "My Vault/a.md")])).toBe("My Vault");
    expect(archiveDisplayName([file("World Anvil export.zip", "")])).toBe("World Anvil export");
    expect(archiveDisplayName([file("a.md", ""), file("b.md", "")])).toBe("2 exported pages");
    expect(archiveDisplayName([])).toBe("Wiki export");
  });
});
