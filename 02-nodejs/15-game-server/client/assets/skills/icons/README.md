# 技能栏 UI 图标

用于底部技能栏 `32×32` 显示的独立图标（与 `../heal.png` 等**战斗特效序列帧**分离）。

| 文件 | 技能 | 来源 | 许可 |
|------|------|------|------|
| `icon-heal.png` | 治疗 | [Painterly Spell Icons part 1](https://opengameart.org/content/painterly-spell-icons-part-1) · `heal-jade-2.png` | CC-BY-SA 3.0 / GPL |
| `icon-fireball.png` | 火球 | 同上 · `fireball-red-2.png` | CC-BY-SA 3.0 / GPL |
| `icon-meteor.png` | 陨石雨 | AI 生成（像素 RPG 风格，64×64） | 项目内使用 |

## 替换方式

1. 将新 PNG 覆盖对应 `icon-*.png`（建议 64×64 或 128×128，透明背景）。
2. 或在 `client/index.html` 的 `SKILL_ICONS` 表中改路径。
3. 加载失败时自动回退为 Canvas 程序化图标。

## 署名（Painterly Spell Icons）

使用 heal / fireball 图标时，建议在 credits 中注明：

> Spell icons by J. W. Bjerk (eleazzaar) — [OpenGameArt.org](https://opengameart.org/content/painterly-spell-icons-part-1)

## 更多 CC0 图标来源

| 来源 | 链接 | 说明 |
|------|------|------|
| Kenney Game Icons | https://kenney.nl/assets/game-icons | CC0，通用 UI 符号 |
| Kenney Board Game Icons | https://kenney.nl/assets/board-game-icons | CC0，含资源/动作类 |
| DevWizard Pixel Art Spells | https://opengameart.org/content/pixel-art-spells | CC0，16×16 法术 |
