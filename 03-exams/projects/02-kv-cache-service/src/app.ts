/**
 * 综合项目 02 - createApp(骨架)
 */
import express, { Express } from "express";
import { TTLCache } from "./cache";

export function createApp(cache: TTLCache): Express {
  const app = express();
  app.use(express.json());

  // TODO: 挂载 PUT /kv/:key、GET /kv/:key、DELETE /kv/:key、GET /stats
  //   - 错误体统一 { error: { message } }
  //   - "是否提供 value" 用 ("value" in body) 判断
  //   - 提示:Express 5 的 @types 把 req.params.key 标注为 string | string[],
  //     取用时用 (req.params.key as string) 即可

  return app;
}
