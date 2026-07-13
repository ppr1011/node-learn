/**
 * 挑战 02 - 类型安全的 EventEmitter(骨架)
 */

export type Listener<P> = (payload: P) => void;

export class TypedEmitter<Events> {
  // TODO: 用 Map 存 事件名 -> 监听器集合

  on<K extends keyof Events>(event: K, listener: Listener<Events[K]>): this {
    throw new Error("TODO: 实现 on");
  }

  off<K extends keyof Events>(event: K, listener: Listener<Events[K]>): this {
    throw new Error("TODO: 实现 off");
  }

  once<K extends keyof Events>(event: K, listener: Listener<Events[K]>): this {
    throw new Error("TODO: 实现 once");
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): boolean {
    throw new Error("TODO: 实现 emit");
  }

  listenerCount<K extends keyof Events>(event: K): number {
    throw new Error("TODO: 实现 listenerCount");
  }
}
