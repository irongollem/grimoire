// Procedural placeholders for trap hazard glyphs (#804) — the pack-agnostic
// drawing hint carried on `traps.hazard_glyph`. Distinctness matters more
// than realism here: most packs will have no real hazard art for a long
// time, so this IS what a DM actually sees on a placed trap's cell. Every
// shape below uses a different SILHOUETTE, never just a different fill
// colour, so a pit and a falling block read apart even desaturated.
//
// Drawn on a transparent background at full BASE_TILE_SIZE, same convention
// the object stamps in placeholderTile.ts use — a hazard sits ON the floor,
// so the floor tile underneath must stay visible.

import { BASE_TILE_SIZE, type PackCategory } from "./packSchema";
import { darken, lighten, rgbStr, type RgbColor } from "./placeholderColor";

export type HazardCategory = Extract<PackCategory, `hazard${string}`>;

export function isHazardCategory(category: PackCategory): category is HazardCategory {
  return category.startsWith("hazard");
}

export function drawHazardGlyph(ctx: CanvasRenderingContext2D, category: HazardCategory, base: RgbColor): void {
  const S = BASE_TILE_SIZE;
  const cx = S / 2;
  const cy = S / 2;
  ctx.clearRect(0, 0, S, S);

  switch (category) {
    case "hazardPit": {
      // A dark hole with a lighter rim — reads as an absence, not an object.
      ctx.fillStyle = lighten(base, 25);
      ctx.beginPath(); ctx.ellipse(cx, cy, 40, 34, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgb(8,8,8)";
      ctx.beginPath(); ctx.ellipse(cx, cy, 32, 26, 0, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case "hazardPressurePlate": {
      // A flush square plate with a beveled edge and corner rivets.
      ctx.fillStyle = rgbStr(base);
      ctx.fillRect(cx - 34, cy - 34, 68, 68);
      ctx.strokeStyle = darken(base, 0.5);
      ctx.lineWidth = 3;
      ctx.strokeRect(cx - 34, cy - 34, 68, 68);
      ctx.fillStyle = darken(base, 0.6);
      for (const [ox, oy] of [[-27, -27], [27, -27], [-27, 27], [27, 27]] as [number, number][]) {
        ctx.beginPath(); ctx.arc(cx + ox, cy + oy, 3, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case "hazardTripwire": {
      // A thin diagonal wire strung between two anchor posts.
      ctx.strokeStyle = darken(base, 0.7);
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(cx - 40, cy - 8); ctx.lineTo(cx + 40, cy + 8); ctx.stroke();
      ctx.fillStyle = darken(base, 0.5);
      ctx.fillRect(cx - 44, cy - 14, 10, 22);
      ctx.fillRect(cx + 34, cy - 2, 10, 22);
      break;
    }
    case "hazardFallingBlock": {
      // A heavy, cracked stone slab overhead — big and blocky.
      ctx.fillStyle = rgbStr(base);
      ctx.fillRect(cx - 38, cy - 38, 76, 76);
      ctx.strokeStyle = darken(base, 0.55);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx - 20, cy - 38); ctx.lineTo(cx - 6, cy - 4); ctx.lineTo(cx - 30, cy + 20);
      ctx.moveTo(cx + 10, cy - 38); ctx.lineTo(cx + 22, cy + 10); ctx.lineTo(cx + 38, cy + 30);
      ctx.stroke();
      break;
    }
    case "hazardDartWall": {
      // A wall strip studded with dart holes.
      ctx.fillStyle = darken(base, 0.7);
      ctx.fillRect(cx - 46, cy - 12, 92, 24);
      ctx.fillStyle = rgbStr(base);
      for (const ox of [-32, -8, 16, 40]) {
        ctx.beginPath(); ctx.arc(cx + ox, cy, 5, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case "hazardBlade": {
      // A diagonal blade with a bright edge highlight.
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = rgbStr(base);
      ctx.beginPath();
      ctx.moveTo(-44, 0); ctx.lineTo(0, -10); ctx.lineTo(44, 0); ctx.lineTo(0, 10); ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = lighten(base, 60);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-40, 0); ctx.lineTo(40, 0); ctx.stroke();
      ctx.restore();
      break;
    }
    case "hazardFlameJet": {
      // A flame tongue firing FROM the floor — no brazier housing.
      ctx.fillStyle = rgbStr(base);
      ctx.beginPath(); ctx.ellipse(cx, cy + 6, 22, 30, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = lighten(base, 60);
      ctx.beginPath(); ctx.ellipse(cx, cy, 11, 18, 0, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case "hazardGlyph": {
      // An arcane rune inscribed in a circle.
      ctx.strokeStyle = rgbStr(base);
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx, cy, 32, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const angle = -Math.PI / 2 + (i * 4 * Math.PI) / 5;
        const px = cx + Math.cos(angle) * 22;
        const py = cy + Math.sin(angle) * 22;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.stroke();
      break;
    }
    case "hazardNet": {
      // Cross-hatched rope mesh.
      ctx.strokeStyle = darken(base, 0.8);
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = -3; i <= 3; i++) {
        ctx.moveTo(cx - 48, cy + i * 16); ctx.lineTo(cx + 48, cy + i * 16 + 32);
        ctx.moveTo(cx - 48, cy + i * 16 + 32); ctx.lineTo(cx + 48, cy + i * 16);
      }
      ctx.stroke();
      break;
    }
    case "hazardAlarm": {
      // A bell shape.
      ctx.fillStyle = rgbStr(base);
      ctx.beginPath();
      ctx.moveTo(cx - 24, cy + 20);
      ctx.quadraticCurveTo(cx - 24, cy - 30, cx, cy - 30);
      ctx.quadraticCurveTo(cx + 24, cy - 30, cx + 24, cy + 20);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = darken(base, 0.6);
      ctx.fillRect(cx - 28, cy + 18, 56, 8);
      ctx.beginPath(); ctx.arc(cx, cy + 34, 6, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case "hazardCollapsingFloor": {
      // Floor tone with spidered cracks — a fracture, not a hole.
      ctx.fillStyle = rgbStr(base);
      ctx.fillRect(0, 0, S, S);
      ctx.strokeStyle = "rgba(0,0,0,0.55)";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (const angle of [0.3, 1.3, 2.1, 2.8, 3.6, 4.5, 5.2, 5.9]) {
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(angle) * 50, cy + Math.sin(angle) * 50);
      }
      ctx.stroke();
      break;
    }
    case "hazardGeneric":
    default: {
      // Unset glyph — a placed trap that hasn't said what it looks like yet.
      // Still a marker, never an empty cell.
      ctx.fillStyle = "rgb(200,60,40)";
      ctx.beginPath();
      ctx.moveTo(cx, cy - 36); ctx.lineTo(cx + 34, cy + 26); ctx.lineTo(cx - 34, cy + 26); ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgb(255,255,255)";
      ctx.font = "bold 34px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("!", cx, cy + 6);
      break;
    }
  }
}
