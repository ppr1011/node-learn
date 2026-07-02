export interface Position {
  x: number;
  y: number;
}

export interface Vector2 {
  x: number;
  y: number;
}

let nextEntityId = 1;

export class Entity {
  readonly id: number;
  position: Position;
  velocity: Vector2 = { x: 0, y: 0 };

  constructor(x: number = 0, y: number = 0) {
    this.id = nextEntityId++;
    this.position = { x, y };
  }

  distanceTo(other: Entity): number {
    const dx = this.position.x - other.position.x;
    const dy = this.position.y - other.position.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
}
