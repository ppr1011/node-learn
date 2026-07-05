import { GameConfig } from '../config';

export class ExplorationMap {
  readonly cols: number;
  readonly rows: number;
  private readonly data: Uint8Array;

  constructor(cols?: number, rows?: number) {
    this.cols = cols ?? Math.ceil(GameConfig.MAP_WIDTH / GameConfig.FOG_CELL_SIZE);
    this.rows = rows ?? Math.ceil(GameConfig.MAP_HEIGHT / GameConfig.FOG_CELL_SIZE);
    this.data = new Uint8Array(Math.ceil((this.cols * this.rows) / 8));
  }

  isExplored(col: number, row: number): boolean {
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return false;
    const idx = row * this.cols + col;
    return (this.data[idx >> 3] & (1 << (idx & 7))) !== 0;
  }

  private setExplored(col: number, row: number): void {
    const idx = row * this.cols + col;
    this.data[idx >> 3] |= 1 << (idx & 7);
  }

  /** 揭开 (worldX, worldY) 为中心 radius 范围内的格子,返回新揭开的格子数 */
  reveal(worldX: number, worldY: number, radius: number): number {
    const cellSize = GameConfig.FOG_CELL_SIZE;
    const centerCol = Math.floor(worldX / cellSize);
    const centerRow = Math.floor(worldY / cellSize);
    const cellRadius = Math.ceil(radius / cellSize);
    const rSq = radius * radius;
    let revealed = 0;

    for (let dr = -cellRadius; dr <= cellRadius; dr++) {
      for (let dc = -cellRadius; dc <= cellRadius; dc++) {
        const col = centerCol + dc;
        const row = centerRow + dr;
        if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) continue;
        if (this.isExplored(col, row)) continue;

        const cellCenterX = col * cellSize + cellSize / 2;
        const cellCenterY = row * cellSize + cellSize / 2;
        const dx = cellCenterX - worldX;
        const dy = cellCenterY - worldY;
        if (dx * dx + dy * dy <= rSq) {
          this.setExplored(col, row);
          revealed++;
        }
      }
    }
    return revealed;
  }

  toBase64(): string {
    return Buffer.from(this.data).toString('base64');
  }

  static fromBase64(str: string, cols: number, rows: number): ExplorationMap {
    const map = new ExplorationMap(cols, rows);
    const buf = Buffer.from(str, 'base64');
    const len = Math.min(buf.length, map.data.length);
    for (let i = 0; i < len; i++) map.data[i] = buf[i];
    return map;
  }
}
