/**
 * 基础 01 - 参考答案
 */

export type User = {
  id: number;
  name: string;
  age: number;
  email?: string;
};

export function isAdult(user: User): boolean {
  return user.age >= 18;
}

export function displayName(user: User): string {
  return user.email !== undefined ? `${user.name} <${user.email}>` : user.name;
}

export function sumAges(users: User[]): number {
  return users.reduce((acc, u) => acc + u.age, 0);
}

export function findById(users: User[], id: number): User | undefined {
  return users.find((u) => u.id === id);
}
