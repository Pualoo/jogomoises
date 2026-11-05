import Phaser from "phaser";
import { Client, Room } from "colyseus.js";
import { GameScene, UiBridge } from "./GameScene";
import { cardIcon } from "./pixel";
import { CARDS, CardId, PLAYER_COLOR_CSS, ROUNDS_TO_WIN, WORLD_H, WORLD_W, MAPS } from "../../shared/game";

const $ = (id: string) => document.getElementById(id)!;

const wsUrl = import.meta.env.DEV
  ? `ws://${location.hostname}:2567`
  : `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`;
const client = new Client(wsUrl);
const TIMER_LOOP = location.search.includes("timer=1"); // teste com aba em segundo plano

let room: Room<any> | null = null;
let hand: (CardId | null)[] = [];
let selected: number | null = null;
const icons = new Map<string, string>();
const icon = (c: string) => icons.get(c) ?? (icons.set(c, cardIcon(c)), icons.get(c)!);

// ---------- Lobby ----------

const nameInput = $("name") as HTMLInputElement;
const codeInput = $("code") as HTMLInputElement;
try { nameInput.value = localStorage.getItem("nome") ?? ""; } catch {}
const urlRoom = new URLSearchParams(location.search).get("room");
if (urlRoom) codeInput.value = urlRoom;

function playerName() {
  const n = nameInput.value.trim();
  try { localStorage.setItem("nome", n); } catch {}
  return n;
}

$("create").onclick = () => connect(() => client.create("game", { name: playerName() }));
$("join").onclick = () => {
  const code = codeInput.value.trim();
  if (!code) return showError("Digite o código da sala");
  connect(() => client.joinById(code, { name: playerName() }));
};
$("copy").onclick = () => {
  const link = `${location.origin}${location.pathname}?room=${room?.roomId}`;
  navigator.clipboard?.writeText(link);
  $("copy").textContent = "Copiado!";
};

function showError(msg: string) {
  $("error").textContent = msg;
}

async function connect(fn: () => Promise<Room<any>>) {
  showError("");
  try {
    room = await fn();
  } catch (e: any) {
    showError(e?.message?.includes("not found") ? "Sala não encontrada" : "Não deu pra conectar: " + (e?.message ?? e));
    return;
  }
  history.replaceState(null, "", `?room=${room.roomId}`);
  $("lobby-main").classList.add("hidden");
  $("lobby-wait").classList.remove("hidden");
  $("room-code").textContent = room.roomId;

  room.onMessage("hand", (m: { cards: (CardId | null)[] }) => {
    hand = m.cards;
    if (selected !== null && !hand[selected]) selected = null;
    renderHand();
  });
  room.onMessage("denied", (m: { slot: number }) => {
    const el = $("hand").children[m.slot] as HTMLElement | undefined;
    el?.classList.remove("denied");
    void el?.offsetWidth;
    el?.classList.add("denied");
  });
  room.onMessage("fx", () => {});
  room.onLeave(() => {
    showError("Conexão perdida. Recarregue a página.");
    $("lobby").classList.remove("hidden");
  });

  room.send("ready"); // pede a mão depois de registrar os handlers
  startGame(room);
  setInterval(updateHud, 100);
}

// ---------- Mão de cartas ----------

function renderHand() {
  const el = $("hand");
  el.innerHTML = "";
  hand.forEach((c, i) => {
    const d = document.createElement("div");
    if (!c) {
      d.className = "card empty";
      d.innerHTML = `<span class="k">${i + 1}</span><span class="blink">Carta nova…</span>`;
    } else {
      const def = CARDS[c];
      d.className = "card" + (selected === i ? " selected" : "");
      d.innerHTML = `<span class="k">${i + 1}</span><img src="${icon(c)}" alt=""><span class="n">${def.name}</span>` +
        `<span class="t">${def.type}</span><span class="d">${def.desc}</span>`;
      d.onclick = () => select(i);
    }
    el.appendChild(d);
  });
}

function select(i: number) {
  if (!hand[i]) return;
  selected = selected === i ? null : i;
  renderHand();
}

window.addEventListener("keydown", (e) => {
  if (document.activeElement instanceof HTMLInputElement) return;
  if (["1", "2", "3"].includes(e.key)) select(Number(e.key) - 1);
  if (e.key === "Escape") { selected = null; renderHand(); }
});

const ui: UiBridge = {
  selectedCard: () => (selected !== null ? hand[selected] ?? null : null),
  play(x, y) {
    if (selected === null || !room) return;
    room.send("play", { slot: selected, x, y });
    selected = null;
    renderHand();
  },
  cancel() { selected = null; renderHand(); },
};

// ---------- HUD ----------

let lastHud = "";
function updateHud() {
  const st = room?.state;
  if (!st) return;
  const players = [...st.players.entries()] as [string, any][];
  const bySlot = [0, 1].map((s) => players.find(([, p]) => p.slot === s));
  const me = room!.sessionId;
  const label = (e?: [string, any]) => (e ? (e[0] === me ? `${e[1].name} (você)` : e[1].name) : "…");
  const winnerName = (sid: string) => st.players.get(sid)?.name ?? "Alguém";
  const key = JSON.stringify([st.phase, st.round, st.roundWinner, st.matchWinner, players.map(([k, p]) => [k, p.name, p.score])]);
  if (key === lastHud) return;
  lastHud = key;

  const waiting = st.phase === "waiting";
  $("lobby").classList.toggle("hidden", !waiting);
  for (const id of ["hud", "hand", "hint"]) $(id).classList.toggle("hidden", waiting);

  $("p0").textContent = label(bySlot[0]);
  $("p0").style.color = PLAYER_COLOR_CSS[0];
  $("p1").textContent = label(bySlot[1]);
  $("p1").style.color = PLAYER_COLOR_CSS[1];
  $("score").textContent = `${bySlot[0]?.[1].score ?? 0} × ${bySlot[1]?.[1].score ?? 0}`;
  $("round").textContent = `Rodada ${st.round} · ${MAPS[st.mapIndex]?.name ?? ""} · primeiro a ${ROUNDS_TO_WIN}`;

  const banner = $("banner");
  banner.classList.toggle("hidden", st.phase !== "roundEnd" && st.phase !== "matchEnd");
  const color = PLAYER_COLOR_CSS[st.players.get(st.roundWinner)?.slot ?? 0];
  if (st.phase === "roundEnd") {
    banner.innerHTML = `<span style="color:${color}">${winnerName(st.roundWinner)}</span> levou a rodada!<small>Próximo mapa…</small>`;
  } else if (st.phase === "matchEnd") {
    banner.innerHTML = `<span style="color:${color}">${winnerName(st.matchWinner)}</span> venceu a partida!`;
    const b = document.createElement("button");
    b.textContent = "Revanche";
    b.onclick = () => room?.send("rematch");
    banner.appendChild(b);
  }
}

// ---------- Phaser ----------

function startGame(r: Room<any>) {
  (window as any).game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game",
    width: WORLD_W,
    height: WORLD_H,
    pixelArt: true,
    fps: { forceSetTimeOut: TIMER_LOOP, target: 60 },
    backgroundColor: "#14142b",
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [],
    callbacks: {
      postBoot: (game) => game.scene.add("game", GameScene, true, { room: r, ui }),
    },
  });
}
