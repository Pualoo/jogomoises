import path from "path";
import fs from "fs";
import express from "express";
import { createServer } from "http";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { GameRoom } from "./GameRoom";

const PORT = Number(process.env.GAME_PORT ?? 2567);
const app = express();

// Em produção, o servidor também entrega o cliente já buildado.
const staticDir = process.env.STATIC_DIR ?? path.join(__dirname, "../../client/dist");
if (fs.existsSync(staticDir)) {
  app.use(express.static(staticDir));
  app.get("*", (_req, res) => res.sendFile(path.join(staticDir, "index.html")));
}

const gameServer = new Server({ transport: new WebSocketTransport({ server: createServer(app) }) });
gameServer.define("game", GameRoom);
gameServer.listen(PORT).then(() => console.log(`Servidor rodando na porta ${PORT}`));
