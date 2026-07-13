/**
 * 基础 03 - 参考答案
 */
import path from "path";

const p = path.posix;

export function getExtension(filePath: string): string {
  const ext = p.extname(filePath); // 含点,如 ".PNG"
  return ext ? ext.slice(1).toLowerCase() : "";
}

export function changeExtension(filePath: string, ext: string): string {
  const { dir, name } = p.parse(filePath);
  const base = `${name}.${ext}`;
  return dir ? p.join(dir, base) : base;
}

export function splitPath(filePath: string): { dir: string; name: string; ext: string } {
  const parsed = p.parse(filePath);
  return {
    dir: parsed.dir,
    name: parsed.name,
    ext: parsed.ext ? parsed.ext.slice(1) : "",
  };
}

export function isInside(parentDir: string, target: string): boolean {
  const rel = p.relative(parentDir, target);
  return rel !== "" && !rel.startsWith("..") && !p.isAbsolute(rel);
}
