# 天气贴图资源目录(可选 · 范式 B)

本目录用于演示**贴图/序列帧接入**这条路径。已内置一组 **CC0** 素材(见下方"已内置资源"),
默认启用了雪花贴图;删掉 `client/index.html` 里 `WEATHER_SPRITES.snow` 那行即回退纯程序化渲染(范式 A)。
想换/加资源时,把符合下表约定的文件丢进来,并在 `WEATHER_SPRITES` 里配置路径即可。

## 已内置资源(来自 Kenney Particle Pack · CC0 · 免署名)

| 文件 | 原始文件 | 用途 | 当前是否启用 |
|------|----------|------|:---:|
| `snowflake.png` | circle_05.png | 雪花(柔边圆) | ✅ 已接入 |
| `raindrop.png` | trace_01.png | 雨滴(竖向拖尾),备用 | ⬜ 雨走程序化线段 |
| `glow.png` | light_01.png | 辉光,可用于雾/光点,备用 | ⬜ |
| `sparkle.png` | star_01.png | 闪烁星,备用 | ⬜ |

来源:[Kenney Particle Pack](https://kenney.nl/assets/particle-pack) — 许可 **CC0 1.0**(公共领域,免署名可商用)。
均为 512×512 透明 PNG,渲染时按粒子大小缩放。

## 接入方式

`client/index.html` 顶部的天气模块里:

```js
const WEATHER_SPRITES = {
  snow: 'assets/weather/snowflake.png',   // 解开这一行即启用雪花贴图
  // rain: 'assets/weather/raindrop.png', // 可自行扩展雨滴等
};
```

加载逻辑做了**优雅降级**:文件不存在 / 加载失败 → `onerror` 把缓存置空 → 自动回退程序化。
所以即使配置了路径但没放图,也不会白屏或报错。

## 资源约定

| key | 建议文件 | 尺寸 | 要求 |
|-----|----------|------|------|
| `snow` | `snowflake.png` | 32×32 或 64×64 | 透明背景 PNG,单朵雪花居中,白/浅蓝 |
| `rain` | `raindrop.png` | 8×32 | 透明背景,竖向雨滴/雨线 |

- 用**透明背景 PNG**(带 alpha),渲染时会按粒子 `depth` 缩放并叠加 `globalAlpha`。
- 雪花贴图会被**随机旋转**(`p.spin`),所以做成大致中心对称最自然。
- 单张精灵即可;若想做**序列帧**(逐帧动画),可扩展为雪碧图 + 帧索引,渲染分支里
  用 `drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh)` 的 9 参重载切帧。

## 可直接使用的 CC0 / 开源素材来源

以下站点均可找到**免费可商用**的粒子/天气美术。**优先选 CC0(公共领域,免署名)**,
其余许可需按要求在项目内保留署名(见下方"署名"节)。

| 来源 | 网址 | 许可 | 适合找 |
|------|------|------|--------|
| Kenney | https://kenney.nl/assets | **CC0** | Particle Pack(雪花/雨滴/光点)、Weather 图标 |
| OpenGameArt | https://opengameart.org | 混合(可筛 CC0) | 搜 `rain` / `snow` / `particle`,按 License 过滤 CC0 |
| itch.io | https://itch.io/game-assets/free | 混合(看单页) | 搜 `weather effects` / `snow sprite` |
| Game-icons.net | https://game-icons.net | CC BY 3.0 | 天气 SVG 图标(可转 PNG) |

> 检索技巧:在 OpenGameArt 左侧 `Art License` 勾选 **CC0**,再搜关键词,结果即全部免署名可商用。

## 序列帧动画(进阶)

若想要真正的"动画贴图"(如飘动的雾、翻滚的云):

1. 找一张横向排布的**雪碧图(sprite sheet)**,例如 8 帧 = 256×32(每帧 32×32)。
2. 记录帧数 `FRAMES` 与单帧宽高 `FW/FH`。
3. 渲染时按时间推进帧索引:`const f = Math.floor(now / 80) % FRAMES;`
4. `ctx.drawImage(img, f*FW, 0, FW, FH, dx, dy, dw, dh)` 裁出当前帧。

程序化(范式 A)和贴图(范式 B)可共存:程序化负责氛围与随强度缩放,贴图负责精细美术。

## 署名(ATTRIBUTION)

若使用了**非 CC0**(如 CC BY)的资源,请在本文件下方登记,满足许可的署名义务:

```
- snowflake.png — 作者/链接 — 许可(如 CC BY 3.0)
```

(当前目录为空,无需署名。)
