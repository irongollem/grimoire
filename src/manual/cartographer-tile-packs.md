# Custom tile packs

Open **Cartographer → Tile Packs** to manage custom map art.

## Upload a pack

Custom uploads require Pro. Choose either a zip file or a folder containing `manifest.json` and its assets. Grimoire checks the current tile-pack schema, reports every missing required slot, and accepts only decoded 128×128 WebP files. Nothing is uploaded until those checks pass.

Uploaded packs are private by default. Turn on **Share with active campaign** to make one available read-only to that campaign's members. They cannot edit, delete, or reshare it.

Deleting an owned pack removes its manifest, generated candidates, and normalized assets. Cancel an active generation run before deleting its draft. Existing maps keep their pack reference but fall back until you select an available pack.

## Generate a pack

Enter a concept name and a concise description of materials, motifs, palette, and mood. Generation uses GPT Image 2 at low quality and spends credits one retained tile at a time.

The first run creates three style proofs: a floor, wall, and solid block. Inspect them at their actual tile scale. Regenerate an outlier, or approve the visual family to continue the complete required set. Failed slots can be retried independently, and reloading the page does not lose progress.

Cancelling prevents new tile calls. A provider failure or result that cannot be retained releases its credit reservation. If a call finishes and its candidate is safely retained before cancellation arrives, that completed asset remains charged and reusable.

Generated packs appear in the normal Cartographer tile-pack picker once every required slot passes normalization and schema validation.
