/**
 * 类型级断言工具
 *
 * 由于本项目的 ts-node 默认开启类型检查,测试文件里的"类型断言"若不成立,
 * 会直接导致编译失败 → 测试运行失败。因此可以用它来给"类型体操"类题目判分。
 *
 * 用法:
 *   type _ = Expect<Equal<MyPick<T, "a">, { a: number }>>;
 * 若两个类型不相等,Expect 会报类型错误。
 */

/** 精确判断两个类型是否相等(利用条件类型的逆变技巧) */
export type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2)
    ? true
    : false;

/** 断言传入的类型为 true,否则报错 */
export type Expect<T extends true> = T;

/** 断言两个类型相等 */
export type ExpectEqual<X, Y> = Expect<Equal<X, Y>>;

/** 取反 */
export type Not<T extends boolean> = T extends true ? false : true;
