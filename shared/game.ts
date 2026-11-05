// Constantes e definições compartilhadas entre cliente e servidor.

export const WORLD_W = 960;
export const WORLD_H = 540;
export const ROUNDS_TO_WIN = 5;
export const HAND_SIZE = 3;
export const NPC_MAX_HP = 100;
export const NPC_W = 22;
export const NPC_H = 30;

export const PLAYER_COLORS = [0xff7a3d, 0x3dd6ff];
export const PLAYER_COLOR_CSS = ["#ff7a3d", "#3dd6ff"];

export type CardId = "saw" | "bomb" | "spikes" | "anvil" | "vanish" | "push" | "tilt" | "quake";
export type CardTarget = "point" | "platform" | "side";

export interface CardDef {
  name: string;
  type: "Armadilha" | "Plataforma" | "Mapa";
  desc: string;
  target: CardTarget;
}

export const CARDS: Record<CardId, CardDef> = {
  saw: { name: "Serra", type: "Armadilha", desc: "Lâmina giratória onde você clicar", target: "point" },
  bomb: { name: "Bomba", type: "Armadilha", desc: "Explode em 2s e arremessa tudo", target: "point" },
  spikes: { name: "Espinhos", type: "Armadilha", desc: "Fileira de espinhos na plataforma abaixo", target: "point" },
  anvil: { name: "Bigorna", type: "Armadilha", desc: "Cai do céu e esmaga", target: "point" },
  vanish: { name: "Sumir", type: "Plataforma", desc: "A plataforma some por 3s", target: "platform" },
  push: { name: "Empurrar", type: "Plataforma", desc: "Empurra a plataforma pro lado oposto do clique", target: "platform" },
  tilt: { name: "Inclinar", type: "Mapa", desc: "Tomba o mapa 20° pro lado clicado por 4s", target: "side" },
  quake: { name: "Terremoto", type: "Mapa", desc: "Tudo treme e o alvo tropeça", target: "side" },
};

export const CARD_IDS = Object.keys(CARDS) as CardId[];

// Tempo até uma carta nova chegar no slot usado (ms) e intervalo mínimo entre jogadas.
export const REFILL_MS = 2500;
export const PLAY_COOLDOWN_MS = 600;

export interface PlatformDef { x: number; y: number; w: number; h: number }
export interface MapDef { name: string; spawn: { x: number; y: number }; platforms: PlatformDef[] }

// Coordenadas são o centro de cada plataforma.
export const MAPS: MapDef[] = [
  {
    name: "Abismo",
    spawn: { x: 480, y: 200 },
    platforms: [
      { x: 230, y: 505, w: 380, h: 40 },
      { x: 750, y: 505, w: 340, h: 40 },
      { x: 200, y: 370, w: 180, h: 20 },
      { x: 760, y: 370, w: 180, h: 20 },
      { x: 480, y: 260, w: 220, h: 20 },
    ],
  },
  {
    name: "Torres",
    spawn: { x: 480, y: 130 },
    platforms: [
      { x: 480, y: 510, w: 600, h: 40 },
      { x: 150, y: 400, w: 130, h: 20 },
      { x: 810, y: 400, w: 130, h: 20 },
      { x: 330, y: 300, w: 140, h: 20 },
      { x: 630, y: 300, w: 140, h: 20 },
      { x: 480, y: 190, w: 160, h: 20 },
    ],
  },
  {
    name: "Ilhas",
    spawn: { x: 480, y: 370 },
    platforms: [
      { x: 120, y: 470, w: 200, h: 30 },
      { x: 480, y: 430, w: 220, h: 30 },
      { x: 840, y: 470, w: 200, h: 30 },
      { x: 300, y: 310, w: 140, h: 20 },
      { x: 660, y: 310, w: 140, h: 20 },
      { x: 480, y: 200, w: 120, h: 20 },
    ],
  },
];
