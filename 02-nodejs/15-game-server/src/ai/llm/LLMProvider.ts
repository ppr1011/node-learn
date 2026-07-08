/**
 * LLM 提供方 —— DeepSeek / OpenAI 兼容 API + 无 Key 时的规则 Mock
 */

import { LLMDirective, LLMGameSnapshot, LLMIntent } from './types';
import { GameConfig } from '../../config';
import { logger } from '../../utils/Logger';

const VALID_INTENTS: LLMIntent[] = [
  'attack', 'flee', 'patrol', 'taunt', 'hunt', 'follow',
  'guide', 'escort', 'follow_npc',
];

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

/**
 * 去掉推理模型(DeepSeek-R1 等)内联的思维链 <think>…</think>,只留最终答案。
 * 未闭合的 <think>(输出被 max_tokens 截断)视为「只有思考、无有效答案」→ 返回空串。
 */
function stripThink(text: string): string {
  let s = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
  const open = s.search(/<think>/i);
  if (open >= 0) s = s.slice(0, open); // 截断的思考,丢弃
  return s.trim();
}

/** 从 Chat Completions 响应体提取文本(兼容 reasoning 字段 + R1 内联思维链) */
function extractMessageContent(body: Record<string, unknown>): string {
  const choices = body.choices as Array<{ message?: Record<string, unknown> }> | undefined;
  const msg = choices?.[0]?.message;
  if (!msg) return '';

  const content = msg.content;
  if (typeof content === 'string') {
    const cleaned = stripThink(content);
    if (cleaned) return cleaned;
  }

  // DeepSeek 官方 reasoner:思考在 reasoning_content,答案在 content;content 空才回退
  const reasoning = msg.reasoning_content;
  if (typeof reasoning === 'string') {
    const cleaned = stripThink(reasoning);
    if (cleaned) return cleaned;
  }

  return '';
}

// 系统提示为常量(每次请求相同),避免重复拼接;DeepSeek 对稳定前缀可命中上下文缓存
const SYSTEM_PROMPT = [
  '你是 MMO 游戏里的一名 NPC Agent。只输出一个 JSON 对象,禁止 markdown 与解释文字。',
  '必填 intent: attack flee patrol taunt hunt follow guide escort follow_npc(小写)。可选 speech(中文≤30字) reason(≤20字)。',
  '玩家发起对话时 speech 必填(对玩家说的台词);reason 仅填内部备注(如"无威胁"),勿把台词写在 reason。',
  '无玩家对话时通常省略 speech(仅 taunt/打招呼才说话),尽量精简输出。',
  '示例(有对话):{"intent":"taunt","speech":"守夜人,听个睡前故事吧","reason":"讲笑话"}',
  '示例(无对话):{"intent":"patrol","reason":"无威胁"}',
  '规则:默认中立,勿主动 attack 玩家;仅当玩家先攻击你或聊天明确挑衅(打你/杀你)才 attack;',
  '高信任友善;曾承诺不攻击勿 attack;残血 flee;邀请跟随用 follow;',
  '勿主动 hunt 清怪;仅玩家明确说「帮我去打/你去打/清怪」且已设置委托狩猎时才 hunt;',
  '玩家名后 [英雄]/[屠夫] 为全局声望,据此定初见语气;夜晚倾向回巢少战;',
  '小队分工:striker 强攻 / flanker 包抄 / bait 引怪,台词体现协作。',
  'A2A协作:玩家说「带我去找XX」用 guide;「把XX带过来」用 escort;被护送方跟随用 follow_npc。',
  '重要:快照中的「我能」字段列出你当前可用能力及触发方式;玩家问能做什么时,用 speech 自然介绍这些能力,勿编造未列出的功能。',
  '回答事实性问题(区域/委托/传闻/信任)时,严格依据快照字段,不确定就说不知道,勿编造。',
  '有进行中委托时,优先在 speech 中提及委托进度并鼓励玩家;接委托用 taunt 而非 hunt(除非玩家明确要求代打)。',
  '委托仅对朋友开放(信任≥30);陌生人请求委托时 speech 说明需先增进信任。',
].join('\n');

/**
 * 用户提示分两档,按是否有玩家对话切换,省 token:
 * - 战术刷新(无对话):只带即时战况 + 少量近况,丢弃关系/经历/传闻等长上下文
 * - 社交(有对话):带完整人格上下文以求扮演到位,但各列表限量截断
 */
