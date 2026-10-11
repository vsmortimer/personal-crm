import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-background px-6 py-16 text-center">
      <h1 className="text-xl font-semibold">Такой страницы нет</h1>
      <p className="text-muted-foreground">
        Возможно, контакт не существует или ссылка набрана с ошибкой.
      </p>
      <Link href="/" className={buttonVariants({ variant: "outline" })}>
        К списку контактов
      </Link>
    </div>
  );
}
