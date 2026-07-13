# 基础 01 - fs Promise 封装

## 背景

用 `fs/promises` 封装一组常用的 JSON 文件读写工具。

## 要求

在 `index.ts` 中实现(全部返回 `Promise`):

1. `ensureDir(dir: string): Promise<void>`
   确保目录存在(递归创建);已存在不报错。

2. `writeJson(file: string, data: unknown): Promise<void>`
   把 `data` 以**带 2 空格缩进**的 JSON 写入 `file`;自动确保父目录存在。

3. `readJson<T = unknown>(file: string): Promise<T>`
   读取并解析 JSON 文件。

4. `listJsonFiles(dir: string): Promise<string[]>`
   返回目录下所有以 `.json` 结尾的**文件名**(不含子目录),按字母升序排序;目录不存在时返回 `[]`。

## 提示

- `import { promises as fs } from "fs"` 或 `import fs from "fs/promises"`。
- `fs.mkdir(dir, { recursive: true })`。
- `JSON.stringify(data, null, 2)`。
- `fs.readdir(dir, { withFileTypes: true })` 可判断是否为文件(`entry.isFile()`)。
- `listJsonFiles` 里目录不存在会抛 `ENOENT`,需要捕获并返回 `[]`。

## 评分点

- 四个函数行为正确;
- `writeJson` 会自动建目录;`listJsonFiles` 只返回 `.json` 文件且已排序、能容错目录不存在。

## 运行

```bash
npx ts-node 03-exams/nodejs/programming/basic/01-fs-Promise封装/index.test.ts
```
