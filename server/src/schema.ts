import { Schema, MapSchema, ArraySchema, type } from "@colyseus/schema";

export class PlayerState extends Schema {
  @type("string") name = "";
  @type("uint8") score = 0;
  @type("uint8") slot = 0;
}

export class PlatformState extends Schema {
  @type("float32") x = 0;
  @type("float32") y = 0;
  @type("float32") w = 0;
  @type("float32") h = 0;
  @type("boolean") active = true;
}

export class TrapState extends Schema {
  @type("string") kind = "";
  @type("float32") x = 0;
  @type("float32") y = 0;
  @type("float32") w = 0;
  @type("float32") angle = 0;
  @type("string") owner = "";
}

export class NpcState extends Schema {
  @type("float32") x = 0;
  @type("float32") y = 0;
  @type("float32") vx = 0;
  @type("float32") hp = 100;
  @type("boolean") grounded = false;
}

export class GameState extends Schema {
  @type("string") phase = "waiting"; // waiting | playing | roundEnd | matchEnd
  @type("uint8") round = 0;
  @type("uint8") mapIndex = 0;
  @type("string") roundWinner = "";
  @type("string") matchWinner = "";
  @type("float32") tilt = 0;
  @type("boolean") quake = false;
  @type(NpcState) npc = new NpcState();
  @type([PlatformState]) platforms = new ArraySchema<PlatformState>();
  @type({ map: TrapState }) traps = new MapSchema<TrapState>();
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
}
