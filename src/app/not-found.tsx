import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border px-6 py-16 text-center">
      <h1 className="font-display text-section font-medium sm:text-section-lg">Такой страницы нет</h1>
      <p className="text-ink-soft">
        Возможно, контакт не существует или ссылка набрана с ошибкой.
      </p>
      <Link href="/" className={buttonVariants({ variant: "outline" })}>
        К списку контактов
      </Link>
    </div>
  );
}
