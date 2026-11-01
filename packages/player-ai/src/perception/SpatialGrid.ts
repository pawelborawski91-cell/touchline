import type { PlayerState, Vector2 } from '@touchline/shared';

const DEFAULT_CELL = 10;
/** Cell keys are `cx * KEY_STRIDE + cy`; comfortably wider than any pitch in cells. */
const KEY_STRIDE = 1024;

/**
 * Uniform grid over the players of one tick, so neighbourhood queries visit nearby cells only
 * instead of every player. Iteration order is fixed (cells row by row, players in input order),
 * so results never depend on insertion history.
 */
export class SpatialGrid {
  private readonly cells = new Map<number, number[]>();

  constructor(
    readonly players: readonly PlayerState[],
    readonly cellSize: number = DEFAULT_CELL,
  ) {
    players.forEach((player, index) => {
      const key = this.keyOf(player.position.x, player.position.y);
      const bucket = this.cells.get(key);
      if (bucket) bucket.push(index);
      else this.cells.set(key, [index]);
    });
  }

  private cellOf(value: number): number {
    return Math.floor(value / this.cellSize);
  }

  private keyOf(x: number, y: number): number {
    return (this.cellOf(x) + 1) * KEY_STRIDE + (this.cellOf(y) + 1);
  }

  /** Calls `visit` for every player within `radius` of `point` (with the distance). */
  forEachWithin(
    point: Vector2,
    radius: number,
    visit: (player: PlayerState, distance: number) => void,
  ): void {
    const minCx = this.cellOf(point.x - radius);
    const maxCx = this.cellOf(point.x + radius);
    const minCy = this.cellOf(point.y - radius);
    const maxCy = this.cellOf(point.y + radius);
    const radiusSq = radius * radius;
    for (let cx = minCx; cx <= maxCx; cx += 1) {
      for (let cy = minCy; cy <= maxCy; cy += 1) {
        const bucket = this.cells.get((cx + 1) * KEY_STRIDE + (cy + 1));
        if (!bucket) continue;
        for (const index of bucket) {
          const player = this.players[index]!;
          const dx = player.position.x - point.x;
          const dy = player.position.y - point.y;
          const dSq = dx * dx + dy * dy;
          if (dSq <= radiusSq) visit(player, Math.sqrt(dSq));
        }
      }
    }
  }

  /** Nearest matching player within `maxRadius`; ties go to the smaller id. */
  nearest(
    point: Vector2,
    maxRadius: number,
    accept: (player: PlayerState) => boolean,
  ): { player: PlayerState; distance: number } | null {
    let best: { player: PlayerState; distance: number } | null = null;
    this.forEachWithin(point, maxRadius, (player, distance) => {
      if (!accept(player)) return;
      if (
        !best ||
        distance < best.distance ||
        (distance === best.distance && player.id < best.player.id)
      ) {
        best = { player, distance };
      }
    });
    return best;
  }

  /** Smallest distance from any matching player to the segment `a`–`b` (Infinity if none). */
  clearanceOfSegment(
    a: Vector2,
    b: Vector2,
    margin: number,
    accept: (player: PlayerState) => boolean,
  ): number {
    const centre = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const half = Math.hypot(b.x - a.x, b.y - a.y) / 2;
    let clearance = Infinity;
    this.forEachWithin(centre, half + margin, (player) => {
      if (!accept(player)) return;
      const abx = b.x - a.x;
      const aby = b.y - a.y;
      const lengthSq = abx * abx + aby * aby;
      const px = player.position.x;
      const py = player.position.y;
      const t =
        lengthSq > 0
          ? Math.min(1, Math.max(0, ((px - a.x) * abx + (py - a.y) * aby) / lengthSq))
          : 0;
      const d = Math.hypot(px - (a.x + abx * t), py - (a.y + aby * t));
      if (d < clearance) clearance = d;
    });
    return clearance;
  }
}
