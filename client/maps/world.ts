/**
 * world.ts — Pixel Campus map data and layout definitions
 *
 * Map: 64 columns × 48 rows, each tile = 32px
 * Total world: 2048 × 1536 pixels
 */

// ─── Tile Type Constants ──────────────────────────────────────────────────────
export const TILES = {
  VOID:       0,  // black border / out-of-bounds
  FLOOR:      1,  // plaza floor (walkable)
  WALL:       2,  // solid wall (blocks movement)
  ROOM_FLOOR: 3,  // coffee shop floor (walkable)
  DOOR:       4,  // doorway (walkable, transition zone)
  DECO:       5,  // decoration prop (not walkable)
} as const;

export type TileType = (typeof TILES)[keyof typeof TILES];

// ─── World Dimensions ─────────────────────────────────────────────────────────
export const TILE_SIZE = 32;
export const MAP_COLS  = 64;
export const MAP_ROWS  = 48;

// ─── Plaza Layout ─────────────────────────────────────────────────────────────
export const PLAZA = {
  col:  16,
  row:  14,
  cols: 32,
  rows: 20,
};

// ─── Coffee Shop Room Definitions ─────────────────────────────────────────────
export interface RoomDef {
  id:    number;
  label: string;
  col:   number;   // top-left column of the room (including walls)
  row:   number;   // top-left row
  cols:  number;   // width in tiles (including walls)
  rows:  number;   // height in tiles (including walls)
  doorCol: number; // column of the door tile (in the room's bottom wall)
  doorRow: number; // row of the door tile
}

export const ROOMS: RoomDef[] = [
  { id: 1, label: 'Group 1', col:  1, row:  1, cols: 12, rows: 11, doorCol:  7, doorRow: 11 },
  { id: 2, label: 'Group 2', col: 26, row:  1, cols: 12, rows: 11, doorCol: 32, doorRow: 11 },
  { id: 3, label: 'Group 3', col: 51, row:  1, cols: 12, rows: 11, doorCol: 57, doorRow: 11 },
  { id: 4, label: 'Group 4', col:  1, row: 36, cols: 12, rows: 11, doorCol:  7, doorRow: 36 },
  { id: 5, label: 'Group 5', col: 26, row: 36, cols: 12, rows: 11, doorCol: 32, doorRow: 36 },
  { id: 6, label: 'Group 6', col: 51, row: 36, cols: 12, rows: 11, doorCol: 57, doorRow: 36 },
];

// ─── Corridor definitions (connecting rooms to plaza) ─────────────────────────
interface CorridorDef {
  startCol: number;
  startRow: number;
  endCol:   number;
  endRow:   number;
}

const CORRIDORS: CorridorDef[] = [
  // Top rooms to plaza top edge
  { startCol: 6,  startRow: 12, endCol: 6,  endRow: 14 }, // G1 → plaza left
  { startCol: 31, startRow: 12, endCol: 31, endRow: 14 }, // G2 → plaza top
  { startCol: 56, startRow: 12, endCol: 56, endRow: 14 }, // G3 → plaza right
  // Bottom rooms to plaza bottom edge
  { startCol: 6,  startRow: 34, endCol: 6,  endRow: 36 }, // G4 → plaza left
  { startCol: 31, startRow: 34, endCol: 31, endRow: 36 }, // G5 → plaza bottom
  { startCol: 56, startRow: 34, endCol: 56, endRow: 36 }, // G6 → plaza right
];

// ─── Map Generator ────────────────────────────────────────────────────────────

/**
 * Generates the full 2D tile array for the Pixel Campus world.
 * Returns a [row][col] indexed 2D array of TileType values.
 */
export function generateMap(): TileType[][] {
  // Initialize everything as VOID
  const map: TileType[][] = Array.from({ length: MAP_ROWS }, () =>
    new Array(MAP_COLS).fill(TILES.VOID)
  );

  // ── Draw outer walkable border paths (the connecting "hallways") ──────────
  // Fill rows 13–35 with floor so left/right corridors have a base
  for (let row = 13; row <= 35; row++) {
    for (let col = 1; col <= 62; col++) {
      map[row][col] = TILES.FLOOR;
    }
  }

  // ── Draw outer walls around the border paths ──────────────────────────────
  for (let row = 13; row <= 35; row++) {
    map[row][0]  = TILES.WALL;
    map[row][63] = TILES.WALL;
  }
  for (let col = 0; col <= 63; col++) {
    map[12][col] = TILES.WALL;
    map[36][col] = TILES.WALL;
  }

  // ── Draw Plaza ────────────────────────────────────────────────────────────
  for (let row = PLAZA.row; row < PLAZA.row + PLAZA.rows; row++) {
    for (let col = PLAZA.col; col < PLAZA.col + PLAZA.cols; col++) {
      // Plaza walls on border
      if (
        row === PLAZA.row || row === PLAZA.row + PLAZA.rows - 1 ||
        col === PLAZA.col || col === PLAZA.col + PLAZA.cols - 1
      ) {
        map[row][col] = TILES.WALL;
      } else {
        map[row][col] = TILES.FLOOR;
      }
    }
  }

  // ── Draw Plaza door openings (top + bottom) ───────────────────────────────
  // Top wall openings at corridor endpoints
  [6, 31, 56].forEach(c => {
    map[PLAZA.row][c]     = TILES.DOOR;
    map[PLAZA.row][c + 1] = TILES.DOOR;
  });
  // Bottom wall openings
  const plazaBottom = PLAZA.row + PLAZA.rows - 1;
  [6, 31, 56].forEach(c => {
    map[plazaBottom][c]     = TILES.DOOR;
    map[plazaBottom][c + 1] = TILES.DOOR;
  });
  // Left / right wall openings
  [22, 23].forEach(r => {
    map[r][PLAZA.col]                   = TILES.DOOR;
    map[r][PLAZA.col + PLAZA.cols - 1]  = TILES.DOOR;
  });

  // ── Draw Corridors ────────────────────────────────────────────────────────
  CORRIDORS.forEach(({ startCol, startRow, endCol, endRow }) => {
    const minR = Math.min(startRow, endRow);
    const maxR = Math.max(startRow, endRow);
    const minC = Math.min(startCol, endCol);
    const maxC = Math.max(startCol, endCol);
    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        map[r][c] = TILES.FLOOR;
      }
    }
  });

  // ── Draw Coffee Shop Rooms ────────────────────────────────────────────────
  ROOMS.forEach((room) => {
    for (let row = room.row; row < room.row + room.rows; row++) {
      for (let col = room.col; col < room.col + room.cols; col++) {
        const isWall =
          row === room.row ||
          row === room.row + room.rows - 1 ||
          col === room.col ||
          col === room.col + room.cols - 1;
        map[row][col] = isWall ? TILES.WALL : TILES.ROOM_FLOOR;
      }
    }
    // Carve door opening
    map[room.doorRow][room.doorCol]     = TILES.DOOR;
    map[room.doorRow][room.doorCol + 1] = TILES.DOOR;
  });

  return map;
}

/**
 * Returns the room definition that contains the given world pixel coordinates,
 * or null if the point is not inside any room interior.
 */
export function getRoomAt(worldX: number, worldY: number): RoomDef | null {
  const col = Math.floor(worldX / TILE_SIZE);
  const row = Math.floor(worldY / TILE_SIZE);
  return ROOMS.find(r =>
    col >= r.col + 1 && col < r.col + r.cols - 1 &&
    row >= r.row + 1 && row < r.row + r.rows - 1
  ) ?? null;
}
