/**
 * 基础 01 - 类型标注补全(骨架)
 * 把每个 TODO 替换成你的实现。请勿修改函数签名。
 */

export type User = {
  id: number;
  name: string;
  age: number;
  email?: string;
};

export function isAdult(user: User): boolean {
  // TODO: age >= 18 返回 true
  throw new Error("TODO: 实现 isAdult");
}

export function displayName(user: User): string {
  // TODO: 有 email 返回 "名字 <邮箱>",否则只返回名字
  throw new Error("TODO: 实现 displayName");
}

export function sumAges(users: User[]): number {
  // TODO: 返回所有用户 age 之和,空数组返回 0
  throw new Error("TODO: 实现 sumAges");
}

export function findById(users: User[], id: number): User | undefined {
  // TODO: 按 id 查找,找不到返回 undefined
  throw new Error("TODO: 实现 findById");
}
