#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as z from 'zod/v4';
import {
  simulateApiFailure,
  injectLatency,
  blockResources,
  simulateNetworkDrop,
  triggerSystemNetworkError,
  simulateStatefulFailure,
  injectResponseCorruption,
  assertChaosHandled,
  DEFAULT_WAIT_MS,
} from './chaos.js';
import { closeBrowser } from './browser.js';

const server = new McpServer({
  name: 'chaosbull-mcp',
  version: '1.0.0',
});

const viewportSchema = z
  .object({
    width: z.number().int().min(320).max(3840).describe('Viewport width in px'),
    height: z.number().int().min(240).max(2160).describe('Viewport height in px'),
  })
  .optional()
  .describe('Viewport size (default: 1280×720)');

const browserControlSchema = {
  headless: z
    .boolean()
    .optional()
    .describe(
      'Whether to run in headless mode (default: false, launches real browser so user sees application)'
    ),
  keep_browser_open: z
    .boolean()
    .optional()
    .describe(
      'Keep browser window open after test completes so user can interactively inspect the app (default: false)'
    ),
  preview_delay_ms: z
    .number()
    .int()
    .min(0)
    .max(10000)
    .optional()
    .describe(
      'Milliseconds to pause after simulation before closing browser, allowing visual inspection (default: 2000)'
    ),
  api_health_check_url: z
    .string()
    .url()
    .optional()
    .describe(
      'Optional backend or hosted API health check URL to verify before running chaos test. Aborts if backend is down or errors.'
    ),
};

function errorResponse(err: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: `Error: ${err instanceof Error ? err.message : String(err)}`,
      },
    ],
    isError: true,
  };
}

server.registerTool(
  'simulate_api_failure',
  {
    description:
      'Opens the browser, redirects directly to the user application, and intercepts API requests matching a URL pattern ' +
      'to return an error status code. Checks if a fallback UI element appears. ' +
      'Use to answer: does the app show a proper error state when the payment API returns 503?',
    inputSchema: {
      url: z.string().url().describe('URL of the page to test'),
      intercept_pattern: z
        .string()
        .describe("Glob pattern for requests to intercept (e.g., '**/api/payment**')"),
      status_code: z
        .number()
        .int()
        .min(400)
        .max(599)
        .default(503)
        .describe('HTTP error status code to return (default: 503)'),
      response_body: z
        .string()
        .default('{"error":"Service Unavailable"}')
        .describe('Response body to return for intercepted requests'),
      fallback_selector: z
        .string()
        .optional()
        .describe("CSS selector for the fallback UI that should appear (e.g., '.error-boundary')"),
      wait_ms: z
        .number()
        .int()
        .min(0)
        .max(10000)
        .default(DEFAULT_WAIT_MS)
        .describe(
          'Milliseconds to wait after navigation before checking the fallback (default: 2000)'
        ),
      viewport: viewportSchema,
      ...browserControlSchema,
    },
  },
  async ({
    url,
    intercept_pattern,
    status_code,
    response_body,
    fallback_selector,
    wait_ms,
    viewport,
    headless,
    keep_browser_open,
    preview_delay_ms,
    api_health_check_url,
  }) => {
    try {
      const result = await simulateApiFailure(
        url,
        intercept_pattern,
        status_code,
        response_body,
        fallback_selector ?? null,
        wait_ms,
        viewport,
        {
          headless,
          keepBrowserOpen: keep_browser_open,
          previewDelayMs: preview_delay_ms,
          apiHealthCheckUrl: api_health_check_url,
        }
      );
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return errorResponse(err);
    }
  }
);