function buildUserPrompt(s: LLMGameSnapshot): string {
  const players = s.nearbyPlayers
    .map((p) => `${p.name}${p.tag ? `[${p.tag}]` : ''}(距${Math.round(p.distance)}px,HP${p.hp}/${p.maxHp})`)
    .join(', ') || '无';
  const squad = s.squad
    ? `小队协作:你的分工是 ${s.squad.role},队友 ${s.squad.allies.join('、') || '无'},共同目标 ${s.squad.target}`
    : '';
  const npcs = (s.nearbyNpcs ?? [])
    .map((n) => `${n.name}(距${n.distance}px${n.role ? ',' + n.role : ''})`)
    .join(', ') || '无';
  const head = [
    `NPC:${s.npcName}(${s.kind}),性格:${s.personality}`,
    `自身:HP ${s.hp}/${s.maxHp},状态 ${s.aiState},心情 ${s.moodLabel},区域 ${s.zoneName},天气 ${s.weather},时段 ${s.timeOfDay}`,
    `附近玩家:${players}`,
    `附近NPC:${npcs}`,
    `附近怪物数量:${s.nearbyMobCount}`,
    `正在跟随玩家:${s.isFollowing ? '是' : '否'}`,
    squad,
    s.a2aMission ? `A2A任务:${s.a2aMission}` : '',
    s.activeQuest ? `进行中委托:${s.activeQuest}` : '',
    s.capabilities ? `我能:${s.capabilities}` : '',
  ];

  // 战术刷新:精简上下文,只留 2 条近况维持连贯
  if (!s.chatText) {
    const near = s.memoryRecent.slice(-2);
    return [...head, near.length ? `近况:${near.join(' / ')}` : ''].filter(Boolean).join('\n');
  }

  // 社交:带完整人格上下文,列表限量
  const list = (title: string, arr: string[]) =>
    arr.length ? `${title}:\n${arr.map((l) => `- ${l}`).join('\n')}` : '';
  return [
    ...head,
    list('近期记忆', s.memoryRecent.slice(-6)),
    list('玩家关系', s.playerRelations.slice(0, 3)),
    list('人生经历', s.memoryArchives.slice(-2)),
    list('区域传闻', s.zoneRumors.slice(-3)),
    `玩家${s.chatFrom}说:「${s.chatText}」`,
  ].filter(Boolean).join('\n');
}

export interface HttpProviderOptions {
  label: string;        // 日志标识(cloud / local)
  apiUrl: string;
  model: string;
  maxTokens: number;
  apiKey?: string;      // 本地 Ollama 无需鉴权
  timeoutMs?: number;   // 本地模型慢,超时即回退 Mock,避免阻塞后续决策
}

/**
 * DeepSeek / OpenAI / Ollama 兼容 Chat Completions。
 * 云端与本地共用此类,差异仅在 options(URL / key / 模型 / token 预算 / 超时)。
 * 任何传输或解析失败都自愈到 Mock 规则引擎,保证游戏永不因 LLM 卡住。
 */
export class OpenAICompatibleProvider implements LLMProvider {
  private readonly mockFallback = new MockLLMProvider();

  constructor(private readonly opts: HttpProviderOptions) {}

