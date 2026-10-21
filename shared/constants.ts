// Gameplay tuning shared by server (authoritative) and client (prediction/visuals).
export const TILE = 48;
export const TICK_HZ = 30;
export const DT = 1 / TICK_HZ;

export const PLAYER_SPEED = 190; // px/s
export const SLOW_FACTOR = 0.45;
export const DEBT_FACTOR = 0.72;   // DEBT: slower movement
export const DEBT_COOLDOWN_MULT = 1.6; // DEBT: longer ability cooldowns
export const HIT_HW = 13; // hitbox half width (feet box)
export const HIT_HH = 10; // hitbox half height

export const MAX_HP = 3;
export const INVULN_MS = 1600;
export const SPAWN_INVULN_MS = 2500;
export const KNOCKBACK_PX = 34;
export const KO_SELF_REVIVE_MS = 10000;
export const REVIVE_RANGE = 70;
export const REVIVE_MS = 1200;

export const COFFEE_START = 2;
export const COFFEE_MAX = 3;
export const DRINK_MS = 850;
export const COFFEE_COOLDOWN_MS = 1200;

export const CAMERA_COOLDOWN_MS = 6000;
export const CAMERA_RADIUS = 175; // legacy radius (Branka shockwave sizing)
export const STUN_MS = 2700;

export const ICE_COOLDOWN_MS = 260;
export const ICE_MAX_LEN = 8;

export const DISGUST_SLOW_MS = 1400;
export const PICKUP_RANGE = 26;
export const ENEMY_HIT_RANGE = 30;
export const STATION_RANGE = 70;

export const LOBBY_W = 1280;
export const LOBBY_H = 720;