server.registerTool(
  'inject_latency',
  {
    description:
      'Opens the browser, navigates directly to the user application, and adds artificial delay to requests matching a URL pattern. ' +
      'Observes whether loading indicators or skeleton screens appear. ' +
      'Use to answer: does the app show loading states when the API takes 3 seconds? Does it time out gracefully?',
    inputSchema: {
      url: z.string().url().describe('URL of the page to test'),
      intercept_pattern: z
        .string()
        .describe("Glob pattern for requests to delay (e.g., '**/api/**')"),
      latency_ms: z
        .number()
        .int()
        .min(0)
        .max(30000)
        .default(3000)
        .describe('Base delay in milliseconds to add to each matched request (default: 3000)'),
      jitter_ms: z
        .number()
        .int()
        .min(0)
        .max(5000)
        .default(0)
        .describe('Random additional delay in milliseconds (default: 0)'),
      loading_selector: z
        .string()
        .optional()
        .describe(
          "CSS selector for the loading state that should appear (e.g., '.skeleton-loader')"
        ),
      viewport: viewportSchema,
      ...browserControlSchema,
    },
  },
  async ({
    url,
    intercept_pattern,
    latency_ms,
    jitter_ms,
    loading_selector,
    viewport,
    headless,
    keep_browser_open,
    preview_delay_ms,
    api_health_check_url,
  }) => {
    try {
      const result = await injectLatency(
        url,
        intercept_pattern,
        latency_ms,
        jitter_ms,
        loading_selector ?? null,
        viewport,
        {
          headless,
          keepBrowserOpen: keep_browser_open,
          previewDelayMs: preview_delay_ms,
          apiHealthCheckUrl: api_health_check_url,
        }
      );
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return errorResponse(err);
    }
  }
);

server.registerTool(
  'block_resources',
  {
    description:
      'Opens the browser, navigates to the user application, and blocks requests to specified URL patterns. ' +
      'Simulates third-party outages (analytics, CDNs, tracking) and verifies core content integrity. ' +
      'Use to answer: does the app still load and function if Google Analytics or a CDN is down?',
    inputSchema: {
      url: z.string().url().describe('URL of the page to test'),
      block_patterns: z
        .array(z.string())
        .min(1)
        .max(20)
        .describe(
          "Glob patterns for requests to block (e.g., ['**/analytics**', '*.doubleclick.net/**'])"
        ),
      core_content_selector: z
        .string()
        .optional()
        .describe(
          "CSS selector for core content that must still be present (e.g., '.main-content')"
        ),
      wait_ms: z
        .number()
        .int()
        .min(0)
        .max(10000)
        .default(DEFAULT_WAIT_MS)
        .describe(
          'Milliseconds to wait after navigation before checking core content (default: 2000)'
        ),
      viewport: viewportSchema,
      ...browserControlSchema,
    },
  },
  async ({
    url,
    block_patterns,
    core_content_selector,
    wait_ms,
    viewport,
    headless,
    keep_browser_open,
    preview_delay_ms,
    api_health_check_url,
  }) => {
    try {
      const result = await blockResources(
        url,
        block_patterns,
        core_content_selector ?? null,
        wait_ms,
        viewport,
        {
          headless,
          keepBrowserOpen: keep_browser_open,
          previewDelayMs: preview_delay_ms,
          apiHealthCheckUrl: api_health_check_url,
        }
      );
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return errorResponse(err);
    }
  }
);

server.registerTool(
  'simulate_network_drop',
  {
    description:
      'Opens the browser, navigates to the application, and aborts requests matching a pattern after a delay, ' +
      'simulating a mid-flight connection drop. ' +
      'Use to answer: what happens if the network drops after the order request is sent but before the response arrives?',
    inputSchema: {
      url: z.string().url().describe('URL of the page to test'),
      intercept_pattern: z
        .string()
        .describe("Glob pattern for requests to drop (e.g., '**/api/order**')"),
      drop_after_ms: z
        .number()
        .int()
        .min(0)
        .max(10000)
        .default(500)
        .describe(
          'Milliseconds to wait before aborting the request, simulating mid-flight drop (default: 500)'
        ),
      fallback_selector: z
        .string()
        .optional()
        .describe("CSS selector for the fallback UI that should appear (e.g., '.timeout-error')"),
      wait_ms: z
        .number()
        .int()
        .min(0)
        .max(10000)
        .default(DEFAULT_WAIT_MS)
        .describe('Milliseconds to wait after navigation before checking fallback (default: 2000)'),
      viewport: viewportSchema,
      ...browserControlSchema,
    },
  },
  async ({
    url,
    intercept_pattern,
    drop_after_ms,
    fallback_selector,
    wait_ms,
    viewport,
    headless,
    keep_browser_open,
    preview_delay_ms,
    api_health_check_url,
  }) => {
    try {
      const result = await simulateNetworkDrop(
        url,
        intercept_pattern,
        drop_after_ms,
        fallback_selector ?? null,
        wait_ms,
        viewport,
        {
          headless,
          keepBrowserOpen: keep_browser_open,
          previewDelayMs: preview_delay_ms,
          apiHealthCheckUrl: api_health_check_url,
        }
      );
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return errorResponse(err);
    }
  }
);

