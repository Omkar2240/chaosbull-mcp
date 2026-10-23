export interface InterceptedRequest {
  url: string;
  method: string;
  status?: number;
  delay_ms?: number;
}

export interface PageState {
  page_errors: string[];
  console_errors: string[];
}

export interface ChaosResult {
  url: string;
  intercept_pattern: string;
  intercepted_count: number;
  intercepted_requests: InterceptedRequest[];
  fallback_found: boolean;
  fallback_selector: string | null;
  page_state: PageState;
  wait_time_ms: number;
}

export interface LatencyResult {
  url: string;
  intercept_pattern: string;
  intercepted_count: number;
  intercepted_requests: InterceptedRequest[];
  loading_state_found: boolean;
  page_state: PageState;
  load_time_ms: number;
}

export interface BlockResult {
  url: string;
  block_patterns: string[];
  blocked_count: number;
  blocked_urls: string[];
  core_content_found: boolean;
  page_state: PageState;
  wait_time_ms: number;
}

export interface SystemNetworkErrorResult {
  url: string;
  intercept_pattern: string;
  error_code: string;
  intercepted_count: number;
  intercepted_requests: InterceptedRequest[];
  fallback_found: boolean;
  fallback_selector: string | null;
  page_state: PageState;
  wait_time_ms: number;
}

export interface StatefulFailureResult {
  url: string;
  intercept_pattern: string;
  http_status: number;
  failure_count: number;
  actual_failed: number;
  actual_succeeded: number;
  intercepted_requests: Array<
    InterceptedRequest & { attempt: number; outcome: 'failed' | 'passed' }
  >;
  fallback_found: boolean;
  fallback_selector: string | null;
  page_state: PageState;
  wait_time_ms: number;
}

export interface ResponseCorruptionResult {
  url: string;
  intercept_pattern: string;
  corruption_type: 'length_mismatch' | 'malformed_json' | 'truncated';
  intercepted_count: number;
  intercepted_requests: InterceptedRequest[];
  fallback_found: boolean;
  fallback_selector: string | null;
  page_state: PageState;
  wait_time_ms: number;
}

export interface ChaosVerdict {
  url: string;
  intercept_pattern: string;
  http_status: number;
  unhandled_exceptions: string[];
  console_errors: string[];
  fallback_ui_detected: boolean;
  expected_fallback_selector: string | null;
  chaos_survived: boolean;
  wait_time_ms: number;
}
