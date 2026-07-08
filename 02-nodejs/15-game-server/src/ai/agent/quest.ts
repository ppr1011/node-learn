/**
 * NPC 委托任务 —— 情境化生成,告别千篇一律的「杀3只XX」
 */

import { Enemy, EnemyKind } from '../../core/Enemy';
import { Player } from '../../core/Player';
import { GameWorld } from '../../core/GameWorld';
import { GameConfig } from '../../config';
import { MsgType } from '../../network/Protocol';
import { ZONES, zoneAt } from '../../core/Zone';
import { NpcMemory } from '../llm/memory';
import { RumorBoard } from './rumor';
import { questXpMultiplier, onQuestComplete, trustOf, isNpcFriend, QUEST_FRIEND_TRUST } from './relation';
import { NpcMood } from './mood';
import { NpcCapabilities } from './capabilities';

export interface NpcQuest {
  mobKind: EnemyKind;
  target: number;
  progress: number;
  rewardXp: number;
  status: 'active' | 'done';
  issuedAt: number;
  title: string;
  description: string;
}

/** 明确的委托意图,去掉泛化的「帮我/帮忙」避免误触 */
const QUEST_CHAT = /有任务|任务吗|接任务|有什么活|需要帮助吗|委托|quest|有什么委托|能接任务/i;
const QUEST_STATUS_CHAT = /委托进度|任务进度|进度怎样|做到哪了/i;
const QUEST_ACCEPT_HUNT = /帮我打|帮我去打|你去打|去清理|帮忙清|代我清/i;

const MOB_LABEL: Record<EnemyKind, string> = {
  slime: '史莱姆', skeleton: '骷髅', demon: '恶魔', orc: '兽人',
  wraith: '幽魂', golem: '魔像', dragon: '龙',
};

interface QuestTemplate {
  title: (mob: string, n: number) => string;
  description: (mob: string, n: number, zone: string) => string;
  issue: (mob: string, n: number, reward: number) => string;
  progress: (mob: string, cur: number, total: number) => string;
  complete: (reward: number) => string;
}

/** 按性格关键词匹配委托话术 */
function pickTemplate(personality: string): QuestTemplate {
  const p = personality.toLowerCase();

  if (/胆小|吐槽|贤者/.test(p)) {
    return {
      title: (mob, n) => `驱赶${n}只${mob}`,
      description: (mob, n, zone) => `${zone}的${mob}太吵了……帮我赶走${n}只,我会感激的。`,
      issue: (mob, n, reward) => `呃……能帮我清理${n}只${mob}吗?完成给你${reward}经验,我请你……在心里感谢!`,
      progress: (mob, cur, total) => `还有${total - cur}只${mob}……加油,我在旁边给你打气!`,
      complete: (reward) => `太好了!${reward}经验给你,我终于能睡个安稳觉了。`,
    };
  }
  if (/斥候|侦察|冷静|寡言/.test(p)) {
    return {
      title: (mob, n) => `${mob}威胁评估`,
      description: (mob, n, zone) => `侦察报告:${zone}出现${n}只${mob}聚集,需清除。`,
      issue: (mob, n, reward) => `任务:歼灭${n}只${mob}。报酬${reward}经验。`,
      progress: (mob, cur, total) => `进度${cur}/${total}。继续。`,
      complete: (reward) => `目标清除。${reward}经验,拿好。`,
    };
  }
  if (/守卫|警惕|照看/.test(p)) {
    return {
      title: (mob, n) => `${mob}清剿令`,
      description: (mob, n, zone) => `这片${zone}的${mob}威胁旅人安全,需清理${n}只。`,
      issue: (mob, n, reward) => `旅人,${mob}泛滥了。帮我清理${n}只,完成酬${reward}经验!`,
      progress: (mob, cur, total) => `干得好!还剩${total - cur}只${mob},继续!`,
      complete: (reward) => `草原又安全了!${reward}经验,这是你应得的。`,
    };
  }

  // 默认
  return {
    title: (mob, n) => `清理${n}只${mob}`,
    description: (mob, n, zone) => `在${zone}清理${n}只${mob}。`,
    issue: (mob, n, reward) => `帮我清理${n}只${mob},完成给你${reward}经验!`,
    progress: (mob, cur, total) => `委托进度:${mob} ${cur}/${total}`,
    complete: (reward) => `干得漂亮!${reward}经验已给你。`,
  };
}

export class NpcQuests {
  static activeFor(enemy: Enemy, playerName: string): NpcQuest | null {
    const q = enemy.llmQuests[playerName];
    return q && q.status === 'active' ? q : null;
  }

