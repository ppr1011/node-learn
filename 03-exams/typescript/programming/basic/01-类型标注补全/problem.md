# 基础 01 - 类型标注补全

## 背景

给定一个用户数据结构,实现一组围绕它的工具函数。本题重点是**正确的类型标注**与**基础逻辑**。

```ts
type User = {
  id: number;
  name: string;
  age: number;
  email?: string; // 可选
};
```

## 要求

在 `index.ts` 中实现下列函数(签名已给出,请补全实现):

1. `isAdult(user: User): boolean`
   成年判定:`age >= 18` 返回 `true`。

2. `displayName(user: User): string`
   返回展示名:
   - 有 `email` 时返回 `"名字 <邮箱>"`,例如 `"Alice <a@x.com>"`;
   - 没有 `email` 时只返回名字。

3. `sumAges(users: User[]): number`
   返回所有用户年龄之和;空数组返回 `0`。

4. `findById(users: User[], id: number): User | undefined`
   按 `id` 查找用户,找不到返回 `undefined`。

## 提示

- 可选属性用 `user.email` 判空;注意空字符串也应视为"没有邮箱"?本题按"是否为 `undefined`"判断即可(即传了空串就当有邮箱)。
- `Array.prototype.reduce` / `find` 很好用。
- 本项目 ts-node 开启了类型检查:如果你把返回类型写错,测试会直接编译失败。

## 评分点

- 四个函数行为正确;
- 类型签名保持不变(不要改成 `any`)。

## 运行

```bash
npx ts-node 03-exams/typescript/programming/basic/01-类型标注补全/index.test.ts
```
