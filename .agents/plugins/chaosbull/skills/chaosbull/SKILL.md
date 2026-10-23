---
name: chaosbull
description: >-
  Autonomous network chaos testing and resilience auditing engine.
  Activates whenever the user writes '/chaosbull' or asks to test network failures,
  API outages, slow connections, or error boundaries. Executes ChaosBull MCP tools,
  diagnoses crashes using AI, identifies exact failing files/lines in the codebase,
  and provides copy-paste code fixes.
---

# ChaosBull: Autonomous Network Chaos & Resilience Engine 🐂💥

When the user invokes `/chaosbull` or requests a resilience/chaos test (e.g. `/chaosbull test checkout when payment API fails 503`), you must execute the automated resilience inspection workflow.

---

## ⚡ Execution Workflow

```
 USER PROMPT: "/chaosbull test <feature> for <scenario>"
                         │
                         ▼
        0. PRE-FLIGHT BACKEND & API HEALTH CHECK
   (Verify backend is running locally or hosted API is alive)
   ├── ❌ Backend Mistakes / Offline ➔ STOP TESTING & REPORT ISSUE
   └── ✅ Backend Operational ➔ PROCEED
                         │
                         ▼
            1. IDENTIFY TARGET & INTENT
    (URL / Local Dev Server / Route / Failure Type)
                         │
                         ▼
         2. EXECUTE CHAOSBULL MCP TOOL(S)
    (simulate_api_failure / inject_latency / etc.)
                         │
                         ▼
         3. COLLECT RESULTS & STACK TRACES
    (Console errors, page errors, fallback detection)
                         │
                         ▼
              4. AI ROOT-CAUSE AUDIT
   (Locate exact source code file & line numbers)
                         │
                         ▼
          5. DELIVER RESILIENCE REPORT
   (What Failed ➔ Where It Failed ➔ How to Fix)
```

---

## Step 0: Pre-Flight Backend & API Health Check (MANDATORY)

Before executing any chaos test or injecting network faults:

1. **Verify Local Backend is Started**:
   - Check if the backend service is running on the local machine (e.g., `http://localhost:8000`, `http://localhost:3001`, `http://localhost:5000`).
   - If the backend is **not started**, check project files (`package.json`, scripts) and either start it or notify the user.
2. **Verify Hosted API is Working**:
   - If the application connects to a remote or hosted API (e.g. staging or production backend), verify that the API is online and responding with healthy 2xx status codes under normal conditions.
3. **Strict Abort on Backend Mistakes**:
   - If the backend is offline (`ECONNREFUSED`), returns a 500 error at baseline, throws database connection errors, has unhandled exceptions, or fails health checks:
   - **STOP TESTING IMMEDIATELY**.
   - Do NOT proceed with chaos testing or open browser tests against a broken backend.
   - Explain the exact backend mistake to the user so they can fix their server before testing UI resilience.

---

## Step 1: Parse User Request & Select Chaos Tool

Map the user's intent to one or more of the 8 ChaosBull tools:

| User Scenario                                               | ChaosBull MCP Tool             | Key Parameters                                                                        |
| :---------------------------------------------------------- | :----------------------------- | :------------------------------------------------------------------------------------ |
| **API Outages / HTTP Errors** (e.g., 500, 503, 404)         | `simulate_api_failure`         | `url`, `intercept_pattern`, `status_code`, `fallback_selector`                        |
| **Slow Connections / Network Lag** (e.g., 3G, hanging APIs) | `inject_latency`               | `url`, `intercept_pattern`, `latency_ms`, `loading_selector`                          |
| **Third-Party Script Outages** (Analytics, CDNs, Ads)       | `block_resources`              | `url`, `block_patterns`, `core_content_selector`                                      |
| **Sudden Connection Drop** (Tunnel, Subway, Wi-Fi drop)     | `simulate_network_drop`        | `url`, `intercept_pattern`, `drop_after_ms`, `fallback_selector`                      |
| **Operating System / DNS Failure**                          | `trigger_system_network_error` | `url`, `intercept_pattern`, `error_code` (`addressunreachable` / `connectionaborted`) |
| **Transient Glitches & Automatic Retry**                    | `simulate_stateful_failure`    | `url`, `intercept_pattern`, `failure_count`, `http_status`                            |
| **Corrupted / Damaged Data** (Malformed JSON)               | `inject_response_corruption`   | `url`, `intercept_pattern`, `corruption_type: 'malformed_json'`                       |
| **Comprehensive Resilience Verdict**                        | `assert_chaos_handled`         | `url`, `intercept_pattern`, `http_status`, `expected_fallback_selector`               |