  static tryIssueFromChat(
    world: GameWorld,
    enemy: Enemy,
    player: Player,
    text: string,
    now: number
  ): boolean {
    if (!enemy.llmEnabled) return false;

    const existing = this.activeFor(enemy, player.name);

    // 查进度
    if (existing && QUEST_STATUS_CHAT.test(text)) {
      const tpl = pickTemplate(enemy.personality ?? '');
      const mob = MOB_LABEL[existing.mobKind];
      this.notifyQuest(player, enemy, existing);
      this.speak(world, enemy, tpl.progress(mob, existing.progress, existing.target));
      return true;
    }

    // 接委托后玩家说「帮我去打」→ 自动开启代打
    if (existing && QUEST_ACCEPT_HUNT.test(text)) {
      enemy.huntForPlayerId = player.id;
      enemy.huntMobKind = existing.mobKind;
      enemy.followPlayerId = null;
      enemy.llmDirective = { intent: 'hunt', decidedAt: now, reason: '接委托后代打' };
      const mob = MOB_LABEL[existing.mobKind];
      this.speak(world, enemy, `好,这就去清理${mob}!(${existing.progress}/${existing.target})`);
      return true;
    }

    if (!QUEST_CHAT.test(text)) return false;

    if (existing) {
      const tpl = pickTemplate(enemy.personality ?? '');
      const mob = MOB_LABEL[existing.mobKind];
      this.notifyQuest(player, enemy, existing);
      this.speak(
        world,
        enemy,
        `你还有「${existing.title}」:${tpl.progress(mob, existing.progress, existing.target)}`
      );
      return true;
    }

    // 夜晚不接新委托
    if (world.dayPhase === 'night') {
      this.speak(world, enemy, `${player.name},夜晚我不接委托,天亮再来吧。`);
      return true;
    }

    // 只有朋友(信任≥30)才能接新委托
    const trust = trustOf(enemy, player.name);
    if (!isNpcFriend(enemy, player.name)) {
      this.speak(
        world,
        enemy,
        `${player.name},我们还不太熟(信任${trust}/${QUEST_FRIEND_TRUST})。多聊聊、帮帮忙,成为朋友后再给你委托。`
      );
      return true;
    }

    const quest = this.generate(world, enemy, player, now);
    enemy.llmQuests[player.name] = quest;
    NpcMemory.add(
      enemy, 'bond',
      `向${player.name}发布「${quest.title}」`, now, player.name
    );
    this.notifyQuest(player, enemy, quest);

    const tpl = pickTemplate(enemy.personality ?? '');
    const mob = MOB_LABEL[quest.mobKind];
    const issueLine = tpl.issue(mob, quest.target, quest.rewardXp);
    const huntHint = trustOf(enemy, player.name) >= 30
      ? ' 需要我代打就说「帮我去打」。'
      : '';
    this.speak(world, enemy, issueLine + huntHint);
    return true;
  }

  /** 情境化生成委托:看附近怪/区域/信任/传闻 */
  private static generate(
    world: GameWorld,
    enemy: Enemy,
    player: Player,
    now: number
  ): NpcQuest {
    const zone = ZONES[enemy.zoneId] ?? zoneAt(enemy.position.x);
    const mobKind = this.pickMobKind(world, enemy, zone.enemyKinds);
    const trust = trustOf(enemy, player.name);
    const tpl = pickTemplate(enemy.personality ?? '');
    const mob = MOB_LABEL[mobKind];

    // 目标数量:信任高给更多挑战,附近怪多也略增
    const nearbyCount = this.countNearbyMobs(world, enemy, mobKind);
    let target: number = GameConfig.LLM_QUEST_DEFAULT_COUNT;
    if (trust >= 60) target += 1;
    if (trust >= 90) target += 1;
    if (nearbyCount >= 4) target = Math.min(target + 1, 6);
    if (nearbyCount <= 1) target = Math.max(target - 1, 2);

    // 奖励:区域难度 + 数量
    const baseReward = GameConfig.LLM_QUEST_REWARD_XP;
    const rewardXp = Math.round(baseReward * zone.statMult * (0.8 + target * 0.15));

    const title = tpl.title(mob, target);
    const description = tpl.description(mob, target, zone.name);

    // 传闻注入:若区域有该怪相关传闻,写入记忆
    const rumors = RumorBoard.forZone(world, enemy.zoneId, now);
    const mobRumor = rumors.find((r) => r.includes(mob) || r.includes(mobKind));
    if (mobRumor) {
      NpcMemory.add(enemy, 'world', `听闻:${mobRumor.slice(0, 40)}`, now);
    }

    return {
      mobKind,
      target,
      progress: 0,
      rewardXp,
      status: 'active',
      issuedAt: now,
      title,
      description,
    };
  }

  private static pickMobKind(
    world: GameWorld,
    enemy: Enemy,
    zoneKinds: EnemyKind[]
  ): EnemyKind {
    const counts = new Map<EnemyKind, number>();
    for (const other of world.enemies.values()) {
      if (other.id === enemy.id || other.isDead || other.llmEnabled) continue;
      const d = Math.hypot(
        enemy.position.x - other.position.x,
        enemy.position.y - other.position.y
      );
      if (d <= enemy.detectionRange * 3) {
        counts.set(other.kind, (counts.get(other.kind) ?? 0) + 1);
      }
    }

    // 优先选附近最多的怪
    let best: EnemyKind | null = null;
    let bestN = 0;
    for (const [kind, n] of counts) {
      if (n > bestN) { bestN = n; best = kind; }
    }
    if (best && bestN >= 1) return best;

    // 否则从区域怪种中随机
    const pool: EnemyKind[] = zoneKinds.length > 0 ? zoneKinds : ['slime', 'skeleton', 'demon'];
    return pool[Math.floor(Math.random() * pool.length)] ?? 'slime';
  }

