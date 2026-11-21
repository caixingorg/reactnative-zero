/**
 * 本地联调用的模拟上传服务：接收 multipart/form-data 的 POST /uploads，只统计字节数，不落盘。
 * 仅用于开发与真机联调，不可部署；默认只监听本机回环地址，需要局域网访问时显式传入 MOCK_UPLOAD_HOST。
 *
 * 用法：pnpm mock:upload
 * 环境变量：
 *   MOCK_UPLOAD_PORT        端口，默认 8787
 *   MOCK_UPLOAD_HOST        监听地址，默认 127.0.0.1
 *   MOCK_UPLOAD_FAIL_FIRST  前 N 次请求返回 503，用来验证客户端重试，默认 0
 *   MOCK_UPLOAD_DELAY_MS    每个请求额外延迟毫秒数，用来观察进度条与取消，默认 0
 */
import { createServer } from 'node:http';

const port = Number(process.env.MOCK_UPLOAD_PORT ?? 8787);
const host = process.env.MOCK_UPLOAD_HOST ?? '127.0.0.1';
const failFirst = Number(process.env.MOCK_UPLOAD_FAIL_FIRST ?? 0);
const delayMs = Number(process.env.MOCK_UPLOAD_DELAY_MS ?? 0);
// 原因：与客户端「4xx 不重试」配套，单次上限防止误传超大文件把开发机内存吃满
const MAX_BYTES = 20 * 1024 * 1024;

let requestCount = 0;

function sendJson(res: import('node:http').ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const server = createServer((req, res) => {
  if (req.method !== 'POST' || !req.url?.startsWith('/uploads')) {
    sendJson(res, 404, { code: 404, message: 'Not found', data: null });
    return;
  }
  requestCount += 1;
  const current = requestCount;

  let received = 0;
  let tooLarge = false;
  req.on('data', (chunk: Buffer) => {
    received += chunk.length;
    if (received > MAX_BYTES) {
      tooLarge = true;
      req.destroy();
    }
  });
  req.on('end', () => {
    setTimeout(() => {
      if (current <= failFirst) {
        console.log(`#${current} -> 503 (simulated failure)`);
        sendJson(res, 503, { code: 503, message: 'Simulated outage', data: null });
        return;
      }
      if (tooLarge) {
        sendJson(res, 413, { code: 413, message: 'Payload too large', data: null });
        return;
      }
      console.log(`#${current} -> 200, ${received} bytes (${req.headers['content-type'] ?? '?'})`);
      sendJson(res, 200, { code: 0, message: 'ok', data: { receivedBytes: received } });
    }, delayMs);
  });
});

server.listen(port, host, () => {
  console.log(`Mock upload server listening on http://${host}:${port}/uploads`);
  if (host !== '127.0.0.1') {
    console.warn('Listening beyond loopback: anyone on this network can post to it.');
  }
});
