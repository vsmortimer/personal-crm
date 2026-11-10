// What goes to the error log when a save fails: where and why, never the
// data of the people. The failures are real: the queries go to the test
// database and are rejected by it.
import { afterEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import { FOREIGN_KEY_VIOLATION, UNIQUE_VIOLATION } from "@/db/errors";
import { contacts } from "@/db/schema";
import { logError } from "@/lib/log-error";
import { captureErrorLog } from "../../test/captured-log";
import { insertUser } from "../../test/helpers";

const NAME = "Анна Смирнова";
const PHONE = "+7 916 555-12-34";
const EMAIL = "anna.smirnova@mail.ru";

afterEach(() => {
  vi.restoreAllMocks();
});

async function failure(query: Promise<unknown>) {
  try {
    await query;
  } catch (error) {
    return error;
  }
  throw new Error("Expected the query to fail, but it succeeded");
}

describe("logError", () => {
  test("a rejected insert: the log says what failed, not whose data it was", async () => {
    const error = await failure(
      db
        .insert(contacts)
        .values({ userId: "nobody", name: NAME, phone: PHONE, email: EMAIL }),
    );
    // The test is only meaningful if the raw error does carry the data
    expect(`${(error as Error).message}`).toContain(EMAIL);
    const log = captureErrorLog();

    logError("Failed to create contact", error);

    const text = log.text();
    expect(text).toContain("Failed to create contact");
    expect(text).toContain(FOREIGN_KEY_VIOLATION);
    expect(text).toContain("contacts");
    for (const secret of [NAME, PHONE, EMAIL, "nobody"]) {
      expect(text).not.toContain(secret);
    }
  });

  test("a unique violation: the value in the detail of Postgres is not logged", async () => {
    await insertUser(EMAIL);
    const error = await failure(insertUser(EMAIL));
    const log = captureErrorLog();

    logError("Failed to send a sign-in link", error);

    const text = log.text();
    expect(text).toContain(UNIQUE_VIOLATION);
    expect(text).not.toContain(EMAIL);
  });

  test("an error that is not from the database: its name and message are logged", () => {
    const log = captureErrorLog();

    logError("Failed to add note", new TypeError("boom"));

    const text = log.text();
    expect(text).toContain("Failed to add note");
    expect(text).toContain("TypeError");
    expect(text).toContain("boom");
  });

  test("something that is not an error is logged without being dumped", () => {
    const log = captureErrorLog();

    logError("Failed to add note", { body: NAME });

    expect(log.calls()).toBe(1);
    expect(log.text()).not.toContain(NAME);
  });
});
