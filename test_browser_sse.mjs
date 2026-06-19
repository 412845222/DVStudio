// 模拟浏览器 fetch + ReadableStream 行为来测试 SSE 是否在 JS 层面被中断

const TEST_DURATION = 25000; // 25 秒

const start = Date.now();
const form = new FormData();
form.set('prompt', 'test video for browser timeout test');
form.set('model', 'doubao-seedance-2-0-260128');

console.log('[Test] 开始测试 Vite 代理 SSE，预期持续 25 秒...');

try {
  const res = await fetch('http://127.0.0.1:5173/api/third-party/seedance/generate:stream', {
    method: 'POST',
    body: form,
  });

  console.log(`[Test] 响应状态: ${res.status}, ok: ${res.ok}, body: ${res.body ? '存在' : 'NULL'}`);
  
  if (!res.ok || !res.body) {
    console.log('[Test] ❌ 响应或 body 为 null，检查后端');
    process.exit(1);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let eventCount = 0;
  let buffer = '';

  while (Date.now() - start < TEST_DURATION) {
    const { done, value } = await reader.read();
    if (done) {
      console.log(`[Test] ⚠️  流被提前关闭！已收到 ${eventCount} 个事件，持续 ${(Date.now() - start)/1000}s`);
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    
    // 统计 event: msg 行数
    const lines = buffer.split('\n');
    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventCount++;
      }
    }
    buffer = lines[lines.length - 1] || '';
    
    const elapsed = (Date.now() - start) / 1000;
    if (elapsed > 0 && Math.floor(elapsed) % 5 === 0) {
      // 每 5 秒打印一次
    }
  }
  
  const elapsed = (Date.now() - start) / 1000;
  console.log(`[Test] ✅ 测试完成，收到 ${eventCount} 个事件，持续 ${elapsed}s，没有被中断`);
  
  // 释放 reader
  try { reader.releaseLock(); } catch {}
  
} catch (err) {
  console.log(`[Test] ❌ 捕获异常: ${err.message}`);
  console.log(`[Test] 异常发生在 ${(Date.now() - start)/1000}s 时`);
}
