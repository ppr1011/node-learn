# 避难所贴图资源目录 (CC0)

来自 [Kenney Tiny Town](https://kenney.nl/assets/tiny-town) — **CC0 1.0 公共领域**,免署名可商用。

| 文件 | 组成 | 外观 | 用途 |
|------|------|------|------|
| `hut.png` | Tiny Town `tilemap_packed.png` 的 tile 48/49/50(灰瓦屋顶)+ 84/85/86(窗/门/墙)拼合 | 48×32px,一间灰瓦棕墙小屋(带窗和门) | 避难所安全圈中心的地标建筑 |

> `hut.png` 由素材包中的独立 tile 用 PIL 拼合而成(3×2 格,16px/格)。客户端 `drawShelters`
> 用 `imageSmoothingEnabled = false` 放大到 96×64 绘制,底边落在安全圈圆心;缺文件时自动回退到
> 原来的「⛺ 避难所」文字。

**门口篝火**:Tiny Town 无篝火/火焰 tile,故篝火仍由 `drawCampfires` 程序化绘制(跳动火焰 +
暖色光晕,天然带动画,优于静态贴图)。

**许可证**:CC0 1.0 Universal — 见 https://creativecommons.org/publicdomain/zero/1.0/