server.registerTool(
  'trigger_system_network_error',
  {
    description:
      'Opens the browser, navigates to the application, and aborts requests matching a URL pattern with a system-level network error code, ' +
      'simulating OS-level failures like unreachable hosts or access denied. ' +
      'Use to answer: does the app recover when the DNS resolution fails or the OS rejects a connection?',
    inputSchema: {
      url: z.string().url().describe('URL of the page to test'),
      intercept_pattern: z
        .string()
        .describe("Glob pattern for requests to abort (e.g., '**/api/payment**')"),
      error_code: z
        .enum(['addressunreachable', 'connectionaborted', 'accessdenied', 'aborted'])
        .describe(
          'System network error code: addressunreachable (DNS/routing failure), ' +
            'connectionaborted (mid-flight drop), accessdenied (firewall/OS block), aborted (generic abort)'
        ),
      fallback_selector: z
        .string()
        .optional()
        .describe("CSS selector for the fallback UI that should appear (e.g., '.network-error')"),
      wait_ms: z
        .number()
        .int()
        .min(0)
        .max(10000)
        .default(DEFAULT_WAIT_MS)
        .describe('Milliseconds to wait after navigation before checking fallback (default: 2000)'),
      viewport: viewportSchema,
      ...browserControlSchema,
    },
  },
  async ({
    url,
    intercept_pattern,
    error_code,
    fallback_selector,
    wait_ms,
    viewport,
    headless,
    keep_browser_open,
    preview_delay_ms,
    api_health_check_url,
  }) => {
    try {
      const result = await triggerSystemNetworkError(
        url,
        intercept_pattern,
        error_code,
        fallback_selector ?? null,
        wait_ms,
        viewport,
        {
          headless,
          keepBrowserOpen: keep_browser_open,
          previewDelayMs: preview_delay_ms,
          apiHealthCheckUrl: api_health_check_url,
        }
      );
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return errorResponse(err);
    }
  }
);

server.registerTool(
  'simulate_stateful_failure',
  {
    description:
      'Opens the browser, navigates to the application, and intercepts requests matching a URL pattern. ' +
      'Fails the first N requests with an error status, then lets subsequent requests succeed. Simulates transient failures and tests retry/recovery logic. ' +
      'Use to answer: does the app retry after a 503 and recover when the service comes back?',
    inputSchema: {
      url: z.string().url().describe('URL of the page to test'),
      intercept_pattern: z
        .string()
        .describe("Glob pattern for requests to intercept (e.g., '**/api/data**')"),
      http_status: z
        .number()
        .int()
        .min(400)
        .max(599)
        .default(503)
        .describe('HTTP error status code for the failing requests (default: 503)'),
      failure_count: z
        .number()
        .int()
        .min(1)
        .default(3)
        .describe('Number of requests to fail before allowing success (default: 3)'),
      success_payload: z
        .string()
        .default('{"ok":true}')
        .describe('Response body for requests after the failure window (default: {"ok":true})'),
      fallback_selector: z
        .string()
        .optional()
        .describe(
          "CSS selector for the fallback/retry UI that should appear (e.g., '.retry-button')"
        ),
      wait_ms: z
        .number()
        .int()
        .min(0)
        .max(10000)
        .default(DEFAULT_WAIT_MS)
        .describe('Milliseconds to wait after navigation before checking state (default: 2000)'),
      viewport: viewportSchema,
      ...browserControlSchema,
    },
  },
  async ({
    url,
    intercept_pattern,
    http_status,
    failure_count,
    success_payload,
    fallback_selector,
    wait_ms,
    viewport,
    headless,
    keep_browser_open,
    preview_delay_ms,
    api_health_check_url,
  }) => {
    try {
      const result = await simulateStatefulFailure(
        url,
        intercept_pattern,
        http_status,
        failure_count,
        success_payload,
        fallback_selector ?? null,
        wait_ms,
        viewport,
        {
          headless,
          keepBrowserOpen: keep_browser_open,
          previewDelayMs: preview_delay_ms,
          apiHealthCheckUrl: api_health_check_url,
        }
      );
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return errorResponse(err);
    }
  }
);

