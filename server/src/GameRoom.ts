import { Room, Client } from "colyseus";
import Matter from "matter-js";
import { GameState, PlayerState, PlatformState, TrapState } from "./schema";
import {
  CardId, CARD_IDS, HAND_SIZE, MAPS, NPC_H, NPC_MAX_HP, NPC_W, PLAY_COOLDOWN_MS,
  REFILL_MS, ROUNDS_TO_WIN, WORLD_H, WORLD_W,
} from "../../shared/game";

const { Engine, Bodies, Body, Composite, Query } = Matter;

const STEP = 1000 / 60;
const TILT_ANGLE = (20 * Math.PI) / 180;
const CREDIT_WINDOW = 6000; // quem mexeu no alvo nos últimos 6s leva a morte por queda

interface Hazard {
  id: string;
  kind: CardId;
  owner: string;
  expires: number;
  x: number;
  y: number;
  w: number;
  body?: Matter.Body;
  fuse?: number;
  lastHit: number;
}

interface PlatRef { body: Matter.Body; state: PlatformState; inWorld: boolean; vanishUntil: number; push?: { from: number; to: number; start: number; dur: number } }

export class GameRoom extends Room<GameState> {
  maxClients = 2;

  engine = Engine.create();
  npc!: Matter.Body;
  plats: PlatRef[] = [];
  hazards = new Map<string, Hazard>();
  hands = new Map<string, (CardId | null)[]>();
  refills: { sid: string; slot: number; at: number }[] = [];
  nextPlayAt = new Map<string, number>();

  time = 0;
  acc = 0;
  seq = 0;
  phaseUntil = 0;
  credit: { owner: string; at: number } | null = null;

  tiltTarget = 0;
  tiltUntil = 0;
  quakeUntil = 0;
  quakeOwner = "";
  nextQuakeKick = 0;

  ai = { dir: 1, stunUntil: 0, nextJump: 0, nextThink: 0 };

  onCreate() {
    this.setState(new GameState());
    this.setPrivate(true); // só entra quem tem o código
    this.setPatchRate(1000 / 30);
    this.setSimulationInterval((dt) => this.tick(dt), STEP);

    this.onMessage("play", (client, msg: { slot: number; x: number; y: number }) => this.playCard(client, msg));
    this.onMessage("ready", (client) => this.sendHand(client.sessionId));
    this.onMessage("rematch", () => {
      if (this.state.phase !== "matchEnd" || this.state.players.size < 2) return;
      this.startMatch();
    });
  }

  onJoin(client: Client, options: { name?: string }) {
    const p = new PlayerState();
    p.name = String(options?.name ?? "").trim().slice(0, 14) || "Jogador";
    const used = new Set([...this.state.players.values()].map((pl) => pl.slot));
    p.slot = used.has(0) ? 1 : 0;
    this.state.players.set(client.sessionId, p);
    this.hands.set(client.sessionId, new Array(HAND_SIZE).fill(null));
    if (this.state.players.size === 2) this.startMatch();
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    this.hands.delete(client.sessionId);
    this.state.phase = "waiting";
    this.state.players.forEach((p) => (p.score = 0));
    this.clearWorld();
  }

  // ---------- Partida e rodadas ----------

  startMatch() {
    this.state.players.forEach((p) => (p.score = 0));
    this.state.round = 0;
    this.state.matchWinner = "";
    this.state.mapIndex = Math.floor(Math.random() * MAPS.length);
    this.startRound();
  }

  startRound() {
    this.state.round++;
    if (this.state.round > 1) this.state.mapIndex = (this.state.mapIndex + 1) % MAPS.length;
    this.buildWorld();
    this.state.roundWinner = "";
    this.state.phase = "playing";
    this.refills = [];
    for (const sid of this.hands.keys()) {
      this.hands.set(sid, Array.from({ length: HAND_SIZE }, () => randomCard()));
      this.nextPlayAt.set(sid, this.time + 800);
      this.sendHand(sid);
    }
  }

