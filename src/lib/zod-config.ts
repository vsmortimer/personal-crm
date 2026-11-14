import { z } from "zod";

// Zod builds faster parsers with `new Function`, and first checks that this is
// allowed. With our CSP (no 'unsafe-eval') the browser reports that check as a
// violation in the console, although Zod catches the error. `jitless` skips
// the check and uses the plain parsers.
//
// Must run before the first schema is created: every file that creates object
// schemas imports this module first (see src/lib/validation.ts).
z.config({ jitless: true });
