export const NPC_SYSTEM_PROMPT = `You are a creative assistant for Dungeons & Dragons 5e campaign management.

Generate a detailed NPC based on the dungeon master's description. Return a single JSON object with exactly these fields:

{
  "name": "Full name",
  "race": "D&D 5e race (e.g. Human, Elf, Tiefling, Dwarf, Half-Orc)",
  "alignment": "One of: Lawful Good, Neutral Good, Chaotic Good, Lawful Neutral, True Neutral, Chaotic Neutral, Lawful Evil, Neutral Evil, Chaotic Evil, Unaligned",
  "age": "Age as a string (e.g. '45', 'Young adult', 'Elder', 'Ancient')",
  "occupation": "Their role or profession",
  "appearance": "2–3 paragraphs: physical build, face, hair, clothing, distinguishing features. Separate paragraphs with a blank line. Plain text only.",
  "personality": "2–3 paragraphs: traits, mannerisms, speech patterns, ideals, bonds, flaws. Separate paragraphs with a blank line. Plain text only.",
  "backstory": "3–4 paragraphs of history, origin, and formative events. Separate paragraphs with a blank line. Plain text only.",
  "notes": "1–2 paragraphs of DM-facing content: secrets, plot hooks, rumours, hidden motives. Separate paragraphs with a blank line. Plain text only.",
  "status": "One of: alive, dead, missing, unknown",
  "relationship": "One of: ally, neutral, enemy, unknown",
  "tags": ["3 to 5 short descriptive tags"],
  "image_prompt": "A concise portrait description for image generation. Describe the subject only: physical features, expression, pose, clothing, and immediate environment. No style or art direction."
}

Return only the JSON object. No markdown fences, no explanation.`;

/** Injected at the front of every image generation prompt. */
export const IMAGE_BASE_PROMPT =
  // "Semi-realistic painterly fantasy portrait. Oil painting with visible brushwork. Dramatic chiaroscuro lighting, rich saturated colours. Highly detailed face and costume. Classic fantasy illustration in the tradition of Howard Lyon and Tyler Jacobson.";
  "Refined semi-realistic painterly fantasy illustration. Clearly illustrated, polished, and non-photographic. Controlled brushwork, clean shape design, clear form modeling, readable anatomy, expressive faces, strong silhouettes, atmospheric depth, restrained texture, and a cohesive finished surface. Keep colors tasteful and moderately muted with selective accents for life and clarity. Prioritize readability, subject clarity, and elegant painterly fantasy over spectacle or realism. Avoid photorealism, cinematic or camera-driven aesthetics, glossy realism, lens blur, pores, oversharpening, noisy micro-detail, muddy rendering, excessive grit, rough sketchiness, cartoon stylization, and anime stylization.";
