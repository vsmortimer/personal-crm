import type { Metadata } from "next";

import { LoginForm } from "@/components/login-form";

export const metadata: Metadata = {
  title: "Вход",
};

export default function LoginPage() {
  return (
    <div className="flex max-w-md flex-col gap-8">
      <h1 className="font-display text-title font-medium sm:text-title-lg">
        Вход
      </h1>
      <LoginForm />
    </div>
  );
}
