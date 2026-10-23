# Workspace Agent Rules: ChaosBull Network Chaos Testing 🐂💥

## Slash Command: `/chaosbull`

Whenever the user prompts `/chaosbull` or asks to test network resilience, outages, latency, or API failure handling (e.g., `/chaosbull test application for checkout failure`):

1. **Activate ChaosBull Workflow**:
   - Use ChaosBull MCP server (connected via `npx -y chaosbull` or local `dist/index.js`).
   - Run chaos resilience inspection against designated URLs and network endpoints.

2. **Pre-Flight Backend & API Health Check (MANDATORY)**:
   - Before executing any chaos test, verify that the application's backend is actively running:
     - **Local Backend**: If the backend runs on the local machine (e.g. `http://localhost:8000`, `http://localhost:3001`, `http://localhost:5000`), ensure it is started and accepting connections.
     - **Hosted API**: If using a remote or hosted API, ensure the baseline endpoint is reachable and returning normal 2xx responses.
   - **Strict Abort Rule**: If the backend is **not started**, connection is refused (`ECONNREFUSED`), or there are backend mistakes (e.g., 500 Internal Server Error at baseline, unhandled exceptions, database connection drops):
     - **STOP TESTING IMMEDIATELY**.
     - Do NOT run chaos fault injection against an already broken or offline backend.
     - Inform the user of the exact backend issue with instructions on how to resolve it before proceeding with chaos resilience testing.

3. **Execute Live In-Browser Chaos Testing**:
   - Determine the target URL (e.g., active local development server `http://localhost:3000`, `http://localhost:5173`, or specified URL).
   - Determine the relevant network endpoints (e.g., `**/api/**`, `/api/payment`, `/api/auth`).
   - The browser automatically launches in **headed mode (`headless: false`)**, immediately redirecting the user to their application, letting the user watch the simulation live as the tools inject faults and observe how the UI behaves natively.
   - If the user wants to keep the browser open after testing to interactively inspect the app, pass `keep_browser_open: true`.
   - Call the corresponding ChaosBull MCP tool (`simulate_api_failure`, `inject_latency`, `block_resources`, `simulate_network_drop`, `trigger_system_network_error`, `simulate_stateful_failure`, `inject_response_corruption`, or `assert_chaos_handled`).

4. **Autonomous AI Diagnostic Analysis**:
   After obtaining the test execution output, analyze the failure thoroughly and output a structured report:
   - **What Failed**: Describe the exact failure symptom both from a real user's perspective (e.g. blank screen, stuck loader) and the technical error (e.g. unhandled rejection 503, failed fetch).
   - **Where It Failed**: Pinpoint the exact file, component, hook, or route in the codebase (e.g., `[src/components/Checkout.tsx](file:///...)`), citing the specific lines responsible.
   - **How to Fix**: Provide the exact code diff, implementing error boundaries, fallback UI states, retry backoff policies, or request timeouts.
   - **Verification**: Offer to apply the fix and re-run the ChaosBull test to verify that the app now survives.
