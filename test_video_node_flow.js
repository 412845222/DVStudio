// 模拟视频节点生成任务的完整流程：
// 1. fetch 上游图片节点（collectReferenceImages）
// 2. fetch 视频生成 SSE 流（seedanceGenerateStream）
// 3. 观察是否在 15 秒左右断开

const assert = require('assert');

function log(msg) {
  const time = new Date().toISOString().substring(11, 23);
  console.log(`[${time}] ${msg}`);
}

async function testCollectReferenceImages() {
  // 模拟 collectReferenceImages：尝试 fetch 资源 URL
  log('=== 测试 1: collectReferenceImages 模拟 ===');
  const startTime = Date.now();
  
  try {
    // 直接测试 Django 后端是否能返回一个参考图
    const res = await fetch('http://127.0.0.1:5800/api/third-party/seedance/generate:stream', {
      method: 'POST',
      body: new (require('form-data'))()
    });
    log(`直接 POST Django 后端: status=${res.status}`);
  } catch (e) {
    log(`错误: ${e.message}`);
  }
  
  log(`测试 1 完成，耗时: ${(Date.now() - startTime)/1000}s`);
}

async function testSSEStreamViaVite() {
  log('=== 测试 2: 通过 Vite 代理测试 SSE 流 (30秒) ===');
  const startTime = Date.now();
  const form = new (require('form-data'))();
  form.append('prompt', 'test video generation test prompt for timeout test');
  form.append('model', 'doubao-seedance-2-0-260128');
  
  try {
    const res = await fetch('http://127.0.0.1:5173/api/third-party/seedance/generate:stream', {
      method: 'POST',
      body: form,
      headers: {
        'Accept': 'text/event-stream',
      },
    });
    
    log(`响应状态: ${res.status}, ok=${res.ok}`);
    
    if (!res.ok) {
      const text = await res.text();
      log(`错误响应: ${text.substring(0, 200)}`);
      return;
    }
    
    const reader = res.body.getReader();
    const decoder = new (require('util').TextDecoder)('utf-8');
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
          log(`收到事件 #${eventCount} - 总耗时: ${elapsed.toFixed(1)}s, 距上次: ${gap.toFixed(1)}s`);
          lastMsgTime = now;
        }
      }
      
      // 超过 30 秒手动停止
      if (Date.now() - startTime > 30000) {
        log(`✅ 30 秒测试完成，共接收 ${eventCount} 个事件，流保持稳定`);
        try { reader.releaseLock(); } catch {}
        break;
      }
    }
  } catch (e) {
    const elapsed = (Date.now() - startTime) / 1000;
    log(`❌ 异常捕获: ${e.message}，耗时 ${elapsed}s`);
  }
}

async function main() {
  log('开始视频节点任务流程测试');
  await testCollectReferenceImages();
  await testSSEStreamViaVite();
  log('=== 全部测试完成 ===');
}

main().catch(err => {
  console.error('主测试错误:', err);
  process.exit(1);
});
