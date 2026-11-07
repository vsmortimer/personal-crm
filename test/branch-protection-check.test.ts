// Fails on purpose: a pull request with a red test must not get into main.
// Used once to check the branch protection; this branch is never merged.
import { expect, test } from "vitest";

test("fails on purpose to check branch protection", () => {
  expect(1 + 1).toBe(3);
});
