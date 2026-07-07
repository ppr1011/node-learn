/**
 * LLM 提供方 —— DeepSeek / OpenAI 兼容 API + 无 Key 时的规则 Mock
 */

import { LLMDirective, LLMGameSnapshot, LLMIntent } from './types';
import { logger } from '../../utils/Logger';

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
  const partial = raw.indexOf('{');
  if (partial >= 0) return raw.slice(partial).trim();
  return raw.trim();
}

/** 修复模型常见 JSON 瑕疵:多余括号、截断字符串 */
function repairJsonText(json: string): string {
  let s = json.trim();
  while (s.endsWith('}}')) {
    const trial = s.slice(0, -1);
    try { JSON.parse(trial); s = trial; } catch { break; }
  }
  if (!s.endsWith('}') && s.startsWith('{')) {
    s = s.replace(/,\s*$/, '');
    if (!s.endsWith('}')) s += '}';
  }
  return s;
}

function readStrField(json: string, key: string): string | undefined {
  const re = new RegExp(`"${key}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`);
  const m = json.match(re);
  if (m?.[1]) return m[1].replace(/\\"/g, '"').slice(0, key === 'speech' ? 120 : 200);
  const partial = new RegExp(`"${key}"\\s*:\\s*"([^"]*)`);
  const p = json.match(partial);
  if (p?.[1]) return p[1].slice(0, key === 'speech' ? 120 : 200);
  return undefined;
}

function parseDirective(raw: string, now: number): LLMDirective | null {
  if (!raw.trim()) return null;

  const candidates = [extractJson(raw), raw.trim()];
  for (let json of candidates) {
    json = repairJsonText(json);
    try {
      const parsed = JSON.parse(json) as { intent?: string; speech?: string; reason?: string };
      const intent = normalizeIntent(parsed.intent);
      if (!intent) continue;
      return {
        intent,
        speech: typeof parsed.speech === 'string' ? parsed.speech.slice(0, 120) : undefined,
        reason: typeof parsed.reason === 'string' ? parsed.reason.slice(0, 200) : undefined,
        decidedAt: now,
      };
    } catch {
      // 继续尝试正则兜底(应对 token 截断)
    }

    const intent = normalizeIntent(readStrField(json, 'intent'));
    if (intent) {
      return {
        intent,
        speech: readStrField(json, 'speech'),
        reason: readStrField(json, 'reason'),
        decidedAt: now,
      };
    }
  }
  return null;
}

function normalizeIntent(value: unknown): LLMIntent | null {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase() as LLMIntent;
  return VALID_INTENTS.includes(v) ? v : null;
}

/** 从 Chat Completions 响应体提取文本(兼容 reasoning 字段) */
function extractMessageContent(body: Record<string, unknown>): string {
  const choices = body.choices as Array<{ message?: Record<string, unknown> }> | undefined;
  const msg = choices?.[0]?.message;
  if (!msg) return '';

  const content = msg.content;
  if (typeof content === 'string' && content.trim()) return content.trim();

  const reasoning = msg.reasoning_content;
  if (typeof reasoning === 'string' && reasoning.trim()) return reasoning.trim();

  return '';
}

function buildSystemPrompt(): string {
  return [
    '你是 MMO 游戏里的一名 NPC Agent。你必须只输出一个 JSON 对象,禁止 markdown、禁止解释文字。',
    '必填字段 intent,取值只能是: attack flee patrol taunt hunt follow (小写英文)。',
    '可选字段 speech(中文≤30字) reason(中文≤20字)。',
    '示例:{"intent":"patrol","speech":"你好,冒险者。","reason":"无威胁"}',
    '规则:高信任友善;曾承诺不攻击则勿 attack;残血 flee;说跟着用 follow;附近怪 hunt。',
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
  const archives = s.memoryArchives.length > 0
    ? `人生经历:\n${s.memoryArchives.map((l) => `- ${l}`).join('\n')}`
    : '';
  const rumors = s.zoneRumors.length > 0
    ? `区域传闻:\n${s.zoneRumors.map((l) => `- ${l}`).join('\n')}`
    : '';
  return [
    `NPC:${s.npcName}(${s.kind}),性格:${s.personality}`,
    `自身:HP ${s.hp}/${s.maxHp},状态 ${s.aiState},心情 ${s.moodLabel},坐标(${s.x},${s.y}),区域 ${s.zoneName},天气 ${s.weather}`,
    `附近玩家:${players}`,
    `附近怪物数量:${s.nearbyMobCount}`,
    `正在跟随玩家:${s.isFollowing ? '是' : '否'}`,
    s.activeQuest ? `进行中委托:${s.activeQuest}` : '',
    mem,
    rel,
    archives,
    rumors,
    chat,
  ].filter(Boolean).join('\n');
}

/** DeepSeek / OpenAI 兼容 Chat Completions */
export class OpenAICompatibleProvider implements LLMProvider {
  private readonly mockFallback = new MockLLMProvider();

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
        temperature: 0.3,
        max_tokens: 400,
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
    const body = (await res.json()) as Record<string, unknown>;
    const content = extractMessageContent(body);
    const directive = parseDirective(content, now);
    if (directive) return directive;

    logger.warn(
      `[LLM] 解析失败,回退 Mock | content="${content.slice(0, 100)}"`
    );
    return this.mockFallback.decide(snapshot);
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
