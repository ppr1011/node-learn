# 挑战 02 - 带 TTL 的 LRU 缓存

## 背景

实现一个带**容量上限(LRU 淘汰)**和**过期时间(TTL)**的缓存。

## 要求

在 `index.ts` 中实现 `class LRUCache<K, V>`:

```ts
interface LRUOptions {
  maxSize: number;        // 最大条目数,必须 >= 1
  ttl?: number;           // 存活毫秒数;不设则永不过期
  now?: () => number;     // 可注入的时钟(便于测试),默认 Date.now
}
```

方法:
- `set(key: K, value: V): void`
  写入/更新。更新会刷新其"最近使用"与过期时间。写入后若条目数超过 `maxSize`,淘汰**最久未使用**的条目。
- `get(key: K): V | undefined`
  读取。命中未过期 → 刷新最近使用并返回值;缺失或已过期 → 返回 `undefined`(过期条目要顺带删除)。
- `has(key: K): boolean`
  是否存在且未过期。**不刷新**最近使用顺序(但可删除已过期条目)。
- `delete(key: K): boolean`
  删除,返回是否存在。
- `get size(): number`
  当前条目数。
- `keys(): K[]`
  按从**最久未使用到最近使用**的顺序返回键。

## 提示

- 用 `Map` 天然维护插入顺序:读到/写入某键时先 `delete` 再 `set`,即可把它移到"最近"一端(Map 末尾)。最久未使用的就是 `map.keys().next().value`。
- 每个条目存 `{ value, expireAt }`;`ttl` 为空时 `expireAt = Infinity`。
- 过期判断:`now() >= expireAt`。
- 淘汰:`while (map.size > maxSize) map.delete(第一个键)`。

## 评分点

- LRU 淘汰正确(最久未使用被淘汰,`get` 会刷新新鲜度);
- TTL 过期语义正确(`get`/`has` 对过期返回假值并清理);
- `maxSize` 校验;`keys()` 顺序正确。

## 运行

```bash
npx ts-node 03-exams/nodejs/programming/challenge/02-LRU缓存/index.test.ts
```
