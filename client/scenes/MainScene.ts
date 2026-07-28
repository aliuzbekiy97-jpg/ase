/**
 * scenes/MainScene.ts — Primary Phaser 3 scene for Pixel Campus
 *
 * Responsibilities:
 *  - Render the procedural tile map
 *  - Control local player movement (WASD / arrow keys)
 *  - Sync positions with remote players via Socket.io
 *  - Apply proximity-based audio volume via LiveKit
 *  - Show speaking indicators around avatars
 */

import Phaser from 'phaser';
import type { Socket } from 'socket.io-client';
import {
  TILES, TILE_SIZE, MAP_COLS, MAP_ROWS,
  ROOMS, PLAZA, generateMap,
  type TileType, type RoomDef,
} from '../maps/world';
import {
  getSocket,
  emitMove,
  type PlayerData,
  type MovePayload,
} from '../lib/socket';
import { setProximityVolume, onParticipantSpeaking } from '../lib/livekit';

// ─── Tile Colors ──────────────────────────────────────────────────────────────
const TILE_COLOR: Record<number, number> = {
  [TILES.VOID]:       0x0d1117,
  [TILES.FLOOR]:      0x3d6b4f,   // Plaza: forest green
  [TILES.WALL]:       0x1e2433,   // Dark navy wall
  [TILES.ROOM_FLOOR]: 0x8b7355,   // Warm tan (overridden per room)
  [TILES.DOOR]:       0x5a7a62,   // Slightly lighter than floor
  [TILES.DECO]:       0x2a3545,
};

/** One unique color per coffee shop group */
const ROOM_FLOOR_COLORS: number[] = [
  0xb07070,   // G1 — dusty rose
  0x6e8eb5,   // G2 — slate blue
  0xa89a5e,   // G3 — sandy gold
  0x6a9a72,   // G4 — sage
  0x8e6ea8,   // G5 — lavender
  0x5e9a96,   // G6 — teal
];

// ─── Types ────────────────────────────────────────────────────────────────────
interface RemoteAvatar {
  container:    Phaser.GameObjects.Container;
  body:         Phaser.GameObjects.Rectangle;
  label:        Phaser.GameObjects.Text;
  speakingRing: Phaser.GameObjects.Arc;
  data:         PlayerData;
  cleanupFn?:   () => void;
}

export interface SceneInitData {
  name:   string;
  group:  number;
  color:  string;
}

// ─── Scene ────────────────────────────────────────────────────────────────────
export class MainScene extends Phaser.Scene {
  // Map
  private tileMap!: TileType[][];
  private roomColorMap!: Map<string, number>; // "col,row" → hex color

  // Local player
  private localContainer!:    Phaser.GameObjects.Container;
  private localBody!:         Phaser.GameObjects.Rectangle;
  private localLabel!:        Phaser.GameObjects.Text;
  private localSpeakingRing!: Phaser.GameObjects.Arc;
  private localName  = '';
  private localGroup = 1;
  private localColor = 0x44aaff;

  // Remote players
  private remotePlayers = new Map<string, RemoteAvatar>();

  // Input
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyW!: Phaser.Input.Keyboard.Key;
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyS!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;

  // Networking — initialized in create() to ensure browser environment
  private socket!: Socket;
  private lastEmit = 0;
  private readonly EMIT_INTERVAL = 100; // ms — 10 updates/sec
  private readonly MOVE_SPEED    = 3;   // px/frame

  // Guard flag — true once create() has finished and this.add is available
  private isSceneReady = false;
  // Buffer players that arrive via socket before scene is ready
  private pendingPlayers: PlayerData[] = [];