  private static countNearbyMobs(world: GameWorld, enemy: Enemy, kind: EnemyKind): number {
    let n = 0;
    for (const other of world.enemies.values()) {
      if (other.id === enemy.id || other.isDead || other.llmEnabled || other.kind !== kind) continue;
      const d = Math.hypot(
        enemy.position.x - other.position.x,
        enemy.position.y - other.position.y
      );
      if (d <= enemy.detectionRange * 3) n++;
    }
    return n;
  }

  static onPlayerKillMob(
    world: GameWorld,
    player: Player,
    mobKind: EnemyKind,
    mobX: number,
    mobY: number,
    now: number
  ): void {
    for (const enemy of world.enemies.values()) {
      if (!enemy.llmEnabled || enemy.isDead) continue;
      this.advanceQuest(world, enemy, player, mobKind, mobX, mobY, now);
    }
  }

  static onNpcKillMob(
    world: GameWorld,
    player: Player,
    npc: Enemy,
    mobKind: EnemyKind,
    mobX: number,
    mobY: number,
    now: number
  ): void {
    if (!npc.llmEnabled || npc.isDead || npc.huntForPlayerId !== player.id) return;
    this.advanceQuest(world, npc, player, mobKind, mobX, mobY, now);
  }

  private static advanceQuest(
    world: GameWorld,
    enemy: Enemy,
    player: Player,
    mobKind: EnemyKind,
    mobX: number,
    mobY: number,
    now: number
  ): void {
    const q = this.activeFor(enemy, player.name);
    if (!q || q.mobKind !== mobKind) return;

    const d = Math.hypot(enemy.position.x - mobX, enemy.position.y - mobY);
    if (d > enemy.detectionRange * 2.5) return;

    q.progress++;
    this.notifyQuest(player, enemy, q);

    if (q.progress < q.target) {
      // 里程碑鼓励(过半时提一句)
      if (q.progress === Math.ceil(q.target / 2)) {
        const tpl = pickTemplate(enemy.personality ?? '');
        const mob = MOB_LABEL[q.mobKind];
        this.speak(world, enemy, tpl.progress(mob, q.progress, q.target));
      }
      return;
    }

    q.status = 'done';
    const mult = questXpMultiplier(enemy, player.name);
    const reward = Math.round(q.rewardXp * mult);
    const levels = player.gainXp(reward);
    onQuestComplete(enemy, player.name, now);
    NpcMood.onQuestComplete(enemy);
    NpcMemory.add(enemy, 'world', `${player.name}完成了「${q.title}」`, now, player.name);
    RumorBoard.add(world, enemy.zoneId, `${player.name}完成了${enemy.displayName}的${q.title}`, now);

    player.session.send(MsgType.XP_GAIN, {
      id: player.id,
      gained: reward,
      xp: player.xp,
      xpToNext: player.xpToNext,
      level: player.level,
      source: 'quest',
    });
    if (levels > 0) {
      player.session.send(MsgType.LEVEL_UP, {
        id: player.id,
        level: player.level,
        hp: player.hp,
        maxHp: player.maxHp,
        xp: player.xp,
        xpToNext: player.xpToNext,
      });
    }

    const tpl = pickTemplate(enemy.personality ?? '');
    this.speak(world, enemy, tpl.complete(reward));
    delete enemy.llmQuests[player.name];
    if (enemy.huntForPlayerId === player.id) {
      enemy.huntMobKind = null;
      enemy.huntForPlayerId = null;
    }
  }

  static formatActive(enemy: Enemy, playerName: string): string | null {
    const q = this.activeFor(enemy, playerName);
    if (!q) return null;
    const mob = NpcCapabilities.mobLabel(q.mobKind);
    const title = q.title ?? `清理${mob}`;
    const desc = q.description ? ` · ${q.description}` : '';
    return `「${title}」${mob} ${q.progress}/${q.target}${desc}`;
  }

  private static notifyQuest(player: Player, enemy: Enemy, q: NpcQuest): void {
    player.session.send(MsgType.NPC_QUEST, {
      npcId: enemy.id,
      npcName: enemy.displayName,
      mobKind: q.mobKind,
      progress: q.progress,
      target: q.target,
      status: q.status,
      title: q.title,
      description: q.description,
    });
  }

  private static speak(world: GameWorld, enemy: Enemy, text: string): void {
    const chatMsg = {
      from: enemy.displayName ?? `NPC#${enemy.id}`,
      fromId: -enemy.id,
      text: text.slice(0, 100),
      x: Math.round(enemy.position.x),
      y: Math.round(enemy.position.y),
    };
    for (const p of world.players.values()) {
      if (p.isDead) continue;
      const d = Math.hypot(p.position.x - enemy.position.x, p.position.y - enemy.position.y);
      if (d <= enemy.detectionRange * 2.5) {
        p.session.send(MsgType.CHAT_MSG, chatMsg);
      }
    }
  }
}
