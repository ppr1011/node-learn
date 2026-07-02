import { Player } from '../core/Player';
import { GameWorld } from '../core/GameWorld';
import { MsgType } from '../network/Protocol';
import { GameConfig } from '../config';

export class CombatSystem {
  constructor(private readonly world: GameWorld) {}

  handleAttack(player: Player): void {
    if (!player.canAttack()) return;

    player.lastAttackTime = Date.now();

    // 找到攻击范围内的最近目标
    const nearby = this.world.aoi.getNearbyPlayers(player);
    let target: Player | null = null;
    let minDist = Infinity;

    for (const other of nearby) {
      if (other.isDead) continue;
      const dist = player.distanceTo(other);
      if (dist <= player.attackRange && dist < minDist) {
        minDist = dist;
        target = other;
      }
    }

    if (!target) return;

    target.takeDamage(player.attackDamage);

    // 通知所有附近玩家
    const damageMsg = {
      attackerId: player.id,
      targetId: target.id,
      damage: player.attackDamage,
      targetHp: target.hp,
    };

    player.session.send(MsgType.DAMAGE, damageMsg);
    target.session.send(MsgType.DAMAGE, damageMsg);

    for (const other of nearby) {
      if (other.id !== player.id && other.id !== target.id) {
        other.session.send(MsgType.DAMAGE, damageMsg);
      }
    }

    // 目标死亡
    if (target.isDead) {
      this.handleDeath(target);
    }
  }

  private handleDeath(player: Player): void {
    const nearby = this.world.aoi.getNearbyPlayers(player);

    player.session.send(MsgType.PLAYER_DEAD, { id: player.id });
    for (const other of nearby) {
      other.session.send(MsgType.PLAYER_DEAD, { id: player.id });
    }

    // 3 秒后复活
    setTimeout(() => {
      if (!this.world.players.has(player.id)) return;

      player.respawn(
        Math.random() * GameConfig.MAP_WIDTH * 0.8 + GameConfig.MAP_WIDTH * 0.1,
        Math.random() * GameConfig.MAP_HEIGHT * 0.8 + GameConfig.MAP_HEIGHT * 0.1
      );

      this.world.aoi.removePlayer(player);
      this.world.aoi.addPlayer(player);

      player.session.send(MsgType.PLAYER_RESPAWN, player.toPublicState());

      const newNearby = this.world.aoi.getNearbyPlayers(player);
      for (const other of newNearby) {
        other.session.send(MsgType.PLAYER_RESPAWN, player.toPublicState());
      }
    }, GameConfig.RESPAWN_TIME);
  }
}
