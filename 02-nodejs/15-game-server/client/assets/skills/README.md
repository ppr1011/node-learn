# 技能特效资源（开源 · 序列帧 + UI 图标）

本目录包含两类资源：

1. **`icons/`** — 技能栏 UI 图标（32×32 显示用 PNG）
2. **根目录 `*.png`** — 战斗施法序列帧动画（见下方表）

客户端 `index.html` 中：
- `SKILL_ICONS` → 技能栏图标
- `SKILL_FX` → 施法特效序列帧

缺图时自动回退程序化绘制。

## UI 图标（技能栏）

见 [`icons/README.md`](icons/README.md)。

| 文件 | 来源概要 |
|------|----------|
| `icons/icon-heal.png` | OpenGameArt Painterly Spell Icons（CC-BY-SA） |
| `icons/icon-fireball.png` | 同上 |
| `icons/icon-meteor.png` | AI 生图（像素 RPG 陨石图标） |

## 战斗特效序列帧

| 文件 | 用途 | 帧规格 | 许可 |
|------|------|--------|------|
| `heal.png` | 治疗光环 | 6 帧 × 64×64 | **CC0**（LPC Heal Spell） |
| `fireball.png` | 火球命中爆炸 | 14 帧 × 64×64 | **CC0**（Ansimuz Gothicvania Magic Pack 9 · Fire Bomb） |
| `meteor.png` | 陨石/落雷 AOE | 10 帧 × 64×128 | **CC0**（Ansimuz Magic Pack 9 · Lightning） |
| `spark.png` | 治疗火花点缀 | 7 帧 × 32×32 | **CC0**（Ansimuz Magic Pack 9 · Spark） |
| `flame.png` | 火球飞行拖尾 | Kenney `light_01` | **CC0**（Kenney Particle Pack） |

## 成套开源方案对比（调研结论）

| 方案 | 来源 | 许可 | 特点 | 本项目选用 |
|------|------|------|------|:---:|
| **Kenney Particle Pack** | [kenney.nl/assets/particle-pack](https://kenney.nl/assets/particle-pack) | CC0 | 80+ 粒子/光点 PNG，与现有天气/武器素材统一 | ✅ 飞行拖尾 |
| **Gothicvania Magic Pack 9** | [OpenGameArt](https://opengameart.org/content/gothicvania-magic-pack-9) | CC0 | 4 套完整法术序列帧（火/雷/暗/火花） | ✅ 主特效 |
| **LPC Heal Spell** | [LPC OGA](https://lpc.opengameart.org/content/heal-spell) | CC0 | 经典治疗 6 帧环 | ✅ 治疗 |
| **DevWizard Pixel Art Spells** | [OpenGameArt](https://opengameart.org/content/pixel-art-spells) | CC0 | 20+ 投射物/护盾，16×16 | 备选扩展 |
| **pewas Pixel RPG VFX Pack** | [itch.io](https://pewas.itch.io/pixel-rpg-vfx-pack-free-animated-effects) | 免费商用 | 35 套 GIF/PNG 序列，多分辨率 | 备选（体积较大） |
| **Spell animation spritesheets** | [OpenGameArt](https://opengameart.org/content/spell-animation-spritesheets) | CC BY 4.0 | Godot 渲染的高分辨率法术 | 需署名 |

> **推荐组合**：Kenney（粒子/拖尾）+ OpenGameArt CC0 序列帧（主体动画），与当前 Canvas 单机客户端零引擎依赖、免署名可商用。

## 接入方式

```js
const SKILL_FX = {
  heal: { src: 'assets/skills/heal.png', fw: 64, fh: 64, frames: 6, scale: 1.3, step: 2, dur: 36 },
  // ...
};
```

渲染：`drawSkillSheet(key, frameIndex, screenX, screenY, scale, alpha)`  
加载失败 → `onerror` 置空 → 回退程序化圆环/粒子（与天气 `WEATHER_SPRITES` 同一范式）。

## 署名（可选）

以上 CC0 资源**不强制署名**；若愿意可在 credits 中写：

- Heal — Liberated Pixel Cup / OpenGameArt (CC0)
- Fire/Lightning/Spark — Ansimuz / Gothicvania Magic Pack 9 (CC0)
- Flame — Kenney.nl Particle Pack (CC0)
