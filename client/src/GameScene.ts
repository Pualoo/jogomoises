import Phaser from "phaser";
import type { Room } from "colyseus.js";
import { ART, artCanvas } from "./pixel";
import { CARDS, CardId, NPC_MAX_HP, PLAYER_COLORS, PLAYER_COLOR_CSS, WORLD_H, WORLD_W } from "../../shared/game";

export interface UiBridge {
  selectedCard(): CardId | null;
  play(x: number, y: number): void;
  cancel(): void;
}

type Plat = { dirt: Phaser.GameObjects.TileSprite; grass: Phaser.GameObjects.TileSprite };

export class GameScene extends Phaser.Scene {
  room!: Room<any>;
  ui!: UiBridge;

  plats: Plat[] = [];
  platRound = -1;
  traps = new Map<string, Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject & any>();
  npc!: Phaser.GameObjects.Sprite;
  hpBar!: Phaser.GameObjects.Graphics;
  aim!: Phaser.GameObjects.Graphics;
  sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  smoke!: Phaser.GameObjects.Particles.ParticleEmitter;
  hurtUntil = 0;
  lastNpcY = 0;
  npcHidden = false;

  constructor() {
    super("game");
  }

  init(data: { room: Room<any>; ui: UiBridge }) {
    this.room = data.room;
    this.ui = data.ui;
  }

