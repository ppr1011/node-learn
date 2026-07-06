# 武器贴图资源目录 (CC0)

来自 [Kenney Tiny Dungeon](https://kenney.nl/assets/tiny-dungeon) — **CC0 1.0 公共领域**，免署名可商用。
与 `assets/enemies/` 同一素材包(敌人取的是 `tile_0096/0108/0110`)。

本包不含弓/矛,故武器阵容按包内实际含有的近战 + 法杖设计,保证美术风格统一、全部真实贴图。

| 文件 | 原始 tile | 外观 | 稀有度 | 攻击动画 |
|------|-----------|------|--------|----------|
| `dagger.png` | tile_0103 | 匕首(短刃) | common | 快速双段突刺 |
| `sword.png` | tile_0104 | 铁剑 | common | 大范围横向挥砍弧 |
| `greatsword.png` | tile_0106 | 巨剑(宽刃) | rare | 360° 旋风斩 |
| `axe.png` | tile_0118 | 双刃斧 | rare | 过顶劈斩 + 落地震波环 |
| `hammer.png` | tile_0117 | 战锤 | epic | 过顶重砸 + 强屏震 + 尘土 |
| `staff.png` | tile_0129 | 法杖(紫顶) | epic | 飞行法球投射物 + 命中魔法环 |
| `katana.png` | tile_0105 | 太刀(弯刃) | rare | 复用铁剑横砍(见 `ANIM_OF`) |
| `battleaxe.png` | tile_0119 | 战斧 | epic | 复用战斧劈斩 |
| `warhammer.png` | tile_0107 | 战锤·雷霆(重槌) | legendary | 复用战锤重砸 |
| `runestaff.png` | tile_0130 | 符文杖(青晶顶) | legendary | 复用法杖法球 |
| `dragonblade.png` | tile_0106 | 龙刃(阔剑) | legendary | 复用巨剑旋风斩 |

> 深层带 5 件高阶武器同样取自本素材包:图标为专属 tile,攻击动画则通过客户端 `ANIM_OF`
> 复用同手感的基础武器分支(零新增动画代码),稀有度颜色负责区分。

**尺寸**：均为 16×16 RGBA，客户端 `imageSmoothingEnabled = false` 放大绘制以保持像素风。
**兜底**：缺任一文件时客户端自动回退到程序化图标(见 `client/index.html` 的 `getProcWeapon`)。

**许可证**：CC0 1.0 Universal — 见 https://creativecommons.org/publicdomain/zero/1.0/
