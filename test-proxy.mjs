import { spawn } from 'child_process';
import path from 'path';
import os from 'os';

const npmBinDir = path.join(os.homedir(), 'AppData', 'Roaming', 'npm');
const isWin = process.platform === 'win32';
const codexBin = path.join(npmBinDir, isWin ? 'codex.cmd' : 'codex');
const proxyUrl = 'http://127.0.0.1:10080';

console.log('=== Test 1: Using shell: true with full path to codex.cmd ===');
console.log('Binary:', codexBin);
console.log('Proxy:', proxyUrl);
console.log('');

const testEnv = {
  ...process.env,
  HTTP_PROXY: proxyUrl,
  HTTPS_PROXY: proxyUrl,
  http_proxy: proxyUrl,
  https_proxy: proxyUrl,
  NO_COLOR: '1',
  TERM: 'dumb',
  CLICOLOR: '0',
};

const proc = spawn(codexBin, ['login', '--device-auth'], {
  env: testEnv,
  cwd: process.cwd(),
  shell: isWin,
  stdio: ['pipe', 'pipe', 'pipe'],
  windowsHide: true,
});

let output = '';
let gotData = false;

proc.stdout.on('data', (data) => {
  gotData = true;
  const text = data.toString();
  output += text;
  console.log('[STDOUT]:', JSON.stringify(text));
});

proc.stderr.on('data', (data) => {
  gotData = true;
  const text = data.toString();
  output += text;
  console.log('[STDERR]:', JSON.stringify(text));
});

proc.on('spawn', () => {
  console.log('[SPAWNED] Process started successfully, PID:', proc.pid);
});

proc.on('error', (err) => {
  console.error('[ERROR]:', err);
});

proc.on('close', (code) => {
  console.log('\n[CLOSE] Exit code:', code);
  if (!gotData) {
    console.log('WARNING: No data received from stdout/stderr before exit!');
  }
  process.exit(0);
});

setTimeout(() => {
  console.log('\n=== TIMEOUT after 15s, killing process ===');
  proc.kill();
}, 15000);