  endRound(winner: string) {
    if (this.state.phase !== "playing") return;
    const p = this.state.players.get(winner);
    this.broadcast("fx", { t: "death", x: this.npc.position.x, y: this.npc.position.y });
    this.state.npc.hp = 0;
    this.state.roundWinner = winner;
    if (!p) { this.state.phase = "roundEnd"; this.phaseUntil = this.time + 3000; return; }
    p.score++;
    if (p.score >= ROUNDS_TO_WIN) {
      this.state.matchWinner = winner;
      this.state.phase = "matchEnd";
    } else {
      this.state.phase = "roundEnd";
      this.phaseUntil = this.time + 3000;
    }
  }

  clearWorld() {
    Composite.clear(this.engine.world, false);
    this.plats = [];
    this.hazards.clear();
    this.state.traps.clear();
    this.state.platforms.clear();
    this.state.tilt = 0;
    this.state.quake = false;
    this.tiltTarget = 0;
    this.tiltUntil = 0;
    this.quakeUntil = 0;
    this.credit = null;
  }

  buildWorld() {
    this.clearWorld();
    const map = MAPS[this.state.mapIndex];
    for (const d of map.platforms) {
      const body = Bodies.rectangle(d.x, d.y, d.w, d.h, { isStatic: true, friction: 0.6, label: "plat" });
      const st = new PlatformState();
      Object.assign(st, { x: d.x, y: d.y, w: d.w, h: d.h, active: true });
      this.state.platforms.push(st);
      this.plats.push({ body, state: st, inWorld: true, vanishUntil: 0 });
      Composite.add(this.engine.world, body);
    }
    this.npc = Bodies.rectangle(map.spawn.x, map.spawn.y, NPC_W, NPC_H, {
      inertia: Infinity, friction: 0.02, frictionAir: 0.01, label: "npc", density: 0.002,
    });
    Composite.add(this.engine.world, this.npc);
    this.state.npc.hp = NPC_MAX_HP;
    this.ai = { dir: Math.random() < 0.5 ? -1 : 1, stunUntil: this.time + 500, nextJump: this.time + 1500, nextThink: 0 };
  }

  respawnNpc() {
    const map = MAPS[this.state.mapIndex];
    Body.setPosition(this.npc, map.spawn);
    Body.setVelocity(this.npc, { x: 0, y: 0 });
    this.broadcast("fx", { t: "respawn", x: map.spawn.x, y: map.spawn.y });
  }

  // ---------- Cartas ----------

  sendHand(sid: string) {
    const client = this.clients.find((c) => c.sessionId === sid);
    client?.send("hand", { cards: this.hands.get(sid) });
  }

  playCard(client: Client, msg: { slot: number; x: number; y: number }) {
    const sid = client.sessionId;
    const hand = this.hands.get(sid);
    if (this.state.phase !== "playing" || !hand) return;
    const card = hand[msg.slot];
    const x = Number(msg.x), y = Number(msg.y);
    if (!card || !Number.isFinite(x) || !Number.isFinite(y)) return;
    if (this.time < (this.nextPlayAt.get(sid) ?? 0)) return client.send("denied", { slot: msg.slot });

    const ok = this.applyCard(card, sid, clamp(x, 0, WORLD_W), clamp(y, 0, WORLD_H));
    if (!ok) return client.send("denied", { slot: msg.slot });

    hand[msg.slot] = null;
    this.nextPlayAt.set(sid, this.time + PLAY_COOLDOWN_MS);
    this.refills.push({ sid, slot: msg.slot, at: this.time + REFILL_MS });
    this.sendHand(sid);
    this.broadcast("fx", { t: "card", card, owner: sid, x, y });
  }

