// 模拟视频节点生成任务的完整流程，验证 SSE 流不会在 15 秒中断
function log(msg) {
  const time = new Date().toISOString().substring(11, 23);
  console.log(`[${time}] ${msg}`);
}

async function testSSEStream() {
  log('=== 测试: 通过 Vite 代理测试 SSE 流 (30秒) ===');
  const startTime = Date.now();
  
  // 使用 multipart/form-data 手动构造
  const boundary = '----TestBoundary' + Date.now();
  let body = `------${boundary}\r\n`;
  body += 'Content-Disposition: form-data; name="prompt"\r\n\r\n';
  body += 'test video generation timeout test\r\n';
  body += `------${boundary}\r\n`;
  body += 'Content-Disposition: form-data; name="model"\r\n\r\n';
  body += 'doubao-seedance-2-0-260128\r\n';
  body += `------${boundary}--\r\n`;
  
  try {
    const res = await fetch('http://127.0.0.1:5173/api/third-party/seedance/generate:stream', {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Accept': 'text/event-stream',
      },
      body: body,
    });
    
    log(`响应状态: ${res.status}, ok=${res.ok}`);
    
    if (!res.ok) {
      const text = await res.text();
      log(`错误响应: ${text.substring(0, 200)}`);
      return false;
    }
    
    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let eventCount = 0;
    let lastMsgTime = Date.now();
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        log(`⚠️ 流被关闭，已接收 ${eventCount} 个事件，总耗时 ${(Date.now()-startTime)/1000}s`);
        break;
      }
      
      const text = decoder.decode(value, { stream: true });
      const lines = text.split('\n');
      
      for (const line of lines) {
        if (line.startsWith('event:')) {
          eventCount += 1;
          const now = Date.now();
          const elapsed = (now - startTime) / 1000;
          const gap = (now - lastMsgTime) / 1000;
          log(`事件 #${eventCount} - 总耗时: ${elapsed.toFixed(1)}s, 距上次: ${gap.toFixed(1)}s`);
          lastMsgTime = now;
        }
      }
      
      if (Date.now() - startTime > 30000) {
        log(`✅ 30 秒测试完成，共接收 ${eventCount} 个事件，流保持稳定`);
        try { reader.releaseLock(); } catch {}
        return true;
      }
    }
  } catch (e) {
    const elapsed = (Date.now() - startTime) / 1000;
    log(`❌ 异常: ${e.message}，耗时 ${elapsed}s`);
    return false;
  }
}

async function main() {
  log('开始视频节点任务流程测试');
  const ok = await testSSEStream();
  log(`测试结果: ${ok ? 'PASS' : 'FAIL'}`);
}

main().catch(err => {
  console.error('主测试错误:', err);
  process.exit(1);
});
