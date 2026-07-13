# 综合项目 02 - KV 缓存服务(挑战)

实现一个带 **TTL 过期** 与 **LRU 淘汰** 的内存键值缓存,并用 HTTP API 暴露。本项目综合考察:数据结构设计、时间语义、可测试性(注入时钟)、HTTP 接口与统计。

> 建议先完成编程题「挑战 02 - 带 TTL 的 LRU 缓存」再做本项目。

## 目录

```
02-kv-cache-service/
├── src/
│   ├── cache.ts   # TTLCache:LRU + TTL + 命中统计(待实现)
│   └── app.ts     # createApp():HTTP API(待实现)
├── tests/
│   ├── cache.test.ts               # 单元测试:TTLCache(用 fake clock)
│   └── api.integration.test.ts     # 集成测试:真实 HTTP + 真实 TTL 过期
└── solution/       # 参考实现
```

## 一、`TTLCache`(`src/cache.ts`)

```ts
interface CacheOptions {
  maxSize: number;        // 容量上限,>=1,否则抛 RangeError
  defaultTtl?: number;    // 默认存活毫秒;不设则默认永不过期
  now?: () => number;     // 可注入时钟,默认 Date.now
}
```

方法:
| 方法 | 说明 |
|------|------|
| `set(key, value, ttl?)` | 写入;`ttl` 覆盖默认 ttl;刷新最近使用;超过 `maxSize` 淘汰最久未使用 |
| `get(key)` | 命中未过期 → 刷新最近使用、`hits++`、返回值;缺失或过期 → `misses++`、删除过期项、返回 `undefined` |
| `delete(key)` | 删除,返回是否存在 |
| `size` (getter) | 当前条目数 |
| `stats()` | 返回 `{ size, maxSize, hits, misses }` |

## 二、`createApp(cache)`(`src/app.ts`)

统一 JSON;错误体 `{ error: { message } }`。

| 方法 & 路径 | 行为 | 状态码 |
|-------------|------|--------|
| `PUT /kv/:key` | body `{ value, ttl? }`,写入;body 缺少 `value` 字段 → 400;`ttl` 若给出须为正数,否则 400 | 204 / 400 |
| `GET /kv/:key` | 命中返回 `{ value }`;未命中/过期 → 404 | 200 / 404 |
| `DELETE /kv/:key` | 删除 | 204 / 404 |
| `GET /stats` | 返回缓存统计 | 200 |

> 注意:`value` 允许是任意 JSON 值(包括 `0`、`false`、`null`、`""`),因此判断"是否提供了 value"要用 `"value" in body`,不能用真值判断。

## 验收与判分

```bash
npm run exam:projects
# 或单独运行
npx ts-node 03-exams/projects/02-kv-cache-service/tests/cache.test.ts
npx ts-node 03-exams/projects/02-kv-cache-service/tests/api.integration.test.ts
```

- **单元测试**用可控时钟测试 TTL/LRU/统计,确定性强;
- **集成测试**真实启动 HTTP 服务,并用较短 TTL + 真实等待验证过期。

两个测试文件全绿 = 满分。

## 提示

- LRU:用 `Map` 的插入顺序,读/写时"删后重插"移到末尾,最久未使用是第一个键。
- TTL:每条存 `expireAt`;`ttl`/`defaultTtl` 都没有时 `expireAt = Infinity`。
- 统计的 `hits`/`misses` 只在 `get` 中变化。
