/**
 * 基础 03 - 单元测试(请勿修改)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { getExtension, changeExtension, splitPath, isInside } from "./index";

test("getExtension", () => {
  assert.equal(getExtension("a/b/Photo.PNG"), "png");
  assert.equal(getExtension("index.ts"), "ts");
  assert.equal(getExtension("README"), "");
  assert.equal(getExtension("archive.tar.gz"), "gz");
});

test("changeExtension", () => {
  assert.equal(changeExtension("src/index.ts", "js"), "src/index.js");
  assert.equal(changeExtension("photo.png", "webp"), "photo.webp");
  assert.equal(changeExtension("noext", "txt"), "noext.txt");
});

test("splitPath", () => {
  assert.deepEqual(splitPath("a/b/photo.png"), { dir: "a/b", name: "photo", ext: "png" });
  assert.deepEqual(splitPath("README"), { dir: "", name: "README", ext: "" });
});

test("isInside", () => {
  assert.equal(isInside("/a", "/a/b"), true);
  assert.equal(isInside("/a", "/a/b/c"), true);
  assert.equal(isInside("/a", "/a"), false); // 相同目录不算
  assert.equal(isInside("/a", "/b"), false);
  assert.equal(isInside("/a", "/ab"), false); // 前缀相同但不是子目录
});
