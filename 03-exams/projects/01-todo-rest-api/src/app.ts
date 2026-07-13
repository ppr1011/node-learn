/**
 * 综合项目 01 - createApp(骨架)
 * 不要在本文件里 listen,只组装并返回 app。
 */
import express, { Express } from "express";
import { TodoStore } from "./store";

export function createApp(store: TodoStore): Express {
  const app = express();
  app.use(express.json());

  // TODO: 挂载 GET/POST/GET:id/PATCH:id/DELETE:id 路由
  //   - 错误响应体统一为 { error: { message } }
  //   - 校验失败 400,资源不存在 404
  //   - 提示:Express 5 的 @types 把 req.params.id 标注为 string | string[],
  //     取用时用 (req.params.id as string) 即可(与本仓库 10-error-handling 一致)

  return app;
}
