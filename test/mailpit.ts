// Reads the emails the app sent from Mailpit, the mail catcher that runs next
// to the tests (compose.yaml locally, a service container in CI). Used by
// Vitest and by the e2e tests. Mailpit's API: https://mailpit.axllent.org/docs/api-v1/

export type Email = {
  id: string;
  subject: string;
  from: { name: string; address: string };
  to: string[];
  html: string;
  text: string;
};

function apiUrl(path: string): string {
  const base = process.env.MAILPIT_URL || "http://127.0.0.1:8025";
  return new URL(path, base).href;
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(apiUrl(path), init);
  } catch (error) {
    throw new Error(
      "Mailpit is not reachable. Start it with: docker compose up -d mail",
      { cause: error },
    );
  }
  if (!response.ok) {
    throw new Error(`Mailpit answered ${response.status} to ${path}`);
  }
  return response;
}

type MessageSummary = { ID: string };

type MessageDetails = {
  ID: string;
  Subject: string;
  From: { Name: string; Address: string };
  To: { Address: string }[];
  HTML: string;
  Text: string;
};

// Deletes all emails, so a test sees only the emails of its own run
export async function clearEmails(): Promise<void> {
  await request("/api/v1/messages", { method: "DELETE" });
}

// The emails sent to the address, the newest first
export async function emailsTo(address: string): Promise<Email[]> {
  const found = await request(
    `/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}`,
  );
  const { messages } = (await found.json()) as { messages: MessageSummary[] };

  return Promise.all(
    messages.map(async ({ ID }) => {
      const response = await request(`/api/v1/message/${ID}`);
      const message = (await response.json()) as MessageDetails;
      return {
        id: message.ID,
        subject: message.Subject,
        from: { name: message.From.Name, address: message.From.Address },
        to: message.To.map((recipient) => recipient.Address),
        html: message.HTML,
        text: message.Text,
      };
    }),
  );
}

// For the e2e tests, where the app sends the email in a request of its own:
// waits until the email to the address shows up
export async function waitForEmail(
  address: string,
  { count = 1, timeoutMs = 10_000 } = {},
): Promise<Email[]> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const emails = await emailsTo(address);
    if (emails.length >= count) return emails;
    if (Date.now() > deadline) {
      throw new Error(
        `Expected ${count} email(s) to ${address}, got ${emails.length} after ${timeoutMs} ms`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

// The sign-in link of a login email: the first address in its text version
export function linkIn(email: Email): string {
  const link = /https?:\/\/\S+/.exec(email.text)?.[0];
  if (!link) {
    throw new Error(`No link in the email "${email.subject}": ${email.text}`);
  }
  return link;
}
