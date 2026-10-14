const SENSITIVE_KEY_PATTERNS = [
  /token/i,
  /secret/i,
  /password/i,
  /passwd/i,
  /api[_-]?key/i,
  /auth/i,
  /credential/i,
  /private[_-]?key/i,
  /access[_-]?key/i,
  /bearer/i,
  /cookie/i,
  /session/i,
];

const BEARER_REGEX = /Bearer\s+([A-Za-z0-9_\-\.]+)/gi;
const JWT_REGEX = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/g;
const API_KEY_PREFIX_REGEX = /(sk-[a-zA-Z0-9]{20,}|ghp_[a-zA-Z0-9]{20,}|xox[baprs]-[a-zA-Z0-9]{10,})/g;

export const REDACTED_VALUE = "[REDACTED]";

/**
 * Checks if a property key matches any known sensitive patterns.
 */
export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

/**
 * Redacts known sensitive token patterns within strings.
 */
export function redactString(str: string): string {
  return str
    .replace(BEARER_REGEX, "Bearer [REDACTED]")
    .replace(JWT_REGEX, "[REDACTED_JWT]")
    .replace(API_KEY_PREFIX_REGEX, "[REDACTED_KEY]");
}

/**
 * Deeply redacts sensitive keys and values from arbitrary objects or primitives.
 * Safe against circular references.
 */
export function redactData<T>(data: T, seen = new WeakSet<object>()): T {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === "string") {
    return redactString(data) as unknown as T;
  }

  if (typeof data !== "object") {
    return data;
  }

  if (seen.has(data as object)) {
    return "[CIRCULAR]" as unknown as T;
  }
  seen.add(data as object);

  if (Array.isArray(data)) {
    return data.map((item) => redactData(item, seen)) as unknown as T;
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (isSensitiveKey(key)) {
      result[key] = REDACTED_VALUE;
    } else {
      result[key] = redactData(value, seen);
    }
  }

  return result as unknown as T;
}

/**
 * Summarizes tool arguments or results to avoid logging raw payloads.
 */
export function summarizePayload(payload: unknown): {
  type: string;
  keys?: string[];
  sizeBytes?: number;
  redactedPreview?: unknown;
} {
  if (payload === null || payload === undefined) {
    return { type: String(payload) };
  }

  const jsonStr = JSON.stringify(payload);
  const sizeBytes = jsonStr ? Buffer.byteLength(jsonStr, "utf8") : 0;

  if (typeof payload === "object" && !Array.isArray(payload)) {
    return {
      type: "object",
      keys: Object.keys(payload),
      sizeBytes,
      redactedPreview: redactData(payload),
    };
  }

  if (Array.isArray(payload)) {
    return {
      type: "array",
      sizeBytes,
      redactedPreview: `[Array(${payload.length})]`,
    };
  }

  return {
    type: typeof payload,
    sizeBytes,
    redactedPreview: redactData(payload),
  };
}
