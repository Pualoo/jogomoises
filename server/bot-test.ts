// Teste de carga: dois bots entram numa sala e jogam cartas no alvo sem parar.
import { Client } from "colyseus.js";

async function main() {
  const c = new Client("ws://localhost:2567");
  const a = await c.create<any>("game", { name: "BotA" });
  const b = await c.joinById<any>(a.roomId, { name: "BotB" });
  const played: Record<string, number> = {};
  for (const r of [a, b]) {
    let hand: (string | null)[] = [];
    r.onMessage("hand", (m: any) => (hand = m.cards));
    r.onMessage("fx", () => {});
    r.onMessage("denied", () => (played.denied = (played.denied ?? 0) + 1));
    r.send("ready");
    setInterval(() => {
      const st = r.state;
      if (st.phase !== "playing") return;
      const slot = hand.findIndex((x) => x);
      if (slot < 0) return;
      const card = hand[slot]!;
      played[card] = (played[card] ?? 0) + 1;
      let { x, y } = st.npc;
      if (card === "vanish" || card === "push") y += 25; // plataforma embaixo do alvo
      r.send("play", { slot, x: x + (Math.random() - 0.5) * 30, y });
    }, 700);
  }
  const start = Date.now();
  const iv = setInterval(() => {
    const st = a.state;
    const scores = [...st.players.values()].map((p: any) => `${p.name}=${p.score}`).join(" ");
    console.log(`${((Date.now() - start) / 1000).toFixed(0)}s fase=${st.phase} rodada=${st.round} hp=${st.npc.hp.toFixed(0)} armadilhas=${st.traps.size} ${scores}`);
    if (st.phase === "matchEnd" || Date.now() - start > 90000) {
      console.log("cartas jogadas:", played, "vencedor:", st.players.get(st.matchWinner)?.name);
      clearInterval(iv);
      process.exit(0);
    }
  }, 3000);
}
main().catch((e) => { console.error(e); process.exit(1); });
