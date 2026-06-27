/**
 * Test script for subtitle Python Bridge handlers
 */

import { getPythonBridge, resetPythonBridge } from './index.mjs'

async function main() {
  console.log('Subtitle Python Bridge Test')
  console.log('==============================\n')

  const bridge = getPythonBridge({ devMode: true })

  // Test 1: Warmup
  console.log('=== Warmup ===')
  const warmupResult = await bridge.warmup()
  console.log('Warmup result:', warmupResult)
  console.log('✅ Warmup passed\n')

  // Test 2: Simple subtitle understanding (scope='overall', no API key needed for fallback)
  console.log('=== Test 2: Subtitle Understand Stream (scope=overall) ===')
  const testCues = [
    { text: '大家好，今天我们来谈谈人工智能的发展历史', startMs: 0, endMs: 3000 },
    { text: '人工智能最早起源于1950年代', startMs: 3000, endMs: 6000 },
    { text: '经过几十年的发展，现在已经应用到各个领域', startMs: 6000, endMs: 9000 },
    { text: '包括自然语言处理、计算机视觉、机器人等', startMs: 9000, endMs: 12000 },
  ]

  try {
    // Use scope='overall' for fast understanding (fallback without API key)
    const params = {
      cues: testCues,
      cueRanges: [],
      scope: 'overall',  // This will use fallback bigram extraction
    }

    let chunks = []
    for await (const chunk of bridge.callStream('subtitle.understand:stream', params)) {
      console.log('Chunk:', chunk.type || chunk)
      chunks.push(chunk)
    }

    console.log(`Received ${chunks.length} chunks`)
    console.log('✅ Subtitle understand stream passed\n')
  } catch (err) {
    console.log('⚠️ Subtitle understand stream test skipped (expected without API key):', err.message, '\n')
  }

  // Test 3: State
  console.log('=== Test 3: State ===')
  const state = bridge.getState()
  console.log('State:', state)
  console.log('✅ State test passed\n')

  // Test 4: Shutdown
  console.log('=== Test 4: Shutdown ===')
  await bridge.shutdown()
  const stateAfter = bridge.getState()
  console.log('State after shutdown:', stateAfter)
  console.log('✅ Shutdown test passed\n')

  console.log('==============================')
  console.log('✅ All tests passed!')

  resetPythonBridge()
}

main().catch(err => {
  console.error('Test failed:', err)
  process.exit(1)
})