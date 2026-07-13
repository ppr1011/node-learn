/**
 * 综合项目 02 - 参考实现:createApp
 */
import express, { Express, Request, Response } from "express";
import { TTLCache } from "./cache";

function fail(res: Response, status: number, message: string): void {
  res.status(status).json({ error: { message } });
}

export function createApp(cache: TTLCache): Express {
  const app = express();
  app.use(express.json());

  app.put("/kv/:key", (req: Request, res: Response) => {
    const body = req.body ?? {};
    if (!("value" in body)) {
      return fail(res, 400, "缺少 value 字段");
    }
    const { value, ttl } = body;
    if (ttl !== undefined && (typeof ttl !== "number" || !(ttl > 0))) {
      return fail(res, 400, "ttl 必须为正数");
    }
    cache.set((req.params.key as string), value, ttl);
    res.status(204).end();
  });

  app.get("/kv/:key", (req: Request, res: Response) => {
    const value = cache.get((req.params.key as string));
    if (value === undefined) {
      return fail(res, 404, "key 不存在或已过期");
    }
    res.json({ value });
  });

  app.delete("/kv/:key", (req: Request, res: Response) => {
    const ok = cache.delete((req.params.key as string));
    if (!ok) return fail(res, 404, "key 不存在");
    res.status(204).end();
  });

  app.get("/stats", (_req: Request, res: Response) => {
    res.json(cache.stats());
  });

  return app;
}
