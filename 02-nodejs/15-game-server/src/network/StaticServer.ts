/**
 * 极小静态文件服务 —— 让 client/ 通过 HTTP 提供,而非 file://。
 *
 * 为什么需要:3D 渲染器要把 PNG 上传成 WebGL 贴图,而 file:// 加载的图在
 * Chrome 下会触发 SecurityError(源是不透明的)。用 HTTP 提供即可解决,
 * 同时 ES module + import map 也依赖 HTTP。WS 与 HTTP 共用同一个 server/端口。
 *
 * 有意保持简单:只处理 GET、防目录穿越、按扩展名给 content-type。
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { logger } from '../utils/Logger';

// client/ 目录:相对源码 src/network/ 上溯两级(编译到 dist/network/ 时同样成立)
const CLIENT_DIR = path.resolve(__dirname, '../../client');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

/** 创建一个提供 client/ 的 http.Server(尚未 listen;交由调用方 listen)。 */
export function createStaticServer(): http.Server {
  return http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end('Method Not Allowed');
      return;
    }

    // 去掉查询串(如 ?r=3d),解码,默认首页
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
    const filePath = path.join(CLIENT_DIR, rel);

    // 防目录穿越:解析后必须仍在 CLIENT_DIR 内
    if (!filePath.startsWith(CLIENT_DIR + path.sep) && filePath !== CLIENT_DIR) {
      res.writeHead(403).end('Forbidden');
      return;
    }

    fs.stat(filePath, (err, stat) => {
      if (err || !stat.isFile()) {
        res.writeHead(404).end('Not Found');
        return;
      }
      const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type, 'Content-Length': stat.size });
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      fs.createReadStream(filePath)
        .on('error', () => res.end())
        .pipe(res);
    });
  });
}

export { CLIENT_DIR };
