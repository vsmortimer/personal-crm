// The state of the sign-in form. Apart from login-link.ts, which only the
// server may import, so the form in the browser can use the types.

export type LoginFormState = {
  // What the field shows: the address as typed, or as it was understood
  email: string;
  // Under the field: the address is wrong
  emailError?: string;
  // Under the button: the link went to this address
  sentTo?: string;
  // Under the button: too often, or the email did not go
  message?: string;
  // Grows with every answer so the form remounts with the address in it
  version: number;
};

export const emptyLoginForm: LoginFormState = { email: "", version: 0 };
