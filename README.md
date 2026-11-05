# Jogo do Moisés

Jogo 1v1 no navegador. Os dois jogadores usam cartas pra mexer no mapa, e quem der o golpe final no alvo vence a rodada. Ganha a partida quem fizer 5 rodadas primeiro. O design completo está em [GAME_DESIGN.md](GAME_DESIGN.md).

## Rodar local
```bash
npm install
npm run dev
```
Abra http://localhost:5173, clique em **Criar sala** e mande o link pro outro jogador (ou abra em outra aba).
Controles: teclas **1/2/3** (ou clique) escolhem a carta, clique no mapa joga a carta, **Esc** ou clique direito cancela.

Teste automático com dois robôs jogando uma partida inteira (com o `npm run dev` rodando):
```bash
npm run bot -w server
```

## Estrutura
- `shared/game.ts`: constantes, cartas e mapas usados pelo cliente e pelo servidor
- `server/src/GameRoom.ts`: sala Colyseus, física (Matter.js), cartas, IA do alvo e rodadas
- `client/src/GameScene.ts`: renderização Phaser, interpolação e efeitos
- `client/src/main.ts`: lobby, mão de cartas e HUD
- `client/src/pixel.ts`: toda a pixel art, desenhada em código

## Deploy na VPS
1. Aponte um domínio pro IP da VPS e troque `seudominio.com` no `Caddyfile`.
2. Na VPS, com o Docker instalado:
```bash
docker compose up -d --build
```
O Caddy cuida do HTTPS. O jogo e o WebSocket ficam no mesmo endereço.
# jogomoises