_If the target URL is not specified by the user, inspect running dev servers (e.g. `http://localhost:3000` or `http://localhost:5173`) or use the active page/route under development._
_Optionally pass `api_health_check_url` to automatically verify the backend API before injecting chaos._

---

## Step 2: Run the ChaosBull Test (Live In-Browser Simulation)

Call the selected ChaosBull MCP tool.
The tool automatically:

1. **Launches the browser in headed mode (`headless: false`)** right on the user's screen.
2. **Navigates directly to the user's application** (`url`).
3. **Simulates the network chaos** while the user observes what is performing and how the UI behaves (loading skeletons, fallback states, error toasts, or crashes).
4. **Evaluates resilience** and returns the diagnostic results (keeps the browser open if `keep_browser_open: true` was requested).

Examine the returned payload:

- `fallback_found`: Did the required fallback UI element appear?
- `page_state.page_errors`: Unhandled JavaScript exceptions thrown in the window.
- `page_state.console_errors`: Network errors, warnings, unhandled promise rejections.
- `chaos_survived`: Boolean verdict from `assert_chaos_handled`.

---

## Step 3: AI Codebase Inspection (Find "Where")

If the test failed (e.g., fallback not found, unhandled exception thrown, or infinite loading):

1. **Search the codebase** using `grep_search` or `find_by_name` for the intercepted endpoint (e.g. `/api/payment`, `useQuery`, `fetch`, `axios`).
2. Identify the exact frontend file, component, hook, or controller handling this request.
3. Check how errors and loading states are caught (or neglected):
   - Is there a `try...catch` block?
   - Is there an `onError` callback or React Error Boundary?
   - Is there a state variable (e.g. `isError`, `error`) that is missing a UI branch?
   - Is there an AbortController with a timeout for slow requests?

---

## Step 4: Deliver the Structured Resilience Report

Always format your response using this structure:

### 🐂 ChaosBull Test Report

#### 📊 1. Test Summary

- **Target URL**: `<url>`
- **Chaos Scenario Injected**: `<Description of chaos, status code, latency, or pattern>`
- **Result**: ❌ **FAILED (Chaos Not Handled)** or ✅ **PASSED (Resilient)**

---

#### 💥 2. What Failed?

- **User Experience Impact**: Plain English explanation of what a real user sees (e.g., _"The checkout page went completely blank with a white screen of death instead of notifying the customer that the payment service was temporarily unavailable."_).
- **Technical Error**: Specific runtime error (e.g., `TypeError: Cannot read properties of undefined (reading 'data')` or `Unhandled Promise Rejection: 503 Service Unavailable`).

---

#### 📍 3. Where It Failed?

- **File**: `[src/components/CheckoutForm.tsx](file:///path/to/src/components/CheckoutForm.tsx#L45-L62)`
- **Function / Component**: `<ComponentName>` at line `<line_number>`
- **Root Cause**: Explanation of why the code crashed (e.g. missing error boundary, missing null check on response, no timeout handler).

---

#### 🛠️ 4. How to Fix It

Provide the exact, ready-to-apply code solution:

```diff
- // Vulnerable code
+ // Resilient code with error handling & fallback UI
```

Include architectural recommendations if relevant (e.g., adding an ErrorBoundary, React Query retry policy, or toast notification).

---

#### 🔄 5. Automated Verification

Offer to automatically apply the fix and re-run ChaosBull to confirm that `chaos_survived` turns to `true`!