  async decide(snapshot: LLMGameSnapshot): Promise<LLMDirective> {
    const now = Date.now();
    const controller = new AbortController();
    const timer = this.opts.timeoutMs
      ? setTimeout(() => controller.abort(), this.opts.timeoutMs)
      : null;
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (this.opts.apiKey) headers.Authorization = `Bearer ${this.opts.apiKey}`;

      const res = await fetch(this.opts.apiUrl, {
        method: 'POST',
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          model: this.opts.model,
          temperature: 0.3,
          max_tokens: this.opts.maxTokens,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: buildUserPrompt(snapshot) },
          ],
        }),
      });
      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${errBody.slice(0, 160)}`);
      }
      const body = (await res.json()) as Record<string, unknown>;
      const content = extractMessageContent(body);
      const directive = parseDirective(content, now);
      if (directive) {
        directive.via = `${this.opts.label}:${this.opts.model}`;
        return directive;
      }
      logger.warn(`[LLM:${this.opts.label}] 解析失败,回退 Mock | content="${content.slice(0, 80)}"`);
    } catch (err) {
      // 网络 / 超时 / 非 2xx:降级到 Mock,而非抛出中断决策
      logger.warn(`[LLM:${this.opts.label}] 调用失败,回退 Mock: ${(err as Error).message}`);
    } finally {
      if (timer) clearTimeout(timer);
    }
    const fallback = await this.mockFallback.decide(snapshot);
    fallback.via = `${this.opts.label}:mock(回退)`;
    return fallback;
  }
}

export interface OllamaProviderOptions {
  label: string;
  apiUrl: string;      // Ollama 原生 /api/chat
  model: string;
  maxTokens: number;
  timeoutMs?: number;
  think?: boolean;     // 是否让推理模型思考(默认关闭:Qwen3 等一旦思考会慢到分钟级且常截断)
}

/**
 * Ollama 原生 /api/chat Provider。
 *
 * 为什么不复用 OpenAI 兼容(/v1)端点:Qwen3 这类推理模型在 /v1 上无法关闭思维链,
 * 会把 token 预算全耗在 reasoning 字段、content 恒空(实测 48s 仍无答案)。
 * 原生 /api/chat 支持 `think:false` 一键关思考 → 实测 ~1s 直接吐 JSON。
 */
export class OllamaProvider implements LLMProvider {
  private readonly mockFallback = new MockLLMProvider();

  constructor(private readonly opts: OllamaProviderOptions) {}

  async decide(snapshot: LLMGameSnapshot): Promise<LLMDirective> {
    const now = Date.now();
    const controller = new AbortController();
    const timer = this.opts.timeoutMs
      ? setTimeout(() => controller.abort(), this.opts.timeoutMs)
      : null;
    try {
      const res = await fetch(this.opts.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.opts.model,
          stream: false,
          think: this.opts.think ?? false,
          format: 'json',
          options: { temperature: 0.3, num_predict: this.opts.maxTokens },
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: buildUserPrompt(snapshot) },
          ],
        }),
      });
      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${errBody.slice(0, 160)}`);
      }
      const body = (await res.json()) as { message?: { content?: unknown } };
      const raw = typeof body.message?.content === 'string' ? body.message.content : '';
      const content = stripThink(raw); // think:true 时思考在 message.thinking,content 仍是纯答案;防御性再剥一次
      const directive = parseDirective(content, now);
      if (directive) {
        directive.via = `${this.opts.label}:${this.opts.model}`;
        return directive;
      }
      logger.warn(`[LLM:${this.opts.label}] 解析失败,回退 Mock | content="${content.slice(0, 80)}"`);
    } catch (err) {
      logger.warn(`[LLM:${this.opts.label}] 调用失败,回退 Mock: ${(err as Error).message}`);
    } finally {
      if (timer) clearTimeout(timer);
    }
    const fallback = await this.mockFallback.decide(snapshot);
    fallback.via = `${this.opts.label}:mock(回退)`;
    return fallback;
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

    if (snapshot.isFollowing) {
      return {
        intent: 'follow',
        reason: '维持跟随(Mock)',
        decidedAt: now,
      };
    }

    if (snapshot.a2aMission?.includes('带路')) {
      return { intent: 'guide', reason: '维持带路(Mock)', decidedAt: now };
    }
    if (snapshot.a2aMission?.includes('护送')) {
      return { intent: 'escort', reason: '维持护送(Mock)', decidedAt: now };
    }
    if (snapshot.a2aMission?.includes('被') && snapshot.a2aMission.includes('护送')) {
      return { intent: 'follow_npc', reason: '维持NPC跟随(Mock)', decidedAt: now };
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
      if (/你去打|帮我去打|帮我打|去清理|去打怪|帮忙打|清怪|狩猎|打几只/.test(text)) {
        const questHint = snapshot.activeQuest ? `,${snapshot.activeQuest}` : '';
        return {
          intent: 'hunt',
          speech: `遵命,这就去清怪${questHint}!`,
          reason: '玩家委托狩猎(Mock)',
          decidedAt: now,
        };
      }
      if (/(?:带我去找|带路去|带我去见|带我见|引我去|领我去|带我去)\s*(.+)/.test(text)) {
        const m = text.match(/(?:带我去找|带路去|带我去见|带我见|引我去|领我去|带我去)\s*(.+)/);
        const target = m?.[1]?.trim() ?? '同伴';
        return {
          intent: 'guide',
          speech: `好,我带你去找${target}!`,
          reason: '玩家请求带路(Mock)',
          decidedAt: now,
        };
      }
      if (/(?:把|请|叫|去接)\s*(.+?)(?:带过来|带来|过来|回来|接回来)/.test(text)) {
        const m = text.match(/(?:把|请|叫|去接)\s*(.+?)(?:带过来|带来|过来|回来|接回来)/);
        const target = m?.[1]?.trim() ?? '同伴';
        return {
          intent: 'escort',
          speech: `收到,我去请${target}过来!`,
          reason: '玩家请求护送(Mock)',
          decidedAt: now,
        };
      }
      if (/能做什么|你会什么|你能帮|help|怎么委托|你是谁|这是哪|传闻|委托进度|信任|天气|几点/.test(text)) {
        const caps = snapshot.capabilities ?? '发布委托、跟随、清怪';
        const zone = snapshot.zoneName ?? '这片区域';
        if (/你是谁/.test(text)) {
          return {
            intent: 'taunt',
            speech: `我是${snapshot.npcName},${snapshot.personality}。`,
            reason: '自我介绍(Mock)',
            decidedAt: now,
          };
        }
        if (/这是哪|什么区域/.test(text)) {
          return {
            intent: 'taunt',
            speech: `这里是${zone}。`,
            reason: '介绍区域(Mock)',
            decidedAt: now,
          };
        }
        if (/委托|任务进度/.test(text) && snapshot.activeQuest) {
          return {
            intent: 'taunt',
            speech: `委托:${snapshot.activeQuest}`,
            reason: '委托进度(Mock)',
            decidedAt: now,
          };
        }
        return {
          intent: 'taunt',
          speech: `${snapshot.chatFrom},${caps.slice(0, 60)}`,
          reason: '事实问答(Mock)',
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
      if (/有任务|任务吗|委托|接任务|有什么活/.test(text)) {
        const questHint = snapshot.activeQuest
          ? `,${snapshot.activeQuest}`
          : ',说「有任务吗」就能接';
        return {
          intent: 'taunt',
          speech: snapshot.activeQuest
            ? `委托还在进行${questHint},加油!`
            : `有啊${questHint},要我帮你清怪就说「帮我去打」。`,
          reason: '玩家询问委托(Mock)',
          decidedAt: now,
        };
      }
      if (/打你|杀你|攻击你|揍你|滚开|去死|挑衅/.test(text)) {
        return {
          intent: 'attack',
          speech: '想动手?奉陪!',
          reason: '玩家挑衅(Mock)',
          decidedAt: now,
        };
      }
      return {
        intent: 'taunt',
        speech: `${snapshot.chatFrom},有事尽管说,我是中立的。`,
        reason: '闲聊(Mock)',
        decidedAt: now,
      };
    }

    // 默认中立:靠近玩家也不攻击,最多巡逻
    if (nearest && nearest.distance < 280) {
      return {
        intent: 'patrol',
        reason: '中立巡逻(Mock)',
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
  // 本地优先:开关一开,全部 LLM 决策(战术 + 对话)都走本地 Ollama,不再访问云端
  if (GameConfig.LLM_LOCAL_ENABLED) {
    logger.info(`[LLM] 本地模式:全部决策走本地(${GameConfig.LLM_LOCAL_MODEL} @ ${GameConfig.LLM_LOCAL_URL}, think=${GameConfig.LLM_LOCAL_THINK})`);
    return new OllamaProvider({
      label: 'local',
      apiUrl: GameConfig.LLM_LOCAL_URL,
      model: GameConfig.LLM_LOCAL_MODEL,
      maxTokens: GameConfig.LLM_LOCAL_MAX_TOKENS,
      timeoutMs: GameConfig.LLM_LOCAL_TIMEOUT_MS,
      think: GameConfig.LLM_LOCAL_THINK,
    });
  }

  // 否则:有 key 走云端强模型,无 key 用 Mock 规则引擎兜底
  if (apiKey) {
    return new OpenAICompatibleProvider({
      label: 'cloud',
      apiUrl,
      apiKey,
      model,
      maxTokens: GameConfig.LLM_MAX_OUTPUT_TOKENS,
    });
  }
  return new MockLLMProvider();
}
