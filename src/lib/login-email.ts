// The email with the sign-in link: a pure function, so it is easy to check.
// What it says: the requirement «Письмо со ссылкой» of the user-auth spec

// Mail programs do not understand CSS variables, so the email repeats the
// values of the design tokens in src/app/tokens.css. This is the only place
// where the tokens are copied as values.
const EMAIL_COLORS = {
  paper: "#f3eee5", // --paper
  ink: "#2e2219", // --ink
  inkSoft: "#5a4a3c", // --ink-soft
  line: "#d9cfc0", // --line
} as const;

// Manrope is not in mail programs, so the system font stands in
const EMAIL_FONT = "-apple-system, 'Segoe UI', Roboto, Arial, sans-serif";

const SUBJECT = "Вход в Личную CRM";
const LINK_LIFETIME = "Ссылка работает 15 минут.";
const IGNORE = "Если вы не запрашивали вход - просто проигнорируйте письмо";

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function loginEmail(url: string): {
  subject: string;
  html: string;
  text: string;
} {
  const href = escapeHtml(url);

  const html = `<!doctype html>
<html lang="ru">
  <body style="margin:0;padding:0;background:${EMAIL_COLORS.paper};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${EMAIL_COLORS.paper};">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;font-family:${EMAIL_FONT};color:${EMAIL_COLORS.ink};">
            <tr>
              <td style="padding-bottom:24px;border-bottom:1px solid ${EMAIL_COLORS.line};font-size:22px;">
                Личная CRM
              </td>
            </tr>
            <tr>
              <td style="padding:24px 0 16px;font-size:16px;line-height:1.5;">
                Нажмите кнопку, чтобы войти в Личную CRM.
              </td>
            </tr>
            <tr>
              <td style="padding-bottom:24px;">
                <a href="${href}" style="display:inline-block;padding:12px 28px;background:${EMAIL_COLORS.ink};color:${EMAIL_COLORS.paper};font-size:16px;font-weight:600;text-decoration:none;border-radius:2px;">Войти</a>
              </td>
            </tr>
            <tr>
              <td style="font-size:14px;line-height:1.5;color:${EMAIL_COLORS.inkSoft};">
                ${LINK_LIFETIME}<br />${IGNORE}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    "Нажмите на ссылку, чтобы войти в Личную CRM:",
    "",
    "Войти: " + url,
    "",
    LINK_LIFETIME,
    IGNORE,
  ].join("\n");

  return { subject: SUBJECT, html, text };
}
