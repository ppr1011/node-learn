import { Player } from './Player';

/**
 * 九宫格 AOI (Area of Interest) 管理
 *
 * 将地图划分为固定大小的格子，每个玩家只关注周围九宫格内的其他玩家。
 * 当玩家移动跨越格子边界时，触发 enter/leave 事件。
 */
export class AOIManager {
  private cells: Map<string, Set<Player>> = new Map();

  constructor(
    private readonly cellSize: number,
    private readonly mapWidth: number,
    private readonly mapHeight: number
  ) {}

  private cellKey(cx: number, cy: number): string {
    return `${cx},${cy}`;
  }

  private getCellCoords(x: number, y: number): [number, number] {
    return [
      Math.floor(x / this.cellSize),
      Math.floor(y / this.cellSize),
    ];
  }

  private getCell(cx: number, cy: number): Set<Player> {
    const key = this.cellKey(cx, cy);
    let cell = this.cells.get(key);
    if (!cell) {
      cell = new Set();
      this.cells.set(key, cell);
    }
    return cell;
  }

  addPlayer(player: Player): void {
    const [cx, cy] = this.getCellCoords(player.position.x, player.position.y);
    player.aoiCellX = cx;
    player.aoiCellY = cy;
    this.getCell(cx, cy).add(player);
  }

  removePlayer(player: Player): void {
    const cell = this.getCell(player.aoiCellX, player.aoiCellY);
    cell.delete(player);
  }

  updatePlayer(player: Player): { entered: Player[]; left: Player[] } {
    const [newCx, newCy] = this.getCellCoords(player.position.x, player.position.y);
    const oldCx = player.aoiCellX;
    const oldCy = player.aoiCellY;

    if (newCx === oldCx && newCy === oldCy) {
      return { entered: [], left: [] };
    }

    // 玩家跨越了格子边界
    this.getCell(oldCx, oldCy).delete(player);
    player.aoiCellX = newCx;
    player.aoiCellY = newCy;
    this.getCell(newCx, newCy).add(player);

    // 计算旧九宫格和新九宫格的差异
    const oldNeighbors = this.getNeighborPlayers(oldCx, oldCy, player);
    const newNeighbors = this.getNeighborPlayers(newCx, newCy, player);

    const oldSet = new Set(oldNeighbors.map(p => p.id));
    const newSet = new Set(newNeighbors.map(p => p.id));

    const entered = newNeighbors.filter(p => !oldSet.has(p.id));
    const left = oldNeighbors.filter(p => !newSet.has(p.id));

    return { entered, left };
  }

  getNearbyPlayers(player: Player): Player[] {
    return this.getNeighborPlayers(player.aoiCellX, player.aoiCellY, player);
  }

  private getNeighborPlayers(cx: number, cy: number, exclude: Player): Player[] {
    const players: Player[] = [];

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const cell = this.cells.get(this.cellKey(cx + dx, cy + dy));
        if (cell) {
          for (const p of cell) {
            if (p !== exclude) {
              players.push(p);
            }
          }
        }
      }
    }

    return players;
  }
}