  constructor() {
    super({ key: 'MainScene' });
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  init(data: SceneInitData) {
    this.localName  = data.name  || 'Player';
    this.localGroup = data.group || 1;
    this.localColor = this.cssColorToHex(data.color || 'hsl(210,70%,60%)');
    // Socket initialized in create() after Phaser has fully booted
  }

  create() {
    // Initialize socket singleton (browser-only)
    this.socket = getSocket();

    // Build and draw map
    this.tileMap      = generateMap();
    this.roomColorMap = this.buildRoomColorMap();
    this.drawTileMap();
    this.drawRoomLabels();

    // Spawn local player in the center of the plaza
    const spawnX = (PLAZA.col + PLAZA.cols / 2) * TILE_SIZE;
    const spawnY = (PLAZA.row + PLAZA.rows / 2) * TILE_SIZE;
    this.createLocalAvatar(spawnX, spawnY);

    // Camera
    this.cameras.main
      .setZoom(1.5)
      .setBounds(0, 0, MAP_COLS * TILE_SIZE, MAP_ROWS * TILE_SIZE)
      .startFollow(this.localContainer, true, 0.09, 0.09);

    // Input keys
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keyW = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.keyA = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyS = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.keyD = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D);

    // Socket events
    this.bindSocketEvents();

    // Tell server we've joined
    this.socket.emit('join', {
      name:  this.localName,
      group: this.localGroup,
      x:     spawnX,
      y:     spawnY,
    });

    // Mark scene as ready and flush any buffered remote players
    this.isSceneReady = true;
    this.pendingPlayers.forEach((p) => this.addRemoteAvatar(p));
    this.pendingPlayers = [];
  }

  update(time: number) {
    this.handleMovement();

    if (time - this.lastEmit >= this.EMIT_INTERVAL) {
      this.lastEmit = time;
      emitMove(this.socket, {
        x: this.localContainer.x,
        y: this.localContainer.y,
      });
      this.updateProximityVolumes();
    }
  }

  // ─── Map Drawing ────────────────────────────────────────────────────────────

  private buildRoomColorMap(): Map<string, number> {
    const m = new Map<string, number>();
    ROOMS.forEach((room, i) => {
      for (let r = room.row + 1; r < room.row + room.rows - 1; r++) {
        for (let c = room.col + 1; c < room.col + room.cols - 1; c++) {
          m.set(`${c},${r}`, ROOM_FLOOR_COLORS[i]);
        }
      }
    });
    return m;
  }

  private drawTileMap() {
    const g = this.add.graphics();
    g.setDepth(0);

    for (let row = 0; row < MAP_ROWS; row++) {
      for (let col = 0; col < MAP_COLS; col++) {
        const tile = this.tileMap[row][col];
        const x    = col * TILE_SIZE;
        const y    = row * TILE_SIZE;

        let color = TILE_COLOR[tile] ?? TILE_COLOR[TILES.VOID];

        // Use per-room color for room floor tiles
        if (tile === TILES.ROOM_FLOOR) {
          color = this.roomColorMap.get(`${col},${row}`) ?? color;
        }

        g.fillStyle(color, 1);
        g.fillRect(x, y, TILE_SIZE, TILE_SIZE);

        // Subtle grid lines for walkable tiles
        if (tile !== TILES.VOID && tile !== TILES.WALL) {
          g.lineStyle(0.5, 0x000000, 0.12);
          g.strokeRect(x, y, TILE_SIZE, TILE_SIZE);
        }

        // Thicker border on walls
        if (tile === TILES.WALL) {
          g.lineStyle(1, 0x000000, 0.4);
          g.strokeRect(x, y, TILE_SIZE, TILE_SIZE);
        }
      }
    }
  }

