// Tests run against their own database next to the app's one:
// the same local Postgres, the app database name plus this suffix.
export const TEST_DATABASE_SUFFIX = "_test";

// The last line of defence before anything is dropped or truncated
export function assertTestDatabase(name: string) {
  if (!name.endsWith(TEST_DATABASE_SUFFIX)) {
    throw new Error(
      `Refusing to touch database "${name}": the test database name must end with "${TEST_DATABASE_SUFFIX}"`,
    );
  }
}