  applyCard(card: CardId, owner: string, x: number, y: number): boolean {
    switch (card) {
      case "saw":
        this.addHazard({ kind: "saw", owner, x, y, w: 36, expires: this.time + 6000 });
        return true;
      case "bomb": {
        const body = Bodies.circle(x, y, 13, { restitution: 0.4, friction: 0.3, density: 0.003, label: "bomb" });
        Composite.add(this.engine.world, body);
        this.addHazard({ kind: "bomb", owner, x, y, w: 26, body, fuse: this.time + 2000, expires: this.time + 2100 });
        return true;
      }
      case "spikes": {
        const p = this.platformBelow(x, y);
        if (!p) return false;
        const b = p.body.bounds;
        const w = Math.min(64, b.max.x - b.min.x);
        const sx = clamp(x, b.min.x + w / 2, b.max.x - w / 2);
        this.addHazard({ kind: "spikes", owner, x: sx, y: b.min.y - 6, w, expires: this.time + 7000 });
        return true;
      }
      case "anvil": {
        const body = Bodies.rectangle(x, -30, 34, 24, { density: 0.02, friction: 0.5, label: "anvil" });
        Body.setVelocity(body, { x: 0, y: 4 });
        Composite.add(this.engine.world, body);
        this.addHazard({ kind: "anvil", owner, x, y: -30, w: 34, body, expires: this.time + 5000 });
        return true;
      }
      case "vanish": {
        const p = this.platformAt(x, y);
        if (!p || !p.inWorld) return false;
        Composite.remove(this.engine.world, p.body);
        p.inWorld = false;
        p.state.active = false;
        p.vanishUntil = this.time + 3000;
        if (this.npcNear(p)) this.giveCredit(owner);
        return true;
      }
      case "push": {
        const p = this.platformAt(x, y);
        if (!p || p.push) return false;
        const dir = x < p.body.position.x ? 1 : -1;
        const from = p.body.position.x;
        const to = clamp(from + dir * 170, 0, WORLD_W);
        p.push = { from, to, start: this.time, dur: 500 };
        if (this.npcNear(p)) this.giveCredit(owner);
        return true;
      }
      case "tilt":
        this.tiltTarget = (x < WORLD_W / 2 ? -1 : 1) * TILT_ANGLE;
        this.tiltUntil = this.time + 4000;
        this.giveCredit(owner);
        return true;
      case "quake":
        this.quakeUntil = this.time + 2000;
        this.quakeOwner = owner;
        this.giveCredit(owner);
        return true;
    }
  }

  addHazard(h: Omit<Hazard, "id" | "lastHit">) {
    const id = `h${++this.seq}`;
    this.hazards.set(id, { ...h, id, lastHit: -99999 });
    const t = new TrapState();
    Object.assign(t, { kind: h.kind, x: h.x, y: h.y, w: h.w, owner: h.owner });
    this.state.traps.set(id, t);
  }

  removeHazard(id: string) {
    const h = this.hazards.get(id);
    if (h?.body) Composite.remove(this.engine.world, h.body);
    this.hazards.delete(id);
    this.state.traps.delete(id);
  }

  platformAt(x: number, y: number) {
    return this.plats.find((p) => {
      const b = p.body.bounds;
      return x >= b.min.x - 8 && x <= b.max.x + 8 && y >= b.min.y - 14 && y <= b.max.y + 14;
    });
  }

  platformBelow(x: number, y: number) {
    let best: PlatRef | undefined;
    for (const p of this.plats) {
      if (!p.inWorld) continue;
      const b = p.body.bounds;
      if (x < b.min.x || x > b.max.x || b.min.y < y - 24) continue;
      if (!best || b.min.y < best.body.bounds.min.y) best = p;
    }
    return best;
  }

  npcNear(p: PlatRef) {
    const b = p.body.bounds, n = this.npc.position;
    return n.x > b.min.x - 20 && n.x < b.max.x + 20 && n.y > b.min.y - 80 && n.y < b.max.y + 10;
  }

  giveCredit(owner: string) {
    this.credit = { owner, at: this.time };
  }

  damage(owner: string, amount: number) {
    if (this.state.phase !== "playing") return;
    this.giveCredit(owner);
    this.state.npc.hp = Math.max(0, this.state.npc.hp - amount);
    this.broadcast("fx", { t: "hit", x: this.npc.position.x, y: this.npc.position.y - 20, amount: Math.round(amount), owner });
    if (this.state.npc.hp <= 0) this.endRound(owner);
  }

  knock(fromX: number, fromY: number, power: number, upward = 4) {
    const n = this.npc.position;
    const dx = n.x - fromX, dy = n.y - fromY;
    const d = Math.hypot(dx, dy) || 1;
    Body.setVelocity(this.npc, { x: (dx / d) * power, y: Math.min((dy / d) * power, 0) - upward });
    this.ai.stunUntil = this.time + 450;
  }

  // ---------- Loop ----------

