// 模拟前端 ComfyUIBridgeService.seedanceGenerateStream 的完整 SSE fetch 行为
// 目标：检测是否在浏览器环境下存在 15 秒超时

const http = require('http');

const url = 'http://127.0.0.1:5173/api/third-party/seedance/generate:stream';
const postData = 'prompt=%E4%B8%80%E4%B8%AA%E9%A3%8E%E6%99%AF%E9%95%9C%E5%A4%B4%EF%BC%8C%E8%93%9D%E5%A4%A9%E7%99%BD%E4%BA%91&model=doubao-seedance-2-0-260128';

const options = {
  method: 'POST',
  headers: {
    'Accept': 'text/event-stream',
    'Content-Type': 'application/x-www-form-urlencoded',
    'Content-Length': Buffer.byteLength(postData),
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  },
  // 模拟浏览器的 TCP 行为
};

console.log(`[${new Date().toISOString()}] POST ${url}`);
console.log(`[${new Date().toISOString()}] 期望：持续 30+ 秒 SSE 数据，无超时`);
console.log();

const req = http.request(url, options, (res) => {
  console.log(`[${new Date().toISOString()}] Status: ${res.statusCode}`);
  console.log(`[${new Date().toISOString()}] Headers:`);
  Object.entries(res.headers).forEach(([k, v]) => {
    console.log(`  ${k}: ${v}`);
  });
  console.log();

  let received = 0;
  let lines = 0;
  let lastChunkAt = Date.now();
  let buffer = '';

  res.on('data', (chunk) => {
    received += chunk.length;
    const now = Date.now();
    const gap = (now - lastChunkAt) / 1000;
    lastChunkAt = now;

    buffer += chunk.toString('utf-8');
    const linesInChunk = (buffer.match(/\n/g) || []).length;
    buffer = buffer.slice(-200); // 只保留尾部

    lines += linesInChunk;
    const elapsed = (now - startTime) / 1000;
    console.log(`[${elapsed.toFixed(1)}s] ${received} bytes (${lines} lines, gap=${gap.toFixed(1)}s)`);
  });

  res.on('end', () => {
    const elapsed = (Date.now() - startTime) / 1000;
    console.log(`\n[${new Date().toISOString()}] DONE after ${elapsed.toFixed(1)}s, total=${received} bytes, ${lines} lines`);
  });

  res.on('error', (err) => {
    console.error(`[${new Date().toISOString()}] Response error: ${err.message}`);
  });
});

req.on('error', (err) => {
  console.error(`[${new Date().toISOString()}] Request error: ${err.message}`);
});

req.on('timeout', () => {
  console.error(`[${new Date().toISOString()}] TIMEOUT event after ${(Date.now() - startTime) / 1000}s`);
});

req.on('socket', (socket) => {
  socket.on('timeout', () => {
    console.error(`[${new Date().toISOString()}] SOCKET TIMEOUT after ${(Date.now() - startTime) / 1000}s`);
  });
});

const startTime = Date.now();

// 完全禁用超时（模拟 timeout: 0）
req.setTimeout(0);

req.write(postData);
req.end();
