import { inspect } from "node:util";
import { vi } from "vitest";

// Everything the code wrote with console.error, as one string: the arguments,
// and of every error the message, the stack, the causes and the hidden fields
export function captureErrorLog() {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  return {
    text: () =>
      spy.mock.calls
        .flat()
        .map((argument) =>
          argument instanceof Error
            ? `${argument.message}\n${inspect(argument, { showHidden: true, depth: null })}`
            : inspect(argument, { showHidden: true, depth: null }),
        )
        .join("\n"),
    calls: () => spy.mock.calls.length,
  };
}