  tick(dt: number) {
    this.acc += dt;
    let steps = 0;
    while (this.acc >= STEP && steps < 4) {
      this.acc -= STEP;
      steps++;
      this.time += STEP;
      this.step();
    }
    if (steps === 4) this.acc = 0;
  }

  step() {
    const st = this.state;
    if (st.phase === "roundEnd" && this.time >= this.phaseUntil) this.startRound();
    if (st.phase !== "playing" && st.phase !== "roundEnd") return;

    // Cartas que chegam
    for (const r of [...this.refills]) {
      if (this.time < r.at) continue;
      const hand = this.hands.get(r.sid);
      if (hand && hand[r.slot] === null) { hand[r.slot] = randomCard(); this.sendHand(r.sid); }
      this.refills.splice(this.refills.indexOf(r), 1);
    }

    // Inclinação: a gravidade gira e o cliente gira a câmera junto
    if (this.time > this.tiltUntil) this.tiltTarget = 0;
    st.tilt += (this.tiltTarget - st.tilt) * 0.08;
    this.engine.gravity.x = Math.sin(st.tilt);
    this.engine.gravity.y = Math.cos(st.tilt);

    // Terremoto
    st.quake = this.time < this.quakeUntil;
    if (st.quake && this.time >= this.nextQuakeKick) {
      this.nextQuakeKick = this.time + 140;
      Body.setVelocity(this.npc, { x: this.npc.velocity.x + rand(-3, 3), y: this.npc.velocity.y - rand(1, 3.5) });
      this.ai.stunUntil = this.time + 300;
      for (const h of this.hazards.values()) {
        if (h.body) Body.setVelocity(h.body, { x: h.body.velocity.x + rand(-2, 2), y: h.body.velocity.y - rand(0, 2) });
      }
    }

    // Plataformas que somem / são empurradas
    for (const p of this.plats) {
      if (!p.inWorld && this.time >= p.vanishUntil) {
        Composite.add(this.engine.world, p.body);
        p.inWorld = true;
        p.state.active = true;
      }
      if (p.push) {
        const k = Math.min(1, (this.time - p.push.start) / p.push.dur);
        const e = 1 - (1 - k) * (1 - k);
        Body.setPosition(p.body, { x: p.push.from + (p.push.to - p.push.from) * e, y: p.body.position.y });
        p.state.x = p.body.position.x;
        if (k >= 1) p.push = undefined;
      }
    }

    if (st.phase === "playing") this.think();
    Engine.update(this.engine, STEP);
    if (st.phase === "playing") this.hazardsStep();

    // Caiu do mapa
    const n = this.npc.position;
    if (st.phase === "playing" && (n.y > WORLD_H + 80 || n.x < -100 || n.x > WORLD_W + 100)) {
      if (this.credit && this.time - this.credit.at < CREDIT_WINDOW) this.endRound(this.credit.owner);
      else this.respawnNpc();
    }

    st.npc.x = n.x;
    st.npc.y = n.y;
    st.npc.vx = this.npc.velocity.x;
  }

  hazardsStep() {
    const n = this.npc.position;
    for (const h of [...this.hazards.values()]) {
      if (h.body) { h.x = h.body.position.x; h.y = h.body.position.y; }
      const t = this.state.traps.get(h.id);
      if (t) { t.x = h.x; t.y = h.y; t.angle = h.body?.angle ?? 0; }

      if (h.kind === "saw") {
        if (Math.hypot(n.x - h.x, n.y - h.y) < 18 + NPC_W / 2 + 4 && this.time - h.lastHit > 600) {
          h.lastHit = this.time;
          this.knock(h.x, h.y, 6);
          this.damage(h.owner, 15);
        }
      } else if (h.kind === "spikes") {
        const overlap = Math.abs(n.x - h.x) < h.w / 2 + NPC_W / 2 - 2 && Math.abs(n.y + NPC_H / 2 - h.y) < 12;
        if (overlap && this.time - h.lastHit > 500) {
          h.lastHit = this.time;
          Body.setVelocity(this.npc, { x: this.npc.velocity.x, y: -7 });
          this.ai.stunUntil = this.time + 300;
          this.damage(h.owner, 12);
        }
      } else if (h.kind === "anvil" && h.body) {
        const falling = h.body.velocity.y > 3.5;
        if (falling && this.time - h.lastHit > 800 && Matter.Collision.collides(h.body, this.npc)) {
          h.lastHit = this.time;
          this.knock(h.x, h.y - 30, 3, 1);
          this.damage(h.owner, 40);
        }
      } else if (h.kind === "bomb" && h.fuse !== undefined && this.time >= h.fuse) {
        this.explode(h);
        continue;
      }
      if (this.state.phase !== "playing") return;
      if (this.time >= h.expires || h.y > WORLD_H + 200) this.removeHazard(h.id);
    }
  }

