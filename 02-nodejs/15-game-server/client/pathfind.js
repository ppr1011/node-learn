/**
 * 客户端网格 A* 寻路(绕障碍物)
 * 供自动走到 LLM NPC 附近使用;障碍物数据来自服务端 s_join 下发。
 */
(function (global) {
  const DIRS = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
  ];
  const DIAG = Math.SQRT2;

  class Pathfinder {
    constructor(mapW, mapH, cellSize, playerRadius) {
      this.mapW = mapW;
      this.mapH = mapH;
      this.cellSize = cellSize;
      this.playerRadius = playerRadius;
      this.cols = Math.ceil(mapW / cellSize);
      this.rows = Math.ceil(mapH / cellSize);
      this.blocked = new Uint8Array(this.cols * this.rows);
    }

    rebuild(obstacles) {
      const blocked = new Uint8Array(this.cols * this.rows);
      const cs = this.cellSize;
      const pad = this.playerRadius + 6;

      for (let row = 0; row < this.rows; row++) {
        for (let col = 0; col < this.cols; col++) {
          const cx = col * cs + cs * 0.5;
          const cy = row * cs + cs * 0.5;
          if (cx < pad || cy < pad || cx > this.mapW - pad || cy > this.mapH - pad) {
            blocked[row * this.cols + col] = 1;
            continue;
          }
          for (const o of obstacles) {
            if (Math.hypot(cx - o.x, cy - o.y) < o.radius + pad) {
              blocked[row * this.cols + col] = 1;
              break;
            }
          }
        }
      }
      this.blocked = blocked;
    }

    worldToCell(x, y) {
      return {
        col: Math.min(this.cols - 1, Math.max(0, Math.floor(x / this.cellSize))),
        row: Math.min(this.rows - 1, Math.max(0, Math.floor(y / this.cellSize))),
      };
    }

    cellToWorld(col, row) {
      return {
        x: col * this.cellSize + this.cellSize * 0.5,
        y: row * this.cellSize + this.cellSize * 0.5,
      };
    }

    isWalkable(col, row) {
      if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return false;
      return this.blocked[row * this.cols + col] === 0;
    }

    nearestWalkable(col, row, maxR) {
      if (this.isWalkable(col, row)) return { col, row };
      for (let r = 1; r <= maxR; r++) {
        for (let dc = -r; dc <= r; dc++) {
          for (let dr = -r; dr <= r; dr++) {
            const nc = col + dc, nr = row + dr;
            if (this.isWalkable(nc, nr)) return { col: nc, row: nr };
          }
        }
      }
      return null;
    }

    findPath(sx, sy, gx, gy) {
      let start = this.worldToCell(sx, sy);
      let goal = this.worldToCell(gx, gy);
      const ns = this.nearestWalkable(start.col, start.row, 6);
      const ng = this.nearestWalkable(goal.col, goal.row, 8);
      if (!ns || !ng) return null;
      start = ns;
      goal = ng;

      const size = this.cols * this.rows;
      const gScore = new Float32Array(size);
      gScore.fill(Infinity);
      const fScore = new Float32Array(size);
      fScore.fill(Infinity);
      const cameFrom = new Int32Array(size);
      cameFrom.fill(-1);
      const inOpen = new Uint8Array(size);

      const startIdx = start.row * this.cols + start.col;
      const goalIdx = goal.row * this.cols + goal.col;
      gScore[startIdx] = 0;
      fScore[startIdx] = this.heuristic(start, goal);
      const open = [startIdx];
      inOpen[startIdx] = 1;

      const h = (c) => {
        const col = c % this.cols, row = (c / this.cols) | 0;
        return Math.abs(col - goal.col) + Math.abs(row - goal.row);
      };

      let iterations = 0;
      while (open.length > 0 && iterations++ < 12000) {
        let bestI = 0;
        for (let i = 1; i < open.length; i++) {
          if (fScore[open[i]] < fScore[open[bestI]]) bestI = i;
        }
        const current = open[bestI];
        open[bestI] = open[open.length - 1];
        open.pop();
        inOpen[current] = 0;

        if (current === goalIdx) {
          return this.reconstruct(current, cameFrom, goal);
        }

        const cCol = current % this.cols;
        const cRow = (current / this.cols) | 0;

        for (const [dc, dr] of DIRS) {
          const nc = cCol + dc, nr = cRow + dr;
          if (!this.isWalkable(nc, nr)) continue;
          if (dc !== 0 && dr !== 0) {
            if (!this.isWalkable(cCol + dc, cRow) || !this.isWalkable(cCol, cRow + dr)) continue;
          }
          const ni = nr * this.cols + nc;
          const step = dc !== 0 && dr !== 0 ? DIAG : 1;
          const tg = gScore[current] + step;
          if (tg < gScore[ni]) {
            cameFrom[ni] = current;
            gScore[ni] = tg;
            fScore[ni] = tg + h(ni);
            if (!inOpen[ni]) {
              open.push(ni);
              inOpen[ni] = 1;
            }
          }
        }
      }
      return null;
    }

    heuristic(a, b) {
      const dx = Math.abs(a.col - b.col);
      const dy = Math.abs(a.row - b.row);
      return dx + dy + (DIAG - 2) * Math.min(dx, dy);
    }

    reconstruct(current, cameFrom, goal) {
      const cells = [];
      let c = current;
      while (c !== -1) {
        cells.push(c);
        c = cameFrom[c];
      }
      cells.reverse();
      const path = cells.map((idx) => {
        const col = idx % this.cols;
        const row = (idx / this.cols) | 0;
        return this.cellToWorld(col, row);
      });
      if (path.length > 1) path.shift();
      const last = this.cellToWorld(goal.col, goal.row);
      path.push(last);
      return this.simplify(path);
    }

    simplify(path) {
      if (path.length <= 2) return path;
      const out = [path[0]];
      for (let i = 1; i < path.length - 1; i++) {
        const a = out[out.length - 1];
        const b = path[i];
        const c = path[i + 1];
        const abx = b.x - a.x, aby = b.y - a.y;
        const bcx = c.x - b.x, bcy = c.y - b.y;
        if (Math.abs(abx * bcy - aby * bcx) > 1) out.push(b);
      }
      out.push(path[path.length - 1]);
      return out;
    }
  }

  global.Pathfinder = Pathfinder;
})(typeof window !== 'undefined' ? window : globalThis);
