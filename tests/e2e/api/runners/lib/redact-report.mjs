// Redaction for the PUBLISHED provider-harness report.
//
// The live viewer serves this data to whoever ran the harness, on their own
// machine, from their own keys - full fidelity there is the point. The --static
// page is a different audience entirely: it is uploaded to R2 and linked from
// the public changelog, so anything inlined into it is world-readable and stays
// that way in caches and mirrors long after any key is rotated.
//
// So this is applied on the static path only. The shape is preserved - the
// report still shows WHICH headers were sent and how big a body was - because a
// report that hides what was exercised is not worth publishing either.

// Header names whose value is a credential. Matched case-insensitively against
// the whole name, since these are exact header names rather than prefixes.
const SECRET_HEADERS = new Set([
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "api-key",
  "apikey",
  "x-goog-api-key",
  "x-goog-iam-authorization-token",
  "x-amz-security-token",
  "x-amz-content-sha256",
  "x-auth-token",
  "x-access-token",
  "openai-api-key",
  "anthropic-api-key",
  "x-bifrost-api-key",
]);

// Query parameters that carry credentials in the URL itself. Matched
// case-insensitively.
const SECRET_PARAMS = new Set([
  "key",
  "api_key",
  "apikey",
  "access_token",
  "token",
  "signature",
  "sig",
  "awsaccesskeyid",
  "x-amz-signature",
  "x-amz-credential",
  "x-amz-security-token",
  "x-goog-api-key",
]);

export const REDACTED = "[REDACTED]";

// Credential-shaped runs that appear INSIDE bodies. Providers echo keys back in
// error messages ("Incorrect API key provided: sk-..."), and a signed URL in a
// response body is just as live as one in a request.
//
// Ordered most specific first; each is applied globally.
const BODY_SECRET_PATTERNS = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, // Authorization values quoted into errors
  /\b(?:sk|rk|pk)-[A-Za-z0-9._-]{12,}/g, // OpenAI/Anthropic-style keys
  /\bAKIA[0-9A-Z]{16}\b/g, // AWS access key id
  /\bASIA[0-9A-Z]{16}\b/g, // AWS temporary access key id
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, // JWT
  /\bAIza[0-9A-Za-z._-]{20,}/g, // Google API key
  /\bxox[abposr]-[A-Za-z0-9-]{8,}/g, // Slack-style token
];

const redactHeaders = (headers) =>
  (headers || []).map((h) =>
    SECRET_HEADERS.has(String(h.key || "").toLowerCase()) ? { ...h, value: REDACTED } : h
  );

// redactUrl blanks credential-bearing query parameters while leaving the path
// and every other parameter legible, so the report still says which endpoint
// was called.
// decodeParamName tolerates a malformed escape rather than throwing: a name that
// cannot be decoded is compared as-is, which is the pre-existing behaviour.
const decodeParamName = (name) => {
  try {
    return decodeURIComponent(name.replace(/\+/g, " "));
  } catch {
    return name;
  }
};

// redactUserinfo blanks a `user:password@` credential embedded in the authority.
//
// This is not reachable from the query-parameter path at all - such a URL often
// has no query string - and it is a live credential just the same.
const redactUserinfo = (raw) =>
  // The WHOLE userinfo goes, username included. Keeping the username "because it is only a name"
  // was the bug: token-in-URL auth is normally written with the credential in the username
  // position and no password at all (https://sk-proj-...@host/), so preserving it published the
  // key while redacting an empty password beside it.
  raw.replace(/^([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)[^/?#@]*@/, `$1${REDACTED}@`);

export function redactUrl(url) {
  const raw = redactUserinfo(String(url || ""));
  const q = raw.indexOf("?");
  if (q === -1) return raw;
  const base = raw.slice(0, q);
  const query = raw
    .slice(q + 1)
    .split("&")
    .map((pair) => {
      const eq = pair.indexOf("=");
      if (eq === -1) return pair;
      const name = pair.slice(0, eq);
      // Decode before matching: `api%5Fkey` is the same parameter as `api_key`,
      // and comparing the raw name published its value.
      return SECRET_PARAMS.has(decodeParamName(name).toLowerCase()) ? `${name}=${REDACTED}` : pair;
    })
    .join("&");
  return `${base}?${query}`;
}

export function redactBody(body) {
  let out = String(body || "");
  for (const re of BODY_SECRET_PATTERNS) out = out.replace(re, REDACTED);
  return out;
}

// redactItemsForPublic returns a copy safe to inline into a world-readable page.
export function redactItemsForPublic(items) {
  return (items || []).map((item) => ({
    ...item,
    url: redactUrl(item.url),
    reqHeaders: redactHeaders(item.reqHeaders),
    respHeaders: redactHeaders(item.respHeaders),
    reqBody: redactBody(item.reqBody),
    respBody: redactBody(item.respBody),
  }));
}
