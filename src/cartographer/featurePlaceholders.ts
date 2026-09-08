// Procedural placeholders for dungeon feature glyphs (#804) — same contract
// as hazardPlaceholders.ts, for `dungeon_features.feature_glyph`. A secret
// door and a fountain must read apart as placeholders, not only once real
// pack art exists.

import { BASE_TILE_SIZE, type PackCategory } from "./packSchema";
import { darken, lighten, rgbStr, type RgbColor } from "./placeholderColor";

export type FeatureCategory = Extract<PackCategory, `feature${string}`>;

export function isFeatureCategory(category: PackCategory): category is FeatureCategory {
  return category.startsWith("feature");
}

export function drawFeatureGlyph(ctx: CanvasRenderingContext2D, category: FeatureCategory, base: RgbColor): void {
  const S = BASE_TILE_SIZE;
  const cx = S / 2;
  const cy = S / 2;
  ctx.clearRect(0, 0, S, S);

  switch (category) {
    case "featureSecretDoor": {
      // A door-shaped seam in the wall — same footprint as a wall segment,
      // but a hinge-line crack down the middle rather than an opening.
      ctx.fillStyle = rgbStr(base);
      ctx.fillRect(cx - 30, cy - 46, 60, 92);
      ctx.strokeStyle = darken(base, 0.5);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx, cy - 46); ctx.lineTo(cx, cy + 46); ctx.stroke();
      ctx.fillStyle = darken(base, 0.4);
      ctx.beginPath(); ctx.arc(cx - 10, cy, 4, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case "featureHiddenPassage": {
      // A dark archway receding into shadow.
      ctx.fillStyle = darken(base, 0.4);
      ctx.beginPath();
      ctx.moveTo(cx - 26, cy + 40);
      ctx.lineTo(cx - 26, cy - 10);
      ctx.quadraticCurveTo(cx - 26, cy - 40, cx, cy - 40);
      ctx.quadraticCurveTo(cx + 26, cy - 40, cx + 26, cy - 10);
      ctx.lineTo(cx + 26, cy + 40);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "rgb(5,5,8)";
      ctx.beginPath(); ctx.ellipse(cx, cy + 6, 14, 30, 0, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case "featureCache": {
      // A buried mound with a glint of treasure — distinct from
      // objectChest's full lidded box.
      ctx.fillStyle = darken(base, 0.75);
      ctx.beginPath(); ctx.ellipse(cx, cy + 14, 38, 18, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgb(230,190,60)";
      for (const [ox, oy] of [[-10, -2], [8, 4], [-2, -10]] as [number, number][]) {
        ctx.beginPath(); ctx.arc(cx + ox, cy + oy, 4, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case "featureMovingWall": {
      // A wall block with a directional chevron — it slides.
      ctx.fillStyle = rgbStr(base);
      ctx.fillRect(cx - 40, cy - 30, 80, 60);
      ctx.fillStyle = lighten(base, 60);
      ctx.beginPath();
      ctx.moveTo(cx - 10, cy - 16); ctx.lineTo(cx + 14, cy); ctx.lineTo(cx - 10, cy + 16); ctx.closePath();
      ctx.fill();
      break;
    }
    case "featureLever": {
      // A handle on a small mounting plate.
      ctx.fillStyle = darken(base, 0.6);
      ctx.fillRect(cx - 20, cy + 20, 40, 12);
      ctx.strokeStyle = rgbStr(base);
      ctx.lineWidth = 7;
      ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(cx, cy + 22); ctx.lineTo(cx + 20, cy - 30); ctx.stroke();
      ctx.fillStyle = rgbStr(base);
      ctx.beginPath(); ctx.arc(cx + 20, cy - 30, 8, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case "featureAltar": {
      // A raised stone slab with a glowing top surface.
      ctx.fillStyle = darken(base, 0.7);
      ctx.fillRect(cx - 30, cy + 6, 60, 26);
      ctx.fillStyle = rgbStr(base);
      ctx.beginPath();
      ctx.moveTo(cx - 40, cy + 6); ctx.lineTo(cx + 40, cy + 6); ctx.lineTo(cx + 30, cy - 14); ctx.lineTo(cx - 30, cy - 14);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.fillRect(cx - 24, cy - 10, 48, 4);
      break;
    }
    case "featureFountain": {
      // A circular basin with a jet of water.
      ctx.strokeStyle = darken(base, 0.6);
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(cx, cy, 36, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = rgbStr(base);
      ctx.beginPath(); ctx.arc(cx, cy, 30, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = lighten(base, 70);
      ctx.beginPath(); ctx.arc(cx, cy, 8, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case "featureStatue": {
      // A robed humanoid figure — distinct from objectStatue's plain obelisk.
      ctx.fillStyle = rgbStr(base);
      ctx.beginPath(); ctx.arc(cx, cy - 30, 12, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx - 22, cy + 36); ctx.lineTo(cx - 16, cy - 10); ctx.lineTo(cx + 16, cy - 10); ctx.lineTo(cx + 22, cy + 36);
      ctx.closePath(); ctx.fill();
      break;
    }
    case "featureRubble": {
      // A solid pile of overlapping stones — a mound, distinct from the
      // scattered decorative `rubble` floor category.
      ctx.fillStyle = darken(base, 0.85);
      for (const [ox, oy, r] of [[-18, 10, 20], [14, 8, 22], [0, -6, 18], [-4, 20, 16]] as [number, number, number][]) {
        ctx.beginPath(); ctx.arc(cx + ox, cy + oy, r, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case "featureInscription": {
      // A carved tablet.
      ctx.fillStyle = rgbStr(base);
      ctx.fillRect(cx - 32, cy - 30, 64, 60);
      ctx.strokeStyle = darken(base, 0.6);
      ctx.lineWidth = 2;
      for (const oy of [-14, -2, 10, 22]) {
        ctx.beginPath(); ctx.moveTo(cx - 22, cy + oy); ctx.lineTo(cx + 22, cy + oy); ctx.stroke();
      }
      break;
    }
    case "featureGeneric":
    default: {
      // Unset glyph — a placed feature that hasn't said what it looks like
      // yet. Still a marker, never an empty cell.
      ctx.fillStyle = "rgb(70,150,160)";
      ctx.beginPath(); ctx.arc(cx, cy, 34, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgb(255,255,255)";
      ctx.font = "bold 34px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("?", cx, cy + 4);
      break;
    }
  }
}
