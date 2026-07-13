/**
 * 综合项目 01 - 参考实现:TodoStore
 */
import { Todo, TodoPatch } from "./types";

export class TodoStore {
  private items = new Map<string, Todo>();
  private seq = 0;

  create(title: string): Todo {
    const id = String(++this.seq);
    const todo: Todo = { id, title, completed: false, createdAt: Date.now() };
    this.items.set(id, todo);
    return todo;
  }

  list(): Todo[] {
    return [...this.items.values()];
  }

  get(id: string): Todo | undefined {
    return this.items.get(id);
  }

  update(id: string, patch: TodoPatch): Todo | undefined {
    const todo = this.items.get(id);
    if (!todo) return undefined;
    if (patch.title !== undefined) todo.title = patch.title;
    if (patch.completed !== undefined) todo.completed = patch.completed;
    return todo;
  }

  remove(id: string): boolean {
    return this.items.delete(id);
  }

  clear(): void {
    this.items.clear();
  }
}
