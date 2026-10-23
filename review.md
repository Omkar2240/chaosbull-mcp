# Review Notes — Validation Hang

This project currently has a validation/lifecycle problem. The MCP tools can return a JSON response, but browser-backed validation commands can leave `node dist/index.js` and `chrome-headless-shell` running forever.

This is why a Claude/Codex validation pass can appear to "hang" for a very long time even after the tool has already printed a successful result.

## 1. Root Cause: Browser Handle Keeps The MCP Process Alive

Reproduction:

```bash
npm run build

printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1"}}}\n{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"trigger_system_network_error","arguments":{"url":"data:text/html,<html><body><div id=\"error\" style=\"display:none\">Failed</div></body></html>","intercept_pattern":"**/nonexistent/**","error_code":"aborted","wait_ms":100}}}\n' \
  | node dist/index.js 2>/dev/null
```

Observed behavior:

- The MCP response is printed.
- The shell command does not exit.
- `node dist/index.js` remains alive.
- Playwright's `chrome-headless-shell` remains alive.

Relevant files:

- `src/browser.ts`
- `src/index.ts`

Why this happens:

- `src/browser.ts` keeps a singleton `browserPromise`.
- `withPage()` closes each browser context, but it does not close the browser.
- `closeBrowser()` is only called from `SIGINT` / `SIGTERM` handlers in `src/index.ts`.
- A normal validation pipeline like `printf ... | node dist/index.js` closes stdin, but it does not send `SIGTERM`.
- The MCP SDK stdio transport does not automatically close on stdin EOF.
- The open browser process keeps Node's event loop alive forever.

Suggested fixes:

1. Add an official bounded validation harness for browser-backed tools and make it the only recommended smoke path.
2. Add a hard `SIGKILL` fallback in the harness after `SIGTERM`, so stuck browser children cannot survive.
3. Consider an explicit validation/test mode such as `MCP_EXIT_AFTER_RESPONSE=1` or `MCP_EXIT_ON_STDIN_EOF=1`, implemented carefully so it exits only after all in-flight tool calls finish.
4. Alternatively, close the browser after each browser-backed tool call. This is slower, but makes one-shot stdio validation naturally terminate.

Do not rely on the generic raw `printf ... | node dist/index.js` validation form for this project until lifecycle cleanup is fixed.

## 2. Current Smoke Test Passes Without Actually Injecting Chaos

`npm run smoke` currently finishes, but it is not a strong validation.

Example smoke output:

```text
[trigger_system_network_error]
  error_code=aborted intercepted=0 fallback=false
  pass

[simulate_stateful_failure]
  failure_count=2 actual_failed=0 actual_succeeded=0
  pass

[inject_response_corruption]
  corruption_type=malformed_json intercepted=0
  pass
```

This means the smoke test can pass even when no request was intercepted.

Relevant file:

- `scripts/smoke.mjs`

Why this is a problem:

- The test uses a `data:` URL.
- The `intercept_pattern` is often `**/nonexistent/**`, so no request matches.
- The checks assert that the output echoes the requested mode, not that Playwright actually routed and modified a network request.

Suggested fix:

- Start a tiny local HTTP server inside `scripts/smoke.mjs`.
- Serve a page that performs real `fetch("/api/test")` requests.
- Use an intercept pattern that must match those requests.
- Assert behavior-specific fields:
  - `trigger_system_network_error`: `intercepted_count >= 1`
  - `simulate_stateful_failure`: `actual_failed === failure_count`
  - `inject_response_corruption`: `intercepted_count >= 1`
  - `assert_chaos_handled`: verify the verdict fields after a real intercepted request
- Fail the smoke test if no request was intercepted.

The current smoke test proves that the MCP handler returns a response. It does not prove that network chaos works.

## 3. CI Does Not Run The Smoke Test

The CI workflow currently runs:

```text
npm ci
npx playwright install chromium --with-deps
npm run format:check
npm run lint
npm run build
```

It does not run:

```bash
npm run smoke
```

Relevant file:

- `.github/workflows/ci.yml`

Suggested fix:

- Add `npm run smoke` after `npm run build`.
- Keep the smoke test bounded with per-tool timeouts.
- Make sure the smoke script kills its MCP child process and any browser children even on failure.

## 4. Add A Real `test` Script

This package has no `npm test` script. The repository-wide validation playbook expects every MCP project to support:

```bash
npm test
```

Suggested fix:

```json
{
  "scripts": {
    "test": "npm run smoke"
  }
}
```

or, if unit tests are later added:

```json
{
  "scripts": {
    "test": "vitest run --passWithNoTests && npm run smoke"
  }
}
```

## 5. Make The Smoke Harness Kill Children Reliably

`scripts/smoke.mjs` currently calls:

```js
proc.kill('SIGTERM');
```

That is not enough for browser-backed validation. If the MCP child traps `SIGTERM` and hangs while closing Chromium, the parent can move on while orphaned browser processes remain alive.

Suggested fix:

- Start the child in its own process group where supported.
- On finish, send `SIGTERM`.
- After a short grace period, send `SIGKILL`.
- Also kill child Playwright browser processes if the main child does not exit.
- Print a clear error if cleanup required a hard kill.

## 6. Document The Correct Validation Command

Because this MCP launches a browser, the normal generic validation command is unsafe:

```bash
printf '...' | node dist/index.js
```

It may print a response and still never exit.

The README and review docs should explicitly say:

```bash
npm run build
npm run smoke
```

is the supported project-level smoke validation path.

If direct stdio calls are used during manual debugging, they must be wrapped in a timeout or followed by explicit process cleanup.

## Verification Already Run

- `npm run build` — passed
- `npm run lint` — passed
- `npm run format:check` — passed
- `npm run smoke` — completed, but assertions are too weak
- Direct stdio `trigger_system_network_error` call — returned JSON, then hung indefinitely because Chromium remained open
- Process inspection confirmed lingering `node dist/index.js` and `chrome-headless-shell` processes from browser-backed validation attempts