  create() {
    for (const [key, rows] of Object.entries(ART)) {
      if (!this.textures.exists(key)) this.textures.addCanvas(key, artCanvas(rows));
    }
    if (!this.textures.exists("px")) {
      const g = this.make.graphics({}, false);
      g.fillStyle(0xffffff).fillRect(0, 0, 3, 3).generateTexture("px", 3, 3).destroy();
    }
    this.drawBackground();

    this.npc = this.add.sprite(0, 0, "npc0").setScale(3).setDepth(5);
    this.hpBar = this.add.graphics().setDepth(6);
    this.aim = this.add.graphics().setDepth(20);

    this.sparks = this.add.particles(0, 0, "px", {
      speed: { min: 80, max: 260 }, lifespan: { min: 250, max: 600 }, scale: { start: 1.6, end: 0 },
      gravityY: 500, emitting: false,
    }).setDepth(15);
    this.smoke = this.add.particles(0, 0, "px", {
      speed: { min: 20, max: 140 }, lifespan: { min: 400, max: 900 }, scale: { start: 4, end: 0 },
      alpha: { start: 0.8, end: 0 }, tint: [0x5c5c8a, 0x3a3a66, 0xffb703], emitting: false,
    }).setDepth(14);

    this.input.mouse?.disableContextMenu();
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (p.rightButtonDown()) return this.ui.cancel();
      if (!this.ui.selectedCard()) return;
      const w = this.cameras.main.getWorldPoint(p.x, p.y);
      this.ui.play(w.x, w.y);
    });

    this.room.onMessage("fx", (fx: any) => this.fx(fx));
  }

  drawBackground() {
    const W = 1600, H = 1100;
    const c = document.createElement("canvas");
    c.width = W / 4; c.height = H / 4; // desenhado em baixa resolução = pixels grandes
    const ctx = c.getContext("2d")!;
    const grd = ctx.createLinearGradient(0, 0, 0, c.height);
    grd.addColorStop(0, "#14142b");
    grd.addColorStop(0.6, "#2a1f4a");
    grd.addColorStop(1, "#3b2456");
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < 90; i++) {
      ctx.fillStyle = Math.random() < 0.2 ? "#ffd166" : "#c9c6e6";
      ctx.globalAlpha = 0.3 + Math.random() * 0.7;
      ctx.fillRect(Math.floor(Math.random() * c.width), Math.floor(Math.random() * c.height * 0.6), 1, 1);
    }
    ctx.globalAlpha = 1;
    const hills = (color: string, base: number, amp: number, freq: number) => {
      ctx.fillStyle = color;
      for (let x = 0; x < c.width; x++) {
        const y = base + Math.sin(x * freq) * amp + Math.sin(x * freq * 2.7) * amp * 0.4;
        ctx.fillRect(x, Math.floor(y), 1, c.height);
      }
    };
    hills("#2b2050", c.height * 0.62, 10, 0.05);
    hills("#1f173b", c.height * 0.72, 7, 0.08);
    this.textures.addCanvas("bg", c);
    this.add.image(WORLD_W / 2, WORLD_H / 2, "bg").setScale(4).setDepth(-10);
  }

  slotOf(sid: string): number {
    return this.room.state.players.get(sid)?.slot ?? 0;
  }

  update(_t: number, dtMs: number) {
    const st = this.room.state;
    if (!st) return;
    const k = 1 - Math.exp(-dtMs / 1000 * 18);
    const lerp = (a: number, b: number) => a + (b - a) * k;

    // Câmera acompanha a inclinação do mapa (a gravidade gira no servidor)
    const cam = this.cameras.main;
    cam.setRotation(lerp((cam as any).rotation, st.tilt));
    cam.setZoom(1 + Math.abs((cam as any).rotation) * 0.3);
    cam.centerOn(WORLD_W / 2, WORLD_H / 2);
    if (st.quake) cam.shake(60, 0.006, true);

    this.syncPlatforms(st, lerp);
    this.syncTraps(st, lerp);
    this.syncNpc(st, lerp);
    this.drawAim(st);
  }

  syncPlatforms(st: any, lerp: (a: number, b: number) => number) {
    if (st.round !== this.platRound || st.platforms.length !== this.plats.length) {
      this.plats.forEach((p) => { p.dirt.destroy(); p.grass.destroy(); });
      this.plats = [];
      st.platforms.forEach((d: any) => {
        const dirt = this.add.tileSprite(d.x, d.y, d.w, d.h, "dirt").setTileScale(2).setDepth(1);
        const grass = this.add.tileSprite(d.x, d.y - d.h / 2 + 3, d.w, 8, "grass").setTileScale(2).setDepth(2);
        this.plats.push({ dirt, grass });
      });
      this.platRound = st.round;
    }
    st.platforms.forEach((d: any, i: number) => {
      const p = this.plats[i];
      if (!p) return;
      p.dirt.x = p.grass.x = lerp(p.dirt.x, d.x);
      const a = d.active ? 1 : 0.18;
      p.dirt.alpha = p.grass.alpha = lerp(p.dirt.alpha, a);
    });
  }

  syncTraps(st: any, lerp: (a: number, b: number) => number) {
    const seen = new Set<string>();
    st.traps.forEach((t: any, id: string) => {
      seen.add(id);
      let s = this.traps.get(id);
      if (!s) {
        s = this.makeTrap(t);
        this.traps.set(id, s);
      }
      s.x = lerp(s.x, t.x);
      s.y = lerp(s.y, t.y);
      if (t.kind === "saw") s.rotation += 0.35;
      else if (t.kind !== "spikes") s.rotation = t.angle;
      if (t.kind === "bomb") s.setTint(Math.floor(this.time.now / 120) % 2 ? 0xffffff : 0xff4d6d);
    });
    for (const [id, s] of this.traps) {
      if (!seen.has(id)) { s.destroy(); this.traps.delete(id); }
    }
  }

  makeTrap(t: any) {
    const color = PLAYER_COLORS[this.slotOf(t.owner)];
    let s: any;
    if (t.kind === "spikes") {
      s = this.add.tileSprite(t.x, t.y, t.w, 12, "spikes").setTileScale(2);
      s.setScale(1, 0.1);
      this.tweens.add({ targets: s, scaleY: 1, duration: 140, ease: "Back.Out" });
    } else if (t.kind === "saw") {
      s = this.add.sprite(t.x, t.y, "saw").setScale(0.5);
      this.tweens.add({ targets: s, scale: 3, duration: 160, ease: "Back.Out" });
    } else if (t.kind === "bomb") {
      s = this.add.sprite(t.x, t.y, "bomb").setScale(3);
    } else {
      s = this.add.sprite(t.x, t.y, "anvil").setScale(2);
    }
    if (t.kind !== "bomb") s.setTint(mixWhite(color, 0.6)); // tom da cor do dono
    s.setDepth(4);
    return s;
  }

  syncNpc(st: any, lerp: (a: number, b: number) => number) {
    const n = st.npc;
    const hidden = st.phase !== "playing" || n.hp <= 0;
    if (hidden !== this.npcHidden) {
      this.npcHidden = hidden;
      if (!hidden) { this.npc.setPosition(n.x, n.y); }
    }
    this.npc.setVisible(!hidden);
    this.hpBar.clear();
    if (hidden) return;

    // Teleporte (respawn): não interpolar
    if (Math.hypot(this.npc.x - n.x, this.npc.y - n.y) > 200) this.npc.setPosition(n.x, n.y);
    this.npc.x = lerp(this.npc.x, n.x);
    this.npc.y = lerp(this.npc.y, n.y);
    if (Math.abs(n.vx) > 0.3) this.npc.setFlipX(n.vx < 0);
    this.npc.rotation = -(this.cameras.main as any).rotation; // fica em pé em relação à gravidade

    const now = this.time.now;
    let tex = "npc0";
    if (now < this.hurtUntil) tex = "npcHurt";
    else if (n.grounded && Math.abs(n.vx) > 0.5) tex = Math.floor(now / 140) % 2 ? "npc1" : "npc0";
    else if (!n.grounded) tex = "npc1";
    this.npc.setTexture(tex);

    const w = 34, x = this.npc.x - w / 2, y = this.npc.y - 28;
    this.hpBar.fillStyle(0x000000, 0.7).fillRect(x - 2, y - 2, w + 4, 8);
    const f = Math.max(0, n.hp / NPC_MAX_HP);
    this.hpBar.fillStyle(f > 0.5 ? 0x7bd16a : f > 0.25 ? 0xffd166 : 0xff4d6d).fillRect(x, y, Math.ceil(w * f), 4);
  }

  drawAim(st: any) {
    const g = this.aim;
    g.clear();
    const card = this.ui.selectedCard();
    if (!card || st.phase !== "playing") return;
    const mySlot = this.slotOf(this.room.sessionId);
    const color = PLAYER_COLORS[mySlot];
    const p = this.input.activePointer;
    const w = this.cameras.main.getWorldPoint(p.x, p.y);
    const target = CARDS[card].target;

    if (target === "side") {
      const left = w.x < WORLD_W / 2;
      g.fillStyle(color, 0.12).fillRect(left ? -400 : WORLD_W / 2, -400, WORLD_W / 2 + 400, WORLD_H + 800);
      return;
    }
    if (target === "platform") {
      const d = st.platforms.find((d: any) =>
        w.x >= d.x - d.w / 2 - 8 && w.x <= d.x + d.w / 2 + 8 && w.y >= d.y - d.h / 2 - 14 && w.y <= d.y + d.h / 2 + 14);
      if (d) {
        g.lineStyle(3, color, 1).strokeRect(d.x - d.w / 2 - 3, d.y - d.h / 2 - 3, d.w + 6, d.h + 6);
        if (card === "push") {
          const dir = w.x < d.x ? 1 : -1;
          g.fillStyle(color, 1).fillTriangle(d.x + dir * 30, d.y, d.x, d.y - 10, d.x, d.y + 10);
        }
      }
      return;
    }
    if (card === "anvil") {
      for (let y = 0; y < WORLD_H; y += 16) g.fillStyle(color, 0.35).fillRect(w.x - 1, y, 3, 8);
    }
    g.lineStyle(2, color, 1);
    g.strokeCircle(w.x, w.y, card === "bomb" ? 130 : 14);
    g.fillStyle(color, 1).fillRect(w.x - 1, w.y - 8, 3, 17).fillRect(w.x - 8, w.y - 1, 17, 3);
  }

  fx(fx: any) {
    const cam = this.cameras.main;
    if (fx.t === "hit") {
      this.hurtUntil = this.time.now + 300;
      this.sparks.setParticleTint(0xff4d6d);
      this.sparks.explode(14, fx.x, fx.y);
      cam.shake(120, 0.006);
      const txt = this.add.text(fx.x, fx.y, `-${fx.amount}`, {
        fontFamily: '"Press Start 2P"', fontSize: "14px", color: PLAYER_COLOR_CSS[this.slotOf(fx.owner)],
        stroke: "#000", strokeThickness: 4,
      }).setOrigin(0.5).setDepth(30);
      this.tweens.add({ targets: txt, y: fx.y - 40, alpha: 0, duration: 800, onComplete: () => txt.destroy() });
    } else if (fx.t === "boom") {
      this.smoke.explode(40, fx.x, fx.y);
      this.sparks.setParticleTint(0xffb703);
      this.sparks.explode(30, fx.x, fx.y);
      cam.shake(250, 0.015);
      const ring = this.add.circle(fx.x, fx.y, 10, 0xffd166, 0.5).setDepth(13);
      this.tweens.add({ targets: ring, radius: 130, alpha: 0, duration: 300, onComplete: () => ring.destroy() });
    } else if (fx.t === "death") {
      this.sparks.setParticleTint(0x9b5de5);
      this.sparks.explode(60, fx.x, fx.y);
      this.smoke.explode(30, fx.x, fx.y);
      cam.shake(400, 0.02);
      cam.flash(150, 255, 255, 255);
    } else if (fx.t === "respawn") {
      this.smoke.explode(20, fx.x, fx.y);
    }
  }
}

function mixWhite(color: number, white: number) {
  const ch = (shift: number) => {
    const c = (color >> shift) & 0xff;
    return Math.round(c + (255 - c) * white) << shift;
  };
  return ch(16) | ch(8) | ch(0);
}
