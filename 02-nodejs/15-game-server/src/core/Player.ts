import { Entity } from './Entity';
import { Session } from '../network/Session';

export class Player extends Entity {
  readonly name: string;
  session: Session;
  hp: number = 100;
  maxHp: number = 100;
  speed: number = 200; // pixels per second
  attackRange: number = 80;
  attackDamage: number = 10;
  attackCooldown: number = 1000; // ms
  lastAttackTime: number = 0;
  isDead: boolean = false;

  // AOI tracking
  aoiCellX: number = -1;
  aoiCellY: number = -1;
  visiblePlayers: Set<number> = new Set();

  constructor(name: string, session: Session) {
    super();
    this.name = name;
    this.session = session;
  }

  canAttack(): boolean {
    return !this.isDead && (Date.now() - this.lastAttackTime) >= this.attackCooldown;
  }

  takeDamage(damage: number): void {
    if (this.isDead) return;
    this.hp = Math.max(0, this.hp - damage);
    if (this.hp <= 0) {
      this.isDead = true;
    }
  }

  respawn(x: number, y: number): void {
    this.hp = this.maxHp;
    this.isDead = false;
    this.position = { x, y };
    this.velocity = { x: 0, y: 0 };
  }

  toPublicState() {
    return {
      id: this.id,
      name: this.name,
      x: Math.round(this.position.x),
      y: Math.round(this.position.y),
      hp: this.hp,
      maxHp: this.maxHp,
      isDead: this.isDead,
    };
  }
}
