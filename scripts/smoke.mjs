import { spawn } from 'child_process';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = join(__dirname, '..', 'dist', 'index.js');

async function startHttpServer() {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      if (req.url === '/' || req.url === '') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<!doctype html><html><body>
<div id="status">loading</div>
<div id="error" style="display:none">Error</div>
<script>
fetch('/api/test')
  .then(r => r.json())
  .then(() => { document.getElementById('status').textContent = 'ok'; })
  .catch(() => { document.getElementById('error').style.display = 'block'; });
</script>
</body></html>`);
      } else if (req.url === '/api/test') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } else {
        res.writeHead(404).end();
      }
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, port, url: `http://127.0.0.1:${port}/` });
    });
    server.on('error', reject);
  });
}

const { server, url: serverUrl } = await startHttpServer();

const TESTS = [
  {
    name: 'initialize + tools/list',
    messages: [
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test', version: '1' },
        },
      },
      { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
    ],
    check: (responses) => {
      const list = responses.find((r) => r.id === 2);
      const tools = list?.result?.tools?.map((t) => t.name) ?? [];
      console.log(`  tools: ${tools.join(', ')}`);
      return tools.length === 8;
    },
  },
  {
    name: 'trigger_system_network_error',
    messages: [
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test', version: '1' },
        },
      },
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'trigger_system_network_error',
          arguments: {
            url: serverUrl,
            intercept_pattern: '**/api/**',
            error_code: 'aborted',
            wait_ms: 500,
          },
        },
      },
    ],
    check: (responses) => {
      const r = responses.find((r) => r.id === 2);
      if (r?.result?.isError) {
        console.log('  isError:', r.result.content[0].text);
        return false;
      }
      const out = JSON.parse(r?.result?.content?.[0]?.text ?? '{}');
      console.log(
        `  error_code=${out.error_code} intercepted=${out.intercepted_count} fallback=${out.fallback_found}`
      );
      return out.error_code === 'aborted' && out.intercepted_count >= 1;
    },
  },
  {
    name: 'simulate_stateful_failure',
    messages: [
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test', version: '1' },
        },
      },
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'simulate_stateful_failure',
          arguments: {
            url: serverUrl,
            intercept_pattern: '**/api/**',
            http_status: 503,
            failure_count: 1,
            wait_ms: 500,
          },
        },
      },
    ],
    check: (responses) => {
      const r = responses.find((r) => r.id === 2);
      if (r?.result?.isError) {
        console.log('  isError:', r.result.content[0].text);
        return false;
      }
      const out = JSON.parse(r?.result?.content?.[0]?.text ?? '{}');
      console.log(
        `  failure_count=${out.failure_count} actual_failed=${out.actual_failed} actual_succeeded=${out.actual_succeeded}`
      );
      return out.failure_count === 1 && out.actual_failed >= 1;
    },
  },
  {
    name: 'inject_response_corruption',
    messages: [
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test', version: '1' },
        },
      },
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'inject_response_corruption',
          arguments: {
            url: serverUrl,
            intercept_pattern: '**/api/**',
            corruption_type: 'malformed_json',
            wait_ms: 500,
          },
        },
      },
    ],
    check: (responses) => {
      const r = responses.find((r) => r.id === 2);
      if (r?.result?.isError) {
        console.log('  isError:', r.result.content[0].text);
        return false;
      }
      const out = JSON.parse(r?.result?.content?.[0]?.text ?? '{}');
      console.log(`  corruption_type=${out.corruption_type} intercepted=${out.intercepted_count}`);
      return out.corruption_type === 'malformed_json' && out.intercepted_count >= 1;
    },
  },
  {
    name: 'assert_chaos_handled',
    messages: [
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test', version: '1' },
        },
      },
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'assert_chaos_handled',
          arguments: {
            url: serverUrl,
            intercept_pattern: '**/api/**',
            http_status: 500,
            wait_ms: 500,
          },
        },
      },
    ],
    check: (responses) => {
      const r = responses.find((r) => r.id === 2);
      if (r?.result?.isError) {
        console.log('  isError:', r.result.content[0].text);
        return false;
      }
      const out = JSON.parse(r?.result?.content?.[0]?.text ?? '{}');
      console.log(
        `  http_status=${out.http_status} chaos_survived=${out.chaos_survived} exceptions=${out.unhandled_exceptions.length}`
      );
      return out.http_status === 500;
    },
  },
];

async function runTest(test) {
  return new Promise((resolve) => {
    const proc = spawn('node', [serverPath], { stdio: ['pipe', 'pipe', 'pipe'] });
    const input = test.messages.map((m) => JSON.stringify(m)).join('\n') + '\n';
    const lastId = Math.max(...test.messages.map((m) => m.id));
    const responses = [];
    let buf = '';
    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);

      let result;
      try {
        result = test.check(responses);
      } catch (e) {
        console.log('  check error:', e.message);
        result = false;
      }

      proc.kill('SIGTERM');
      const killTimeout = setTimeout(() => {
        try {
          proc.kill('SIGKILL');
        } catch {}
      }, 3000);
      proc.on('close', () => clearTimeout(killTimeout));

      resolve(result);
    };

    const timer = setTimeout(() => {
      console.log('  timeout');
      finish();
    }, 25000);

    proc.stdout.on('data', (d) => {
      buf += d.toString();
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        try {
          const r = JSON.parse(line);
          responses.push(r);
          if (r.id === lastId) {
            finish();
          }
        } catch {}
      }
    });

    proc.on('close', () => {
      clearTimeout(timer);
      finish();
    });

    proc.stdin.write(input);
    proc.stdin.end();
  });
}

let passed = 0;
let failed = 0;

for (const test of TESTS) {
  process.stdout.write(`\n[${test.name}]\n`);
  const ok = await runTest(test);
  if (ok) {
    console.log('  ✓ pass');
    passed++;
  } else {
    console.log('  ✗ fail');
    failed++;
  }
}

server.close();
console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed > 0 ? 1 : 0);
