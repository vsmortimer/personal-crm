"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border px-6 py-16 text-center">
      <h1 className="font-display text-section font-medium sm:text-section-lg">Не получилось загрузить данные</h1>
      <p className="max-w-md text-ink-soft">
        Скорее всего, не запущена база данных. Проверьте, что Docker Desktop
        открыт и база работает, а затем попробуйте ещё раз.
      </p>
      <Button variant="outline" onClick={() => retry()}>
        Попробовать ещё раз
      </Button>
    </div>
  );
}
