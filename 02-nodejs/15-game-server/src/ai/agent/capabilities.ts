/**
 * NPC 能力清单 —— 让 Agent 知道自己能做什么,并能在对话/面板中向玩家说明
 */

import { Enemy } from '../../core/Enemy';
import { Player } from '../../core/Player';
import { GameWorld } from '../../core/GameWorld';
import { MsgType } from '../../network/Protocol';
import { trustOf, unlockedFor } from './relation';
import { NpcQuests } from './quest';
import { timeLabel } from './schedule';

export interface NpcCapability {
  id: string;
  label: string;
  hint: string;       // 玩家怎么说才能触发
  available: boolean;
  reason?: string;    // 不可用时的说明
}

const MOB_LABEL: Record<string, string> = {
  slime: '史莱姆', skeleton: '骷髅', demon: '恶魔', orc: '兽人',
  wraith: '幽魂', golem: '魔像', dragon: '龙',
};

/** 玩家询问 NPC 能做什么 */
export const CAPABILITY_CHAT = /能做什么|你会什么|你能帮|有什么能|怎么做|help|能干啥|会哪些|有什么功能|你能干吗|需要什么|怎么委托|有什么委托/i;

export class NpcCapabilities {
  static mobLabel(kind: string): string {
    return MOB_LABEL[kind] ?? kind;
  }

  /** 根据信任/时段/状态列出当前可用能力 */
  static list(enemy: Enemy, playerName: string, world: GameWorld): NpcCapability[] {
    const trust = trustOf(enemy, playerName);
    const unlocks = unlockedFor(enemy, playerName);
    const hasPartner = unlocks.some((u) => u.id === 'partner');
    const night = world.dayPhase === 'night';
    const activeQuest = NpcQuests.activeFor(enemy, playerName);

    const caps: NpcCapability[] = [
      {
        id: 'quest',
        label: activeQuest ? `继续委托「${activeQuest.title}」` : '发布清怪委托',
        hint: activeQuest ? '说「委托进度」查看' : '说「有任务吗」或「委托」',
        available: !night,
        reason: night ? '夜晚我不接新委托,天亮再来' : undefined,
      },
      {
        id: 'hunt',
        label: '代你清怪',
        hint: '说「帮我去打」或「你去清怪」',
        available: !night && (hasPartner || trust >= 30),
        reason: trust < 30 ? '信任不足(≥30),多聊聊再来' : night ? '夜晚我不外出狩猎' : undefined,
      },
      {
        id: 'follow',
        label: '跟随你行动',
        hint: '说「跟着我」',
        available: true,
      },
      {
        id: 'guide',
        label: '带你去找其他 NPC',
        hint: '说「带我去找XX」',
        available: trust >= 20,
        reason: trust < 20 ? '还不太熟,暂不带路' : undefined,
      },
      {
        id: 'escort',
        label: '把其他 NPC 请过来',
        hint: '说「把XX带过来」',
        available: trust >= 40,
        reason: trust < 40 ? '需要更多信任(≥40)' : undefined,
      },
      {
        id: 'chat',
        label: '闲聊、分享传闻',
        hint: '随便聊,我会记住',
        available: true,
      },
    ];

    if (hasPartner) {
      caps.push({
        id: 'assist',
        label: '主动协助你战斗',
        hint: '靠近我即可,高信任时我会顺路清怪',
        available: !night,
        reason: night ? '夜晚我守巢不出' : undefined,
      });
    }

    return caps;
  }

  /** 供 LLM 快照注入的精简能力描述 */
  static summarize(enemy: Enemy, playerName: string, world: GameWorld): string {
    const caps = this.list(enemy, playerName, world);
    const available = caps.filter((c) => c.available).map((c) => `${c.label}(${c.hint})`);
    const locked = caps.filter((c) => !c.available).map((c) => `${c.label}[${c.reason}]`);
    const parts = [`我能:${available.join('、') || '暂无'}`];
    if (locked.length) parts.push(`暂不可用:${locked.join('、')}`);
    parts.push(`性格:${enemy.personality ?? '守卫'};时段:${timeLabel(world.dayPhase)}`);
    return parts.join(';');
  }

  /** 供 Agent 面板展示 */
  static formatForPanel(enemy: Enemy, playerName: string, world: GameWorld): string[] {
    return this.list(enemy, playerName, world).map((c) =>
      c.available ? `${c.label} — ${c.hint}` : `${c.label}(锁定: ${c.reason})`
    );
  }

  /** 聊天询问能力时直接回复(不依赖 LLM) */
  static tryRespondFromChat(
    world: GameWorld,
    enemy: Enemy,
    player: Player,
    text: string
  ): boolean {
    if (!enemy.llmEnabled || !CAPABILITY_CHAT.test(text)) return false;

    const caps = this.list(enemy, player.name, world);
    const available = caps.filter((c) => c.available);
    const locked = caps.filter((c) => !c.available);
    const name = enemy.displayName ?? '我';

    let speech: string;
    if (available.length === 0) {
      speech = `${player.name},现在不是时候……${locked[0]?.reason ?? '稍后再来。'}`;
    } else {
      const top = available.slice(0, 3).map((c) => c.label).join('、');
      const hint = available[0]?.hint ?? '';
      speech = `${player.name},${name}可以帮你:${top}。${hint}`;
      if (locked.length > 0 && locked.length <= 2) {
        speech += `(${locked.map((c) => c.reason).filter(Boolean).join(';')})`;
      }
    }

    this.speak(world, enemy, speech.slice(0, 100));
    return true;
  }

  private static speak(world: GameWorld, enemy: Enemy, text: string): void {
    const chatMsg = {
      from: enemy.displayName ?? `NPC#${enemy.id}`,
      fromId: -enemy.id,
      text,
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
