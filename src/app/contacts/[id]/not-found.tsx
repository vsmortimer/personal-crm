import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

// The card and the form «Изменить» of a contact that is not there. A contact
// of someone else looks exactly the same, so the page does not tell the two apart.
export default function ContactNotFound() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border px-6 py-16 text-center">
      <h1 className="font-display text-section font-medium sm:text-section-lg">
        Контакт не найден
      </h1>
      <p className="text-ink-soft">
        Возможно, его удалили или ссылка набрана с ошибкой.
      </p>
      <Link href="/" className={buttonVariants({ variant: "outline" })}>
        К списку контактов
      </Link>
    </div>
  );
}
