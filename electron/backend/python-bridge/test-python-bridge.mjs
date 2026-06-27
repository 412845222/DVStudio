#!/usr/bin/env node
/**
 * Python Bridge Integration Test
 * 
 * Run: node test-python-bridge.mjs
 */

import { PythonBridge, getPythonBridge, resetPythonBridge } from './index.mjs'

async function testEcho(bridge) {
  console.log('\n=== Test 1: Echo ===')
  const result = await bridge.call('echo', { message: 'hello from node' })
  console.log('Result:', result)
  
  if (!result || !result.echo) {
    throw new Error('Echo test failed: no echo result')
  }
  
  if (result.echo.message !== 'hello from node') {
    throw new Error('Echo test failed: message mismatch')
  }
  
  console.log('✅ Echo test passed')
}

async function testPing(bridge) {
  console.log('\n=== Test 2: Ping ===')
  const result = await bridge.call('ping', {})
  console.log('Result:', result)
  
  if (!result || result.status !== 'ok') {
    throw new Error('Ping test failed: status not ok')
  }
  
  if (!result.pid) {
    throw new Error('Ping test failed: no pid')
  }
  
  console.log('✅ Ping test passed')
}

async function testStream(bridge) {
  console.log('\n=== Test 3: Streaming ===')
  
  const chunks = []
  for await (const chunk of bridge.callStream('test.stream', { count: 5, prefix: 'test' })) {
    console.log('Chunk:', chunk)
    chunks.push(chunk)
  }
  
  if (chunks.length !== 5) {
    throw new Error(`Stream test failed: expected 5 chunks, got ${chunks.length}`)
  }
  
  for (let i = 0; i < 5; i++) {
    if (chunks[i].type !== 'delta') {
      throw new Error(`Stream test failed: chunk ${i} has wrong type`)
    }
    if (chunks[i].index !== i) {
      throw new Error(`Stream test failed: chunk ${i} has wrong index`)
    }
  }
  
  console.log('✅ Stream test passed')
}

async function testState(bridge) {
  console.log('\n=== Test 4: State ===')
  const state = bridge.getState()
  console.log('State:', state)
  
  if (state.state !== 'running') {
    throw new Error(`State test failed: expected running, got ${state.state}`)
  }
  
  if (!bridge.isHealthy()) {
    throw new Error('State test failed: isHealthy returned false')
  }
  
  console.log('✅ State test passed')
}

async function testShutdown(bridge) {
  console.log('\n=== Test 5: Shutdown ===')
  await bridge.shutdown()
  
  const state = bridge.getState()
  console.log('State after shutdown:', state)
  
  if (state.state !== 'idle') {
    throw new Error(`Shutdown test failed: expected idle, got ${state.state}`)
  }
  
  if (bridge.isHealthy()) {
    throw new Error('Shutdown test failed: isHealthy returned true after shutdown')
  }
  
  console.log('✅ Shutdown test passed')
}

async function main() {
  console.log('Python Bridge Integration Test')
  console.log('================================')
  
  try {
    // Create bridge in dev mode
    const bridge = new PythonBridge({ 
      devMode: true,
      logLevel: 'DEBUG',
    })
    
    // Test warmup
    console.log('\n=== Warmup ===')
    const warmupResult = await bridge.warmup()
    console.log('Warmup result:', warmupResult)
    
    if (!warmupResult.ok) {
      throw new Error(`Warmup failed: ${warmupResult.error}`)
    }
    
    // Run tests
    await testEcho(bridge)
    await testPing(bridge)
    await testStream(bridge)
    await testState(bridge)
    await testShutdown(bridge)
    
    console.log('\n================================')
    console.log('✅ All tests passed!')
    
    process.exit(0)
    
  } catch (err) {
    console.error('\n❌ Test failed:', err.message)
    console.error(err.stack)
    process.exit(1)
  }
}

main()