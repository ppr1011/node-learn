# 基础 03 - path 路径工具

## 背景

用 Node 的 `path` 模块实现一组路径处理工具(统一用 POSIX 语义,便于测试)。

## 要求

在 `index.ts` 中实现:

1. `getExtension(filePath: string): string`
   返回**不含点、且小写**的扩展名;没有扩展名返回 `""`。
   例:`"a/b/Photo.PNG"` → `"png"`;`"README"` → `""`。

2. `changeExtension(filePath: string, ext: string): string`
   把文件扩展名替换为 `ext`(`ext` 不含点)。保持目录部分不变。
   例:`changeExtension("src/index.ts", "js")` → `"src/index.js"`。

3. `splitPath(filePath: string): { dir: string; name: string; ext: string }`
   拆分为目录、主文件名(不含扩展名)、扩展名(不含点)。
   例:`"a/b/photo.png"` → `{ dir: "a/b", name: "photo", ext: "png" }`。

4. `isInside(parentDir: string, target: string): boolean`
   判断 `target` 解析后是否**严格位于** `parentDir` 内部(相同目录不算)。
   例:`isInside("/a", "/a/b")` → `true`;`isInside("/a", "/a")` → `false`;`isInside("/a", "/b")` → `false`。

## 提示

- 用 `path.posix` 子模块保证跨平台测试结果一致。
- `path.posix.extname` 返回带点的扩展名(如 `.png`)。
- `path.posix.parse` / `format` 很方便。
- `isInside` 用 `path.posix.relative(parent, target)`:结果不以 `..` 开头、且不是空串、且不是绝对路径,即在内部。

## 评分点

- 四个函数行为正确,含边界(无扩展名、相同目录等)。

## 运行

```bash
npx ts-node 03-exams/nodejs/programming/basic/03-path工具/index.test.ts
```
