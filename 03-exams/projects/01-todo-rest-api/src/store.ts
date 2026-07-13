/**
 * 综合项目 01 - TodoStore(骨架)
 */
import { Todo, TodoPatch } from "./types";

export class TodoStore {
  // TODO: 用 Map 或数组保存 todo;用自增序号生成 id

  create(title: string): Todo {
    throw new Error("TODO: 实现 create");
  }

  list(): Todo[] {
    throw new Error("TODO: 实现 list");
  }

  get(id: string): Todo | undefined {
    throw new Error("TODO: 实现 get");
  }

  update(id: string, patch: TodoPatch): Todo | undefined {
    throw new Error("TODO: 实现 update");
  }

  remove(id: string): boolean {
    throw new Error("TODO: 实现 remove");
  }

  clear(): void {
    throw new Error("TODO: 实现 clear");
  }
}