  private drawRoomLabels() {
    ROOMS.forEach((room, i) => {
      const cx = (room.col + room.cols / 2) * TILE_SIZE;
      const cy = (room.row + 2) * TILE_SIZE;

      // Background pill
      const bg = this.add.graphics().setDepth(1);
      bg.fillStyle(0x000000, 0.55);
      bg.fillRoundedRect(cx - 48, cy - 2, 96, 22, 6);

      this.add.text(cx, cy + 9, room.label, {
        fontFamily: '"Press Start 2P", monospace',
        fontSize:   '9px',
        color:      '#ffffff',
        stroke:     '#000000',
        strokeThickness: 2,
      }).setOrigin(0.5, 0.5).setDepth(2);
    });

    // Plaza label
    const px = (PLAZA.col + PLAZA.cols / 2) * TILE_SIZE;
    const py = (PLAZA.row + 2) * TILE_SIZE;
    const pbg = this.add.graphics().setDepth(1);
    pbg.fillStyle(0x000000, 0.55);
    pbg.fillRoundedRect(px - 60, py - 2, 120, 22, 6);
    this.add.text(px, py + 9, '📚 Plaza', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize:   '9px',
      color:      '#ffd700',
      stroke:     '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5, 0.5).setDepth(2);
  }

  // ─── Local Avatar ────────────────────────────────────────────────────────────

  private createLocalAvatar(x: number, y: number) {
    // Speaking ring (hidden by default)
    this.localSpeakingRing = this.add.arc(0, 0, 20, 0, 360, false, 0x00ff88, 0);
    this.localSpeakingRing.setStrokeStyle(3, 0x00ff88, 1);
    this.localSpeakingRing.setFillStyle(0x00ff88, 0);

    // Avatar body
    this.localBody = this.add.rectangle(0, 0, 24, 24, this.localColor);
    this.localBody.setStrokeStyle(2, 0xffffff, 0.9);

    // "You" indicator dot
    const youDot = this.add.circle(9, -10, 3, 0xffdd00, 1);

    // Name label
    this.localLabel = this.add.text(0, -20, this.localName, {
      fontFamily: '"Press Start 2P", monospace',
      fontSize:   '7px',
      color:      '#ffffff',
      stroke:     '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5, 1);

    this.localContainer = this.add.container(x, y, [
      this.localSpeakingRing,
      this.localBody,
      youDot,
      this.localLabel,
    ]).setDepth(10);
  }

  // ─── Remote Avatars ──────────────────────────────────────────────────────────

  private addRemoteAvatar(data: PlayerData) {
    // Guard: Phaser's this.add is only available after create() completes
    if (!this.isSceneReady) {
      if (!this.pendingPlayers.find((p) => p.id === data.id)) {
        this.pendingPlayers.push(data);
      }
      return;
    }

    if (this.remotePlayers.has(data.id)) {
      this.updateRemoteAvatar(data.id, data.x, data.y);
      return;
    }

    const color = this.cssColorToHex(data.color || 'hsl(200,70%,60%)');

    const speakingRing = this.add.arc(0, 0, 20, 0, 360, false, 0x00ff88, 0);
    speakingRing.setStrokeStyle(3, 0x00ff88, 0);

    const body = this.add.rectangle(0, 0, 24, 24, color);
    body.setStrokeStyle(2, 0xffffff, 0.6);

    const label = this.add.text(0, -20, data.name, {
      fontFamily: '"Press Start 2P", monospace',
      fontSize:   '7px',
      color:      '#eeeeee',
      stroke:     '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5, 1);

    const groupBadge = this.add.text(0, 17, `G${data.group}`, {
      fontFamily: 'monospace',
      fontSize:   '8px',
      color:      '#cccccc',
    }).setOrigin(0.5, 0.5);

    const container = this.add.container(data.x, data.y, [
      speakingRing, body, label, groupBadge,
    ]).setDepth(9);

    // Subscribe to speaking events
    const cleanupFn = onParticipantSpeaking(data.name, (speaking) => {
      const alpha = speaking ? 1 : 0;
      speakingRing.setStrokeStyle(3, 0x00ff88, alpha);
      this.tweens.add({
        targets: speakingRing,
        scaleX: speaking ? 1.15 : 1,
        scaleY: speaking ? 1.15 : 1,
        duration: 150,
        yoyo: true,
      });
    });

    this.remotePlayers.set(data.id, {
      container,
      body,
      label,
      speakingRing,
      data,
      cleanupFn,
    });
  }

  private updateRemoteAvatar(id: string, x: number, y: number, facing?: string) {
    const avatar = this.remotePlayers.get(id);
    if (!avatar) return;
    avatar.data.x = x;
    avatar.data.y = y;
    // Smooth tween to new position
    this.tweens.add({
      targets:  avatar.container,
      x, y,
      duration: 80,
      ease:     'Linear',
    });
  }

  private removeRemoteAvatar(id: string) {
    const avatar = this.remotePlayers.get(id);
    if (!avatar) return;
    avatar.cleanupFn?.();
    avatar.container.destroy();
    this.remotePlayers.delete(id);
  }

  // ─── Socket Events ───────────────────────────────────────────────────────────

  private bindSocketEvents() {
    // Full world snapshot on join
    this.socket.on('playersState', (players: PlayerData[]) => {
      players.forEach((p) => {
        if (p.id !== this.socket.id) this.addRemoteAvatar(p);
      });
    });

    // New player entered
    this.socket.on('playerJoined', (player: PlayerData) => {
      if (player.id !== this.socket.id) this.addRemoteAvatar(player);
    });

    // Position update from existing player
    this.socket.on('playerMoved', (data: MovePayload) => {
      this.updateRemoteAvatar(data.id, data.x, data.y, data.facing);
    });

    // Player left
    this.socket.on('playerLeft', (id: string) => {
      this.removeRemoteAvatar(id);
    });
  }

  // ─── Movement ────────────────────────────────────────────────────────────────

  private handleMovement() {
    let dx = 0;
    let dy = 0;

    if (this.cursors.left.isDown  || this.keyA.isDown) dx -= this.MOVE_SPEED;
    if (this.cursors.right.isDown || this.keyD.isDown) dx += this.MOVE_SPEED;
    if (this.cursors.up.isDown    || this.keyW.isDown) dy -= this.MOVE_SPEED;
    if (this.cursors.down.isDown  || this.keyS.isDown) dy += this.MOVE_SPEED;

    // Normalize diagonal speed
    if (dx !== 0 && dy !== 0) {
      dx *= 0.707;
      dy *= 0.707;
    }

    if (dx === 0 && dy === 0) return;

    const cx = this.localContainer.x;
    const cy = this.localContainer.y;

    // Check collision separately on each axis
    const nx = cx + dx;
    const ny = cy + dy;

    if (!this.isBlocked(nx, cy)) this.localContainer.x = nx;
    if (!this.isBlocked(this.localContainer.x, ny)) this.localContainer.y = ny;

    // Clamp to world bounds
    this.localContainer.x = Phaser.Math.Clamp(
      this.localContainer.x, TILE_SIZE / 2, (MAP_COLS - 0.5) * TILE_SIZE
    );
    this.localContainer.y = Phaser.Math.Clamp(
      this.localContainer.y, TILE_SIZE / 2, (MAP_ROWS - 0.5) * TILE_SIZE
    );
  }

  /** Returns true if the given world position lands on a non-walkable tile */
  private isBlocked(wx: number, wy: number): boolean {
    const col = Math.floor(wx / TILE_SIZE);
    const row = Math.floor(wy / TILE_SIZE);
    if (col < 0 || col >= MAP_COLS || row < 0 || row >= MAP_ROWS) return true;
    const tile = this.tileMap[row]?.[col];
    return tile === TILES.WALL || tile === TILES.VOID || tile === TILES.DECO;
  }

  // ─── Proximity Volume ────────────────────────────────────────────────────────

  private updateProximityVolumes() {
    const lx = this.localContainer.x;
    const ly = this.localContainer.y;

    this.remotePlayers.forEach((avatar) => {
      const dx   = avatar.data.x - lx;
      const dy   = avatar.data.y - ly;
      const dist = Math.sqrt(dx * dx + dy * dy);
      setProximityVolume(avatar.data.name, dist);
    });
  }

  // ─── Utilities ───────────────────────────────────────────────────────────────

  /** Convert an HSL/hex/rgb CSS color string to a Phaser hex integer */
  private cssColorToHex(css: string): number {
    try {
      // Handle hsl() — parse hue to approximate hex
      const hslMatch = css.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
      if (hslMatch) {
        const [, h, s, l] = hslMatch.map(Number);
        const [r, g, b]   = this.hslToRgb(h, s / 100, l / 100);
        return (r << 16) | (g << 8) | b;
      }
      // Handle #rrggbb
      if (css.startsWith('#')) {
        return parseInt(css.slice(1), 16);
      }
    } catch (_) { /* ignore */ }
    return 0x44aaff; // fallback
  }

  private hslToRgb(h: number, s: number, l: number): [number, number, number] {
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => {
      const k = (n + h / 30) % 12;
      return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    };
    return [
      Math.round(f(0) * 255),
      Math.round(f(8) * 255),
      Math.round(f(4) * 255),
    ];
  }

  // ─── Public API (for GameCanvas) ─────────────────────────────────────────────

  /** Called by GameCanvas when the LiveKit speaking state changes for local user */
  public setLocalSpeaking(speaking: boolean) {
    if (!this.localSpeakingRing) return;
    this.localSpeakingRing.setStrokeStyle(3, 0x00ff88, speaking ? 1 : 0);
  }
}
