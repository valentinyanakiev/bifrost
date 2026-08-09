// Unit tests for item→haystack reduction. Run directly: `node haystack.test.mjs`.
import assert from "node:assert";
import { buildHaystack } from "./haystack.mjs";

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  ok - ${name}`);
}

// The exact shape that mis-routed the cache matrix: a Gemini cell whose only
// mention of "anthropic" is a comment inside its generated assertion script.
const geminiCellWithAnthropicComment = () => ({
  name: "Cache matrix: gemini/gemini-2.5-pro / control round 1",
  event: [
    {
      listen: "test",
      script: {
        type: "text/javascript",
        exec: [
          "var cached = j.usage.prompt_tokens_details.cached_tokens || 0;",
          "// prompt_tokens is the total with cached reads included; subtract them back out so",
          '// "uncached" means the same thing it does on the anthropic shape.',
        ],
      },
    },
  ],
  request: {
    method: "POST",
    body: { mode: "raw", raw: '{"model":"gemini/gemini-2.5-pro","messages":[]}' },
    url: { raw: "{{baseUrl}}/v1/chat/completions" },
  },
});

test("a provider named only in test-script prose does not enter the haystack", () => {
  const h = buildHaystack(geminiCellWithAnthropicComment(), [
    "12. Backlog Coverage (auto-added missing cases)",
    "Cross-Cut Round 35: Cross-Provider Prompt-Cache Matrix (generated)",
  ]);
  assert.ok(!h.includes("anthropic"), `script prose leaked into routing text: ${h.slice(0, 200)}`);
});

test("the row's real identity still does", () => {
  const h = buildHaystack(geminiCellWithAnthropicComment(), [
    "Cross-Cut Round 35: Cross-Provider Prompt-Cache Matrix (generated)",
  ]);
  // Model and URL are what the row actually calls.
  assert.ok(h.includes("gemini/gemini-2.5-pro"), "model must remain matchable");
  assert.ok(h.includes("/v1/chat/completions"), "url must remain matchable");
  // Name and ancestor folders are how feature aliases select generated rows.
  assert.ok(h.includes("cache matrix"), "item name must remain matchable");
  assert.ok(h.includes("prompt-cache matrix"), "ancestor folder must remain matchable");
});

// A row that genuinely targets a provider must still be claimed by it - the fix
// must narrow routing, not break it.
test("a genuine provider row still matches", () => {
  const h = buildHaystack(
    {
      name: "anthropic/claude-opus-5 prompt caching",
      request: { body: { mode: "raw", raw: '{"model":"anthropic/claude-opus-5"}' }, url: { raw: "{{baseUrl}}/anthropic/v1/messages" } },
    },
    ["10. Feature Variations (per-provider)", "Anthropic Features"]
  );
  assert.ok(h.includes("anthropic"));
  assert.ok(h.includes("claude-"));
});

test("missing fields do not throw", () => {
  assert.strictEqual(typeof buildHaystack({}, undefined), "string");
  assert.ok(buildHaystack({ name: "Folder" }, []).includes("folder"));
});

console.log(`\n${passed} passed`);
