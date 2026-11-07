import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/lib/auth";

// Where the link from the email leads: it signs the person in
export const { GET, POST } = toNextJsHandler(auth);