  explode(h: Hazard) {
    const R = 130;
    this.broadcast("fx", { t: "boom", x: h.x, y: h.y });
    for (const o of this.hazards.values()) {
      if (!o.body || o === h) continue;
      const dx = o.body.position.x - h.x, dy = o.body.position.y - h.y, d = Math.hypot(dx, dy) || 1;
      if (d < R) Body.setVelocity(o.body, { x: (dx / d) * 10, y: (dy / d) * 10 - 3 });
    }
    this.removeHazard(h.id);
    const d = Math.hypot(this.npc.position.x - h.x, this.npc.position.y - h.y);
    if (d < R) {
      const f = 1 - d / R;
      this.knock(h.x, h.y + 10, 6 + 10 * f, 3 + 4 * f);
      this.ai.stunUntil = this.time + 700;
      this.damage(h.owner, 10 + 35 * f);
    }
  }

  // ---------- IA do alvo ----------

  activePlats() {
    return this.plats.filter((p) => p.inWorld).map((p) => p.body);
  }

  think() {
    const npc = this.npc, n = npc.position, ai = this.ai;
    const bodies = this.activePlats();
    const feet = n.y + NPC_H / 2;
    const grounded = npc.velocity.y > -0.5 &&
      Query.region(bodies, { min: { x: n.x - NPC_W / 2 + 2, y: feet }, max: { x: n.x + NPC_W / 2 - 2, y: feet + 3 } }).length > 0;
    this.state.npc.grounded = grounded;
    if (this.time < ai.stunUntil) return;

    // Perigo mais próximo
    let threat: { x: number; d: number } | null = null;
    for (const h of this.hazards.values()) {
      const above = h.kind === "anvil" && h.y < n.y;
      const d = above ? Math.abs(h.x - n.x) : Math.hypot(h.x - n.x, h.y - n.y);
      if (d < 170 && (!threat || d < threat.d)) threat = { x: h.x, d };
    }

    if (threat) {
      ai.dir = n.x >= threat.x ? 1 : -1;
    } else if (this.time >= ai.nextThink) {
      ai.nextThink = this.time + rand(1200, 2800);
      if (Math.random() < 0.35) ai.dir *= -1;
    }

    if (grounded) {
      const probe = { x: n.x + ai.dir * (NPC_W / 2 + 10), y: feet + 12 };
      const groundAhead = Query.point(bodies, probe).length > 0;
      const wantJump = (threat && threat.d < 80) || Math.random() < 0.004;
      if (!groundAhead) {
        // Só pula o buraco se estiver fugindo e tiver chão do outro lado
        const far = Query.region(bodies, {
          min: { x: n.x + ai.dir * 60 - 30, y: feet - 120 }, max: { x: n.x + ai.dir * 140 + 30, y: feet + 40 },
        }).length > 0;
        if (threat && far && this.time >= ai.nextJump) this.jump();
        else ai.dir *= -1;
      } else if (wantJump && this.time >= ai.nextJump) {
        this.jump();
      }
    }

    const speed = threat ? 2.8 : 1.8;
    const target = ai.dir * speed + this.engine.gravity.x * 5; // escorrega com a inclinação
    const control = grounded ? 0.25 : 0.06;
    Body.setVelocity(npc, { x: npc.velocity.x + (target - npc.velocity.x) * control, y: npc.velocity.y });
  }

  jump() {
    Body.setVelocity(this.npc, { x: this.npc.velocity.x, y: -8.5 });
    this.ai.nextJump = this.time + 700;
  }
}

function randomCard(): CardId {
  return CARD_IDS[Math.floor(Math.random() * CARD_IDS.length)];
}
function rand(a: number, b: number) {
  return a + Math.random() * (b - a);
}
function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}
