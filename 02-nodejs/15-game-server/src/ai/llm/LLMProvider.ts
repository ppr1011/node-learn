/**
 * LLM 提供方 —— DeepSeek / OpenAI 兼容 API + 无 Key 时的规则 Mock
 *
 * 默认接 DeepSeek 官方 API(https://api.deepseek.com/chat/completions)。
 * 未配置 DEEPSEEK_API_KEY 时自动降级为 MockLLMProvider。
 */

import { LLMDirective, LLMGameSnapshot, LLMIntent } from './types';

const VALID_INTENTS: LLMIntent[] = ['attack', 'flee', 'patrol', 'taunt', 'hunt', 'follow'];

export interface LLMProvider {
  decide(snapshot: LLMGameSnapshot): Promise<LLMDirective>;
}

/** 从模型输出中提取 JSON(兼容 markdown 代码块包裹) */
function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) return raw.slice(start, end + 1);
  return raw.trim();
}

function parseDirective(raw: string, now: number): LLMDirective | null {
  try {
    const parsed = JSON.parse(extractJson(raw)) as { intent?: string; speech?: string; reason?: string };
    const intent = parsed.intent as LLMIntent;
    if (!VALID_INTENTS.includes(intent)) return null;
    return {
      intent,
      speech: typeof parsed.speech === 'string' ? parsed.speech.slice(0, 120) : undefined,
      reason: typeof parsed.reason === 'string' ? parsed.reason.slice(0, 200) : undefined,
      decidedAt: now,
    };
  } catch {
    return null;
  }
}

function buildSystemPrompt(): string {
  return [
    '你是 MMO 游戏里的一名 NPC Agent(有独立记忆与性格)。根据世界快照输出 JSON,不要 markdown。',
    '字段: intent(attack|flee|patrol|taunt|hunt|follow), speech(可选,中文,≤40字), reason(可选,简短)。',
    '规则:参考记忆与信任值;对高信任玩家友善(patrol/follow/hunt);对袭击者/仇人警惕或 attack;',
    '玩家曾说「不打你」且信任高时优先 patrol/follow 而非 attack;残血 flee;说跟着用 follow。',
    '只输出一行 JSON。',
  ].join('\n');
}

function buildUserPrompt(s: LLMGameSnapshot): string {
  const players = s.nearbyPlayers
    .map((p) => `${p.name}(距${Math.round(p.distance)}px,HP${p.hp}/${p.maxHp})`)
    .join(', ') || '无';
  const chat = s.chatText ? `玩家${s.chatFrom}说:「${s.chatText}」` : '';
  const mem = s.memoryRecent.length > 0
    ? `近期记忆:\n${s.memoryRecent.map((l) => `- ${l}`).join('\n')}`
    : '近期记忆:无';
  const rel = s.playerRelations.length > 0
    ? `玩家关系:\n${s.playerRelations.map((l) => `- ${l}`).join('\n')}`
    : '玩家关系:无';
  return [
    `NPC:${s.npcName}(${s.kind}),性格:${s.personality}`,
    `自身:HP ${s.hp}/${s.maxHp},状态 ${s.aiState},坐标(${s.x},${s.y}),区域 ${s.zoneName},天气 ${s.weather}`,
    `附近玩家:${players}`,
    `附近怪物数量:${s.nearbyMobCount}`,
    `正在跟随玩家:${s.isFollowing ? '是' : '否'}`,
    mem,
    rel,
    chat,
  ].filter(Boolean).join('\n');
}

/** DeepSeek / OpenAI 兼容 Chat Completions */
export class OpenAICompatibleProvider implements LLMProvider {
  constructor(
    private readonly apiUrl: string,
    private readonly apiKey: string,
    private readonly model: string
  ) {}

