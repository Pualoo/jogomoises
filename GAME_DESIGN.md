# Jogo do Moisés — Design

## Conceito
Jogo multiplayer web 1v1. Os players **não têm boneco**: eles manipulam o mapa usando cartas de habilidade.
No mapa há um **NPC neutro** que foge do perigo. Quem causar o dano final no NPC vence a rodada.

## Regras
- **Partida:** primeiro a vencer 5 rodadas.
- **Rodada:** mapa diferente a cada rodada (estilo Stick Fight). Termina quando o NPC morre.
- **Crédito da morte:** o dano final é do dono da carta que causou o dano (armadilha, queda, esmagamento etc.).
- **Cartas:** sorteadas aleatoriamente pelo jogo pros dois players, cada uma com cooldown. Ninguém monta deck.
- **Mão:** 3 cartas por player, **escondidas** do adversário. Quando uma é usada, chega outra sorteada alguns segundos depois.
- **NPC:** 100 de vida. As armadilhas tiram dano acumulado, e quem der o golpe final vence (dá pra "roubar" a morte). IA simples: anda, pula e desvia de armadilhas.

## Cartas (v1)
| Tipo | Carta | Efeito |
|---|---|---|
| Armadilha | Serra | Lâmina giratória fixa onde o player clicar |
| Armadilha | Bomba | Explode depois de 2s e arremessa tudo no raio |
| Armadilha | Espinhos | Fileira de espinhos no chão |
| Armadilha | Bigorna | Cai do céu e esmaga |
| Plataforma | Sumir | A plataforma clicada some por 3s |
| Plataforma | Empurrar | Arrasta uma plataforma numa direção |
| Mapa | Inclinar | O mapa tomba 20° por 4s |
| Mapa | Terremoto | Tudo treme e o NPC tropeça |

Dano e cooldown de cada carta serão balanceados testando.
- **Lobby:** um player cria a sala e manda o código/link pro outro. Sem login, sem matchmaking.

## Tecnologia
- **Linguagem:** TypeScript (cliente e servidor).
- **Cliente:** Phaser 3, só renderiza e envia as ações (jogar carta, posição do clique).
- **Servidor:** Node.js + Colyseus (salas), autoritativo.
- **Física:** Matter.js rodando no servidor a 60 Hz. O estado é enviado a ~30 Hz e o cliente interpola pra ficar fluido a 60 fps.
- **Visual:** pixel art.
- **Deploy:** VPS com Docker + Caddy (HTTPS/WSS automático).

## Em aberto
- Quantos mapas na primeira versão (sugestão: 3 feitos à mão).
- Números de dano e cooldown de cada carta.
