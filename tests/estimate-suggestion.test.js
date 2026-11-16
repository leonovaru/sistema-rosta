import test from "node:test";
import assert from "node:assert/strict";
import { suggestAdjustedEstimate } from "../functions/_lib/estimate-suggestion.js";

const accuracy = {
  minimum_samples: 3,
  overall: { sample_count: 8, recommended_estimate_multiplier: 1.25 },
  by_area: [
    { key: "project:p1", title: "Проект А", sample_count: 4, recommended_estimate_multiplier: 1.5 },
    { key: "life:home", title: "Дом", sample_count: 2, recommended_estimate_multiplier: null }
  ]
};

test("prefers a sufficiently sampled project-specific multiplier", () => {
  assert.deepEqual(suggestAdjustedEstimate(60, accuracy, "project:p1"), {
    base_minutes: 60, suggested_minutes: 90, multiplier: 1.5, sample_count: 4, scope: "specific", title: "Проект А"
  });
});

test("falls back to overall history when a scope has too few observations", () => {
  const result = suggestAdjustedEstimate(60, accuracy, "life:home");
  assert.equal(result.suggested_minutes, 75);
  assert.equal(result.scope, "overall");
});

test("returns no suggestion when there is not enough historical data", () => {
  assert.equal(suggestAdjustedEstimate(60, { overall: { sample_count: 2, recommended_estimate_multiplier: null } }), null);
});

test("rounds to five minutes and rejects invalid base estimates", () => {
  assert.equal(suggestAdjustedEstimate(61, accuracy).suggested_minutes, 75);
  assert.equal(suggestAdjustedEstimate(4, accuracy), null);
  assert.equal(suggestAdjustedEstimate(10001, accuracy), null);
});
