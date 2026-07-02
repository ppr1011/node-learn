/**
 * 04 - EventEmitter 事件驱动
 * 运行: npx ts-node 02-nodejs/04-event-emitter/index.ts
 */

import { EventEmitter } from "events";

// ========== 基本用法 ==========
console.log("--- 基本 EventEmitter ---");

const emitter = new EventEmitter();

// 注册监听器
emitter.on("greet", (name: string) => {
  console.log(`Hello, ${name}!`);
});

emitter.on("greet", (name: string) => {
  console.log(`Welcome aboard, ${name}!`);
});

// 触发事件
emitter.emit("greet", "Alice");

// ========== once - 只监听一次 ==========
console.log("\n--- once ---");

emitter.once("init", () => {
  console.log("Initialized! (only once)");
});

emitter.emit("init");
emitter.emit("init"); // 不会触发

// ========== 移除监听器 ==========
console.log("\n--- 移除监听器 ---");

function onData(data: string) {
  console.log("data:", data);
}

emitter.on("data", onData);
emitter.emit("data", "first");
emitter.removeListener("data", onData);
emitter.emit("data", "second"); // 不会触发

// ========== 自定义事件类: 订单系统 ==========
console.log("\n--- 自定义事件类: 订单系统 ---");

interface OrderEvents {
  created: [orderId: string, amount: number];
  paid: [orderId: string];
  shipped: [orderId: string, trackingNo: string];
  cancelled: [orderId: string, reason: string];
}

class OrderService extends EventEmitter {
  private orders = new Map<string, { amount: number; status: string }>();

  createOrder(orderId: string, amount: number): void {
    this.orders.set(orderId, { amount, status: "created" });
    this.emit("created", orderId, amount);
  }

  payOrder(orderId: string): void {
    const order = this.orders.get(orderId);
    if (order) {
      order.status = "paid";
      this.emit("paid", orderId);
    }
  }

  shipOrder(orderId: string, trackingNo: string): void {
    const order = this.orders.get(orderId);
    if (order) {
      order.status = "shipped";
      this.emit("shipped", orderId, trackingNo);
    }
  }

  cancelOrder(orderId: string, reason: string): void {
    const order = this.orders.get(orderId);
    if (order) {
      order.status = "cancelled";
      this.emit("cancelled", orderId, reason);
    }
  }
}

const orderService = new OrderService();

// 注册业务监听器
orderService.on("created", (id, amount) => {
  console.log(`📦 订单创建: ${id}, 金额: ¥${amount}`);
});

orderService.on("paid", (id) => {
  console.log(`💰 订单支付: ${id}`);
});

orderService.on("shipped", (id, tracking) => {
  console.log(`🚚 订单发货: ${id}, 快递号: ${tracking}`);
});

orderService.on("cancelled", (id, reason) => {
  console.log(`❌ 订单取消: ${id}, 原因: ${reason}`);
});

// 模拟业务流程
orderService.createOrder("ORD-001", 299);
orderService.payOrder("ORD-001");
orderService.shipOrder("ORD-001", "SF1234567890");

orderService.createOrder("ORD-002", 599);
orderService.cancelOrder("ORD-002", "用户主动取消");

// ========== 异步事件 ==========
console.log("\n--- 异步事件 ---");

class AsyncTaskRunner extends EventEmitter {
  async runTask(name: string, durationMs: number): Promise<void> {
    this.emit("start", name);
    await new Promise((resolve) => setTimeout(resolve, durationMs));
    this.emit("complete", name, durationMs);
  }
}

const runner = new AsyncTaskRunner();
runner.on("start", (name) => console.log(`  ▶ Task "${name}" started`));
runner.on("complete", (name, ms) => console.log(`  ✓ Task "${name}" done (${ms}ms)`));

async function runDemo() {
  await runner.runTask("fetch-data", 100);
  await runner.runTask("process", 50);

  // ========== 错误处理 ==========
  console.log("\n--- 错误事件 ---");
  const errorEmitter = new EventEmitter();

  errorEmitter.on("error", (err: Error) => {
    console.log("捕获到错误:", err.message);
  });

  errorEmitter.emit("error", new Error("Something went wrong"));

  // ========== 监听器信息 ==========
  console.log("\n--- 监听器信息 ---");
  console.log("orderService 'created' 监听器数:", orderService.listenerCount("created"));
  console.log("最大监听器数:", orderService.getMaxListeners());
  console.log("事件列表:", orderService.eventNames());
}

runDemo();
