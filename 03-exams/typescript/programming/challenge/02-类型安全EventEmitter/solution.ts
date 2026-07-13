/**
 * 挑战 02 - 参考答案
 */

export type Listener<P> = (payload: P) => void;

export class TypedEmitter<Events> {
  private listeners = new Map<keyof Events, Set<Listener<any>>>();
  // once 包装器 -> 原始 listener 的映射,用于 off 时按原始引用移除
  private onceWrappers = new Map<Listener<any>, Set<Listener<any>>>();

  on<K extends keyof Events>(event: K, listener: Listener<Events[K]>): this {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
    return this;
  }

  off<K extends keyof Events>(event: K, listener: Listener<Events[K]>): this {
    const set = this.listeners.get(event);
    if (!set) return this;
    // 直接移除
    set.delete(listener);
    // 若该 listener 曾以 once 注册,移除其包装器
    const wrappers = this.onceWrappers.get(listener);
    if (wrappers) {
      for (const w of wrappers) set.delete(w);
      this.onceWrappers.delete(listener);
    }
    return this;
  }

  once<K extends keyof Events>(event: K, listener: Listener<Events[K]>): this {
    const wrapper: Listener<Events[K]> = (payload) => {
      this.off(event, wrapper);
      listener(payload);
    };
    // 记录 原始 listener -> 包装器,便于 off(原始 listener)
    if (!this.onceWrappers.has(listener)) {
      this.onceWrappers.set(listener, new Set());
    }
    this.onceWrappers.get(listener)!.add(wrapper);
    return this.on(event, wrapper);
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): boolean {
    const set = this.listeners.get(event);
    if (!set || set.size === 0) return false;
    // 复制一份,避免 once 在遍历中修改集合
    for (const listener of [...set]) {
      listener(payload);
    }
    return true;
  }

  listenerCount<K extends keyof Events>(event: K): number {
    return this.listeners.get(event)?.size ?? 0;
  }
}
