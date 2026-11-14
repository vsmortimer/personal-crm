import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { birthdayCaption } from "@/lib/birthday";
import type { BirthdayContact } from "@/lib/contacts";

// «Скоро день рождения»: styled like DueContacts, which it stands above.
// No «Показать ещё»: within 8 days there are few birthdays, so all are shown.
export function BirthdayContacts({
  contacts,
}: {
  contacts: BirthdayContact[];
}) {
  return (
    <section
      aria-labelledby="birthday-contacts-title"
      className="overflow-clip rounded-lg border"
    >
      <h2
        id="birthday-contacts-title"
        className="border-b bg-muted px-4 pt-2 pb-1.5 font-display text-letter font-medium sm:px-5"
      >
        Скоро день рождения
      </h2>
      <ul className="divide-y">
        {contacts.map((contact) => (
          <li key={contact.id}>
            <Link
              href={`/contacts/${contact.id}`}
              className="group flex items-center gap-4 px-4 py-3 transition-colors duration-150 ease-out hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:-outline-offset-2 sm:px-5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{contact.listName}</p>
                {/* Wraps instead of being cut: the days left and the age matter */}
                <p className="text-sm break-words text-muted-foreground">
                  {birthdayCaption(contact.next)}
                </p>
              </div>
              <ChevronRight
                className="size-4 shrink-0 text-muted-foreground/60 motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-out motion-safe:group-hover:translate-x-1"
                aria-hidden
              />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
