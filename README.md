# ChaosBull MCP 🐂💥

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![MCP Version](https://img.shields.io/badge/MCP-2024--11--05-blue.svg)](https://modelcontextprotocol.io)
[![Playwright](https://img.shields.io/badge/Playwright-1.52+-green.svg)](https://playwright.dev)

> **Dynamic browser network chaos engineering & resilience testing for AI agents and developers.**  
> _Your tests run on perfect networks. Your users don't. ChaosBull lets AI agents unleash controlled network havoc on web pages to verify they don't break in production._

📖 **New to Chaos Engineering or looking for an intuitive explanation?** Check out our [First Principles Guide for Non-Tech Minds](./CHAOSBULL_FIRST_PRINCIPLES.md) explaining how ChaosBull works using everyday analogies.

---

## ⚡ Why ChaosBull?

Continuous Integration (CI) and local dev environments have flawless connectivity:

- APIs respond in 15 milliseconds.
- CDNs never glitch.
- Cellular handoffs and elevator dead zones do not exist.

Then your code ships to real humans — and production breaks when a payment gateway returns a `503`, analytics scripts hang and block page hydration, or a mobile user enters an underground tunnel mid-checkout.

AI agents writing tests or performing QA normally have **no dynamic control** over the network layer inside real browser sessions. They can't ask:

- 🙈 _Does the checkout page display a polite fallback banner if Stripe is down?_
- 🙈 _Does the dashboard show skeleton loaders when the API takes 3 seconds?_
- 🙈 _Does the application function normally if third-party tracking scripts are blocked?_
- 🙈 _What happens if the network drops right after the user taps "Place Order"?_
- 🙈 _Does the app automatically retry and recover from transient 503 errors?_

**ChaosBull gives AI agents and automated workflows the power to charge into your network layer, sabotage connections on demand, and assert whether your app survives.**

---

## 🛠️ The 8 ChaosBull Superpowers

```
                    ┌──────────────────────────────────────────────┐
                    │               ChaosBull Engine               │
                    └──────────────────────┬───────────────────────┘
                                           │
         ┌──────────────────┬──────────────┴─────┬──────────────────┐
         │                  │                    │                  │
         ▼                  ▼                    ▼                  ▼
  API Failures         Latency & Jitter      Mid-Flight Drops    Resource Blocks
 (500/502/503/etc)     (Slow 3G/Timeouts)     (Aborted Streams)  (Ads/Analytics)
         │                  │                    │                  │
         ▼                  ▼                    ▼                  ▼
  OS Network Drops     Transient Retries     Corrupted Payloads  Resilience Verdict
(DNS/EAI_AGAIN/Abort)  (Fail N -> Succeed)   (Truncated/Bad JSON) (Pass/Fail Score)
```

### 1. `simulate_api_failure`

Intercepts requests matching a URL pattern and forces them to return an error HTTP status code. Verifies if the frontend renders a fallback UI element instead of crashing.

```json
{
  "url": "https://example.com/checkout",
  "intercept_pattern": "**/api/payment**",
  "status_code": 503,
  "response_body": "{\"error\":\"Service Unavailable\"}",
  "fallback_selector": ".error-boundary",
  "wait_ms": 2000
}
```

**Output:**

```json
{
  "url": "https://example.com/checkout",
  "intercept_pattern": "**/api/payment**",
  "intercepted_count": 1,
  "intercepted_requests": [
    { "url": "https://example.com/api/payment", "method": "POST", "status": 503 }
  ],
  "fallback_found": true,
  "fallback_selector": ".error-boundary",
  "page_state": {
    "page_errors": [],
    "console_errors": ["Failed to load resource: the server responded with a status of 503"]
  },
  "wait_time_ms": 2000
}
```

---

### 2. `inject_latency`

Injects deliberate delays and jitter into matching requests to simulate slow mobile connections, saturated links, or overloaded backend services. Checks if loading skeletons appear.

```json
{
  "url": "https://example.com/dashboard",
  "intercept_pattern": "**/api/stats**",
  "latency_ms": 3000,
  "jitter_ms": 500,
  "loading_selector": ".skeleton-card"
}
```

**Output:**

```json
{
  "url": "https://example.com/dashboard",
  "intercept_pattern": "**/api/stats**",
  "intercepted_count": 1,
  "intercepted_requests": [
    { "url": "https://example.com/api/stats", "method": "GET", "delay_ms": 3218 }
  ],
  "loading_state_found": true,
  "page_state": { "page_errors": [], "console_errors": [] },
  "load_time_ms": 3410
}
```

---

### 3. `block_resources`

Aborts matching requests outright to simulate third-party outages (e.g., Google Analytics, Tag Manager, Hotjar, external CDN font providers). Asserts whether the core app UI remains functional.

```json
{
  "url": "https://example.com",
  "block_patterns": ["**/analytics**", "*.doubleclick.net/**", "**/tracker.js"],
  "core_content_selector": "#main-app-content",
  "wait_ms": 2000
}
```

**Output:**

```json
{
  "url": "https://example.com",
  "block_patterns": ["**/analytics**", "*.doubleclick.net/**", "**/tracker.js"],
  "blocked_count": 3,
  "blocked_urls": ["https://example.com/analytics.js", "https://stats.doubleclick.net/collect"],
  "core_content_found": true,
  "page_state": { "page_errors": [], "console_errors": [] },
  "wait_time_ms": 2000
}
```

---

### 4. `simulate_network_drop`

Simulates sudden connection loss mid-stream (like entering a subway tunnel) by aborting in-flight requests after a defined delay.

```json
{
  "url": "https://example.com/cart",
  "intercept_pattern": "**/api/order/submit**",
  "drop_after_ms": 400,
  "fallback_selector": ".offline-alert",
  "wait_ms": 2000
}
```

---

### 5. `trigger_system_network_error`

Fails requests with low-level OS/protocol socket errors: `addressunreachable` (DNS failure), `connectionaborted` (reset by peer), `accessdenied` (firewall blocks), or `aborted`.

```json
{
  "url": "https://example.com/feed",
  "intercept_pattern": "**/api/**",
  "error_code": "addressunreachable",
  "fallback_selector": ".dns-fail-banner",
  "wait_ms": 1500
}
```

---

### 6. `simulate_stateful_failure`

Fails the first $N$ requests with an error status (e.g., `503`), then allows subsequent requests to succeed. Verifies if client-side retry/backoff mechanisms recover automatically without user intervention.

```json
{
  "url": "https://example.com/reports",
  "intercept_pattern": "**/api/generate**",
  "http_status": 503,
  "failure_count": 2,
  "success_payload": "{\"status\":\"ready\",\"reportId\":\"12345\"}",
  "fallback_selector": ".retry-indicator",
  "wait_ms": 3000
}
```

---

### 7. `inject_response_corruption`

Feeds damaged payloads to the browser:

- `malformed_json`: Incomplete or broken JSON objects.
- `length_mismatch`: `Content-Length` header advertises 99,999 bytes, but only sends 20 bytes.
- `truncated`: Payload severed at `truncate_at_byte`.

Tests if client JSON parsers crash the JavaScript runtime or fail cleanly.

```json
{
  "url": "https://example.com/profile",
  "intercept_pattern": "**/api/user**",
  "corruption_type": "malformed_json",
  "fallback_selector": ".data-error-notice",
  "wait_ms": 2000
}
```

---

### 8. `assert_chaos_handled`

The ultimate resilience test. Injects failure into target endpoints and executes an automated inspection:

1. Did unhandled JavaScript exceptions occur? (`page_errors`)
2. Did console errors cascade out of control?
3. Did the designated fallback/error recovery UI appear?
4. **Calculates `chaos_survived: true | false`**.

```json
{
  "url": "https://example.com/pricing",
  "intercept_pattern": "**/api/tiers**",
  "http_status": 500,
  "expected_fallback_selector": ".error-fallback-container",
  "wait_ms": 2000
}
```

**Output:**

```json
{
  "url": "https://example.com/pricing",
  "intercept_pattern": "**/api/tiers**",
  "http_status": 500,
  "unhandled_exceptions": [],
  "console_errors": ["Failed to load resource: status 500"],
  "fallback_ui_detected": true,
  "expected_fallback_selector": ".error-fallback-container",
  "chaos_survived": true,
  "wait_time_ms": 2000
}
```

---

## 🔌 1-Minute Setup

You do **not** need to manually clone or install anything. Just add ChaosBull to your AI assistant:

### Cursor, Claude Desktop, Antigravity & Windsurf

Add this to your MCP configuration (`claude_desktop_config.json`, `.cursor/mcp.json`, or IDE MCP settings):

```json
{
  "mcpServers": {
    "chaosbull": {
      "command": "npx",
      "args": ["-y", "chaosbull"]
    }
  }
}
```

> **Cursor UI Shortcut**: Go to **Settings ➔ MCP ➔ Add New MCP Server**:
>
> - **Name:** `chaosbull`
> - **Type:** `command`
> - **Command:** `npx -y chaosbull`

That's it! Your AI assistant will automatically launch ChaosBull on demand and gain access to all 8 resilience tools.

---

## 💻 Development & Testing

```bash
# Install dependencies
pnpm install

# Install Playwright browser
pnpm exec playwright install chromium

# Build TypeScript
pnpm run build

# Run automated smoke suite
pnpm test
```

---

## 📄 License

MIT © [ChaosBull](https://github.com/Omkar2240/chaosbull-mcp)
