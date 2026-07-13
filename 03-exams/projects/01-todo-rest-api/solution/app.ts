/**
 * 综合项目 01 - 参考实现:createApp
 */
import express, { Express, Request, Response } from "express";
import { TodoStore } from "./store";

function fail(res: Response, status: number, message: string): void {
  res.status(status).json({ error: { message } });
}

export function createApp(store: TodoStore): Express {
  const app = express();
  app.use(express.json());

  app.get("/todos", (_req: Request, res: Response) => {
    res.json(store.list());
  });

  app.post("/todos", (req: Request, res: Response) => {
    const { title } = req.body ?? {};
    if (typeof title !== "string" || title.trim() === "") {
      return fail(res, 400, "title 必须为非空字符串");
    }
    const todo = store.create(title);
    res.status(201).json(todo);
  });

  app.get("/todos/:id", (req: Request, res: Response) => {
    const todo = store.get((req.params.id as string));
    if (!todo) return fail(res, 404, "todo 不存在");
    res.json(todo);
  });

  app.patch("/todos/:id", (req: Request, res: Response) => {
    const { title, completed } = req.body ?? {};
    if (title !== undefined && (typeof title !== "string" || title.trim() === "")) {
      return fail(res, 400, "title 必须为非空字符串");
    }
    if (completed !== undefined && typeof completed !== "boolean") {
      return fail(res, 400, "completed 必须为布尔值");
    }
    const updated = store.update((req.params.id as string), { title, completed });
    if (!updated) return fail(res, 404, "todo 不存在");
    res.json(updated);
  });

  app.delete("/todos/:id", (req: Request, res: Response) => {
    const ok = store.remove((req.params.id as string));
    if (!ok) return fail(res, 404, "todo 不存在");
    res.status(204).end();
  });

  return app;
}
