// Pixel art desenhada em código: cada string é uma linha, cada caractere é um pixel.

const PAL: Record<string, string> = {
  h: "#5a3a22", s: "#f2c7a0", e: "#1a1a2e", r: "#9b5de5", R: "#7a3fc4", p: "#2d2d44",
  x: "#3a3a4a", m: "#b8c0cc", l: "#e8eef5", d: "#ff4d6d",
  k: "#22223a", w: "#5c5c8a", f: "#ffb703", F: "#ff7a3d",
  b: "#6b4f3a", c: "#57402f", g: "#4caf50", G: "#7bd16a",
  a: "#ffd166", A: "#ff9f1c", W: "#ffffff",
};

export const ART: Record<string, string[]> = {
  npc0: [
    "..hhhh..",
    ".hhhhhh.",
    ".hsesse.",
    ".ssssss.",
    "..rrrr..",
    ".rrRrrr.",
    "s.rrrr.s",
    "..rrrr..",
    "..p..p..",
    ".pp..pp.",
  ],
  npc1: [
    "..hhhh..",
    ".hhhhhh.",
    ".hsesse.",
    ".ssssss.",
    "..rrrr..",
    "s.rRrr.s",
    ".rrrrrr.",
    "..rrrr..",
    "...pp...",
    "..p..p..",
  ],
  npcHurt: [
    "..hhhh..",
    ".hhhhhh.",
    ".hsWssW.",
    ".ssseee.",
    "s.rrrr.s",
    ".rrRrrr.",
    "..rrrr..",
    "..rrrr..",
    ".p....p.",
    "pp....pp",
  ],
  saw: [
    "..x..xx..x..",
    "...xxxxxx...",
    "x.xmmmmmmx.x",
    ".xmmllllmmx.",
    ".xmlmmmmlmx.",
    "xxmlmddmlmxx",
    "xxmlmddmlmxx",
    ".xmlmmmmlmx.",
    ".xmmllllmmx.",
    "x.xmmmmmmx.x",
    "...xxxxxx...",
    "..x..xx..x..",
  ],
  bomb: [
    "......f.f.",
    ".....fFf..",
    "....kk....",
    "..kkkkkk..",
    ".kkkkkkkk.",
    ".kwkkkkkk.",
    ".kwkkkkkk.",
    ".kkkkkkkk.",
    "..kkkkkk..",
    "...kkkk...",
  ],
  spikes: [
    "...ll...",
    "...lm...",
    "..llmm..",
    "..lmmm..",
    ".llmmmm.",
    "xxxxxxxx",
  ],
  anvil: [
    "xxxxxxxxxxxxxxxx",
    "xllllllllllllllx",
    "xmmmmmmmmmmmmmmx",
    "xmmmmmmmmmmmmmmx",
    ".xxxmmmmmmmmxxx.",
    "....xmmmmmmx....",
    "....xmmmmmmx....",
    "....xmmmmmmx....",
    "...xmmmmmmmmx...",
    "..xmmmmmmmmmmx..",
    "..xmmmmmmmmmmx..",
    "..xxxxxxxxxxxx..",
  ],
  dirt: [
    "bbbbcbbb",
    "bcbbbbbb",
    "bbbbbbcb",
    "bbcbbbbb",
    "bbbbbcbb",
    "cbbbbbbb",
    "bbbbcbbb",
    "bbbbbbbc",
  ],
  grass: [
    "GgGggGgg",
    "gggGgggg",
    "gggggggg",
    ".g..g..g",
  ],
  vanish: [
    "....W.....",
    "...WWW....",
    "....W.....",
    "..........",
    "g.g.g.g.g.",
    ".b.b.b.b.b",
  ],
  push: [
    "....a.....",
    "....aa....",
    "aaaaaaa...",
    "....aa....",
    "....a.....",
    "..........",
    "gggggggggg",
    "bbbbbbbbbb",
  ],
  tilt: [
    "........gg",
    "......ggbb",
    "....ggbb..",
    "..ggbb....",
    "ggbb......",
    "bb........",
    "..a.......",
    ".aaa......",
  ],
  quake: [
    "a...a...a.",
    ".a.a.a.a.a",
    "..a...a...",
    "..........",
    "gggggggggg",
    "bbbbbbbbbb",
  ],
};

export function artCanvas(rows: string[], scale = 1): HTMLCanvasElement {
  const w = Math.max(...rows.map((r) => r.length));
  const c = document.createElement("canvas");
  c.width = w * scale;
  c.height = rows.length * scale;
  const ctx = c.getContext("2d")!;
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const col = PAL[row[x]];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  });
  return c;
}

// Ícone da carta como data URL, pra usar no HTML da mão.
export function cardIcon(card: string): string {
  return artCanvas(ART[card], 6).toDataURL();
}