  async decide(snapshot: LLMGameSnapshot): Promise<LLMDirective> {
    const now = Date.now();
    const res = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.4,
        max_tokens: 200,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: buildSystemPrompt() },
          { role: 'user', content: buildUserPrompt(snapshot) },
        ],
      }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`LLM HTTP ${res.status}: ${errBody.slice(0, 200)}`);
    }
    const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = body.choices?.[0]?.message?.content?.trim() ?? '';
    const directive = parseDirective(content, now);
    if (!directive) {
      throw new Error(`LLM 返回无法解析: ${content.slice(0, 80)}`);
    }
    return directive;
  }
}

/** 无 API Key 时的规则引擎,模拟大模型决策逻辑 */
export class MockLLMProvider implements LLMProvider {
  async decide(snapshot: LLMGameSnapshot): Promise<LLMDirective> {
    const now = Date.now();
    const hpRatio = snapshot.hp / snapshot.maxHp;
    const nearest = snapshot.nearbyPlayers[0];
    const text = (snapshot.chatText ?? '').toLowerCase();

    if (hpRatio < 0.25 && nearest) {
      return {
        intent: 'flee',
        speech: '……我得先撤了!',
        reason: '残血撤退(Mock)',
        decidedAt: now,
      };
    }

    if (snapshot.nearbyMobCount > 0 && hpRatio > 0.4) {
      return {
        intent: 'hunt',
        speech: '发现怪物,我来清理!',
        reason: '附近刷怪(Mock)',
        decidedAt: now,
      };
    }

    if (snapshot.isFollowing) {
      return {
        intent: 'follow',
        reason: '维持跟随(Mock)',
        decidedAt: now,
      };
    }

    if (snapshot.chatText) {
      const rel = snapshot.playerRelations.find((r) => snapshot.chatFrom && r.startsWith(snapshot.chatFrom));
      const highTrust = rel && /信任([3-9]\d|[1-9]\d{2,})/.test(rel);
      const promisedPeace = snapshot.memoryRecent.some((m) => m.includes('承诺不会攻击'));

      if (/跟着我|跟随|follow|一起走|跟我走|跟上/.test(text)) {
        return {
          intent: 'follow',
          speech: `好的,${snapshot.chatFrom},我跟你走。`,
          reason: '玩家邀请跟随(Mock)',
          decidedAt: now,
        };
      }
      if (/你好|hello|hi|嗨|在吗/.test(text)) {
        const greet = highTrust || promisedPeace
          ? `又见面啦,${snapshot.chatFrom},我还记得你。`
          : `你好呀,${snapshot.chatFrom}。我是${snapshot.npcName},这片草原由我照看。`;
        return {
          intent: promisedPeace || highTrust ? 'follow' : 'patrol',
          speech: greet,
          reason: '友好问候(Mock+记忆)',
          decidedAt: now,
        };
      }
      if (/打|杀|攻击|fight|滚/.test(text)) {
        return {
          intent: 'attack',
          speech: '想动手?奉陪!',
          reason: '挑衅(Mock)',
          decidedAt: now,
        };
      }
      return {
        intent: 'taunt',
        speech: `嗯?${snapshot.chatFrom}刚才说了什么……`,
        reason: '闲聊(Mock)',
        decidedAt: now,
      };
    }

    if (nearest && nearest.distance < 120 && hpRatio > 0.5) {
      return {
        intent: 'attack',
        speech: '别靠太近!',
        reason: '玩家进入威胁距离(Mock)',
        decidedAt: now,
      };
    }

    if (nearest && nearest.distance < 280) {
      return {
        intent: 'taunt',
        speech: nearest.name + ',这片区域可不是闹着玩的。',
        reason: '警戒嘲讽(Mock)',
        decidedAt: now,
      };
    }

    return {
      intent: 'patrol',
      reason: '无目标游荡(Mock)',
      decidedAt: now,
    };
  }
}

export function createLLMProvider(
  apiKey: string,
  apiUrl: string,
  model: string
): LLMProvider {
  if (apiKey) {
    return new OpenAICompatibleProvider(apiUrl, apiKey, model);
  }
  return new MockLLMProvider();
}
