# 主角贴图资源目录 (CC0)

来自 [Kenney Tiny Dungeon](https://kenney.nl/assets/tiny-dungeon) — **CC0 1.0 公共领域**，与敌人/武器同一素材包。

| 文件 | 原始 tile | 外观 | 用途 |
|------|-----------|------|------|
| `hero.png` | tile_0087 | 头戴护盔的骑士 | 玩家主角(所有玩家共用同一贴图,按朝向水平翻转) |

**渲染**：`client/index.html` 的 `drawPlayer` 用 `imageSmoothingEnabled = false` 放大到 30px；
按 `facing` 水平翻转朝向,受击 `hitFlash` 时提亮闪白;身份区分改由**脚下的身份色圈**承担
(自身绿色,他人按 id 取色)。缺文件时自动回退到原来的彩色圆圈。

**许可证**：CC0 1.0 Universal — 见 https://creativecommons.org/publicdomain/zero/1.0/