server.registerTool(
  'inject_response_corruption',
  {
    description:
      'Opens the browser, navigates to the application, and intercepts requests matching a URL pattern to return a malformed or corrupted response. ' +
      'Simulates protocol/transport level corruption and observes whether the UI crashes. ' +
      'Use to answer: does the app handle malformed JSON, content-length lies, or truncated payloads without crashing?',
    inputSchema: {
      url: z.string().url().describe('URL of the page to test'),
      intercept_pattern: z
        .string()
        .describe("Glob pattern for requests to corrupt (e.g., '**/api/data**')"),
      corruption_type: z
        .enum(['length_mismatch', 'malformed_json', 'truncated'])
        .describe(
          'Type of corruption: malformed_json (unterminated JSON body), ' +
            'length_mismatch (content-length claims 99999 bytes but body is short), ' +
            'truncated (body cut off at truncate_at_byte)'
        ),
      truncate_at_byte: z
        .number()
        .int()
        .min(1)
        .default(50)
        .describe('Byte offset to truncate at (only used when corruption_type is truncated)'),
      fallback_selector: z
        .string()
        .optional()
        .describe("CSS selector for the fallback UI that should appear (e.g., '.parse-error')"),
      wait_ms: z
        .number()
        .int()
        .min(0)
        .max(10000)
        .default(DEFAULT_WAIT_MS)
        .describe('Milliseconds to wait after navigation before checking state (default: 2000)'),
      viewport: viewportSchema,
      ...browserControlSchema,
    },
  },
  async ({
    url,
    intercept_pattern,
    corruption_type,
    truncate_at_byte,
    fallback_selector,
    wait_ms,
    viewport,
    headless,
    keep_browser_open,
    preview_delay_ms,
    api_health_check_url,
  }) => {
    try {
      const result = await injectResponseCorruption(
        url,
        intercept_pattern,
        corruption_type,
        truncate_at_byte,
        fallback_selector ?? null,
        wait_ms,
        viewport,
        {
          headless,
          keepBrowserOpen: keep_browser_open,
          previewDelayMs: preview_delay_ms,
          apiHealthCheckUrl: api_health_check_url,
        }
      );
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return errorResponse(err);
    }
  }
);

server.registerTool(
  'assert_chaos_handled',
  {
    description:
      'Opens the browser, navigates to the application, and injects a chaos HTTP status into all matching requests. ' +
      'Checks: did the app show fallback UI, were there unhandled exceptions, and did it survive? ' +
      'Use to answer: is the app chaos-resilient — does it show a recovery UI without throwing exceptions?',
    inputSchema: {
      url: z.string().url().describe('URL of the page to test'),
      intercept_pattern: z
        .string()
        .describe("Glob pattern for requests to fail (e.g., '**/api/**')"),
      http_status: z
        .number()
        .int()
        .min(400)
        .max(599)
        .default(500)
        .describe('HTTP error status to return for all matching requests (default: 500)'),
      expected_fallback_selector: z
        .string()
        .optional()
        .describe(
          "CSS selector for the fallback/error UI expected to appear (e.g., '.error-boundary'). " +
            'chaos_survived is true only when this is found AND there are no unhandled exceptions.'
        ),
      wait_ms: z
        .number()
        .int()
        .min(0)
        .max(10000)
        .default(DEFAULT_WAIT_MS)
        .describe(
          'Milliseconds to wait after navigation before evaluating verdict (default: 2000)'
        ),
      viewport: viewportSchema,
      ...browserControlSchema,
    },
  },
  async ({
    url,
    intercept_pattern,
    http_status,
    expected_fallback_selector,
    wait_ms,
    viewport,
    headless,
    keep_browser_open,
    preview_delay_ms,
    api_health_check_url,
  }) => {
    try {
      const result = await assertChaosHandled(
        url,
        intercept_pattern,
        http_status,
        expected_fallback_selector ?? null,
        wait_ms,
        viewport,
        {
          headless,
          keepBrowserOpen: keep_browser_open,
          previewDelayMs: preview_delay_ms,
          apiHealthCheckUrl: api_health_check_url,
        }
      );
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return errorResponse(err);
    }
  }
);

const shutdown = async () => {
  await closeBrowser();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

const transport = new StdioServerTransport();
await server.connect(transport);
