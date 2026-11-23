import { describe, expect, it } from "vitest";
import { ASK_OFF_TOPIC_MESSAGE } from "./askContract.ts";
import { checkOutput, looksLikeCode } from "./askOutput.ts";

const FENCE = "```";

const PROSE = [
  "Harl runs the mill, and has since his father died. He owes the Ashen Warden a favour; the party learned this in session 12.",
  "I read three records. The baker, Mara, knows about the vault; nobody else does as far as the campaign says.",
  `A short answer: yes. Opportunity attacks only trigger when a creature you can see moves out of your reach using its movement, so being teleported away does not provoke one.`,
];

const STAT_BLOCK = `Marsh Hag (Medium fey, chaotic evil)
AC 17 (natural armor)
HP 82 (11d8 + 33)
Speed 30 ft., swim 30 ft.
STR 18 (+4)  DEX 12 (+1)  CON 16 (+3)  INT 13 (+1)  WIS 14 (+2)  CHA 14 (+2)
Skills: Arcana +3, Deception +4, Perception +4
Challenge 3 (700 XP)
Claws. Melee Weapon Attack: +6 to hit, reach 5 ft., one target. Hit: 13 (2d8 + 4) slashing damage.`;

const LIST = `Three ideas for the baker:
- She is paying the guard captain to look away (canon: the captain's note).
- Her oven hides a door to the old crypt.
- She is the Warden's sister.
1. Ask the miller.
2. Visit the crypt at night.`;

const LOOT_TABLE = `${FENCE}
d6  Loot
1   12 gp and a bent spoon
2   Potion of healing (x2)
3   A map: it shows the vault
4   Nothing
${FENCE}`;

const CODE: Record<string, string> = {
  "a fenced python block": `Here you go:\n${FENCE}python\ndef reverse(head):\n    prev = None\n    while head:\n        head.next, prev, head = prev, head, head.next\n    return prev\n${FENCE}`,
  "a fenced block that names no language": `${FENCE}\nconst add = (a, b) => {\n  return a + b;\n};\nconsole.log(add(1, 2));\n${FENCE}`,
  "a fenced sql block": `${FENCE}sql\nSELECT * FROM orders;\n${FENCE}`,
  "a fenced bash line": `${FENCE}bash\nrm -rf old_logs\n${FENCE}`,
  "unfenced typescript": `import { ref } from "vue";\nexport function useCounter() {\n  const count = ref(0);\n  const inc = () => { count.value++; };\n  return { count, inc };\n}`,
  "unfenced python": `def fib(n):\n    if n < 2:\n        return n\n    return fib(n - 1) + fib(n - 2)\n\nclass Foo:\n    pass\n\nimport os`,
  "unfenced c": `#include <stdio.h>\nint main(void) {\n  printf("hi");\n  return 0;\n}`,
  "unfenced java": `public class Main {\n  public static void main(String[] args) {\n    System.out.println("hi");\n  }\n}`,
  "html": `<div class="x">\n<ul>\n<li>one</li>\n</ul>\n</div>`,
};

describe("looksLikeCode", () => {
  it.each(PROSE.map((p) => [p]))("lets ordinary prose through: %s", (text) => {
    expect(looksLikeCode(text)).toBe(false);
  });

  it("lets a stat block through: numbers, colons and brackets are not code", () => {
    expect(looksLikeCode(STAT_BLOCK)).toBe(false);
    expect(looksLikeCode(`${FENCE}\n${STAT_BLOCK}\n${FENCE}`)).toBe(false);
  });

  it("lets a markdown list, and a loot table in a bare fence, through", () => {
    expect(looksLikeCode(LIST)).toBe(false);
    expect(looksLikeCode(LOOT_TABLE)).toBe(false);
  });

  it("lets a fenced house-rule formula through, a sentence with an equals sign being no program", () => {
    expect(looksLikeCode("Passive Perception = 10 + Wisdom (Perception) bonus, so Harl's is 13.")).toBe(false);
  });

  it.each(Object.entries(CODE))("catches %s", (_name, text) => {
    expect(looksLikeCode(text)).toBe(true);
  });

  it("does not call a one-line unfenced answer code, whatever it ends with", () => {
    expect(looksLikeCode("const x = 1;")).toBe(false);
  });
});

describe("checkOutput", () => {
  it("keeps an answer and replaces code with the one sentence", () => {
    expect(checkOutput(PROSE[0])).toEqual({ text: PROSE[0], withheld: false });
    expect(checkOutput(CODE["unfenced python"])).toEqual({ text: ASK_OFF_TOPIC_MESSAGE, withheld: true });
  });

  it("holds no em-dash in the sentence", () => {
    expect(ASK_OFF_TOPIC_MESSAGE).not.toContain("—");
  });
});
