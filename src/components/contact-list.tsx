"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

import type { ContactListItem } from "@/lib/contacts";
import { cn } from "@/lib/utils";

type LetterGroup = { letter: string; contacts: ContactListItem[] };

// Contacts arrive sorted by name; split them into runs by first letter.
// "Ё" goes with "Е" because the collation sorts them together.
function groupByLetter(contacts: ContactListItem[]): LetterGroup[] {
  const groups: LetterGroup[] = [];
  for (const contact of contacts) {
    const first = contact.name.trim().charAt(0).toLocaleUpperCase("ru-RU");
    const letter = first === "Ё" ? "Е" : /\p{L}/u.test(first) ? first : "#";
    const last = groups.at(-1);
    if (last?.letter === letter) {
      last.contacts.push(contact);
    } else {
      groups.push({ letter, contacts: [contact] });
    }
  }
  return groups;
}

export function ContactList({
  contacts,
  highlightId,
}: {
  contacts: ContactListItem[];
  highlightId?: number;
}) {
  return (
    <div className="overflow-clip rounded-xl border bg-background">
      {groupByLetter(contacts).map((group) => (
        <section key={`${group.letter}-${group.contacts[0].id}`}>
          <h2 className="sticky top-0 z-10 border-b bg-muted/80 px-4 py-1 text-xs font-semibold text-muted-foreground backdrop-blur">
            {group.letter}
          </h2>
          <ul className="divide-y">
            {group.contacts.map((contact) => (
              <li key={contact.id} id={`contact-${contact.id}`}>
                <Link
                  href={`/contacts/${contact.id}`}
                  className={cn(
                    "group flex items-center gap-4 px-4 py-2.5 transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none",
                    contact.id === highlightId &&
                      "bg-emerald-50 hover:bg-emerald-100/70 dark:bg-emerald-950",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{contact.name}</p>
                    {contact.about && (
                      <p className="truncate text-sm text-muted-foreground">
                        {contact.about}
                      </p>
                    )}
                  </div>
                  <div className="hidden shrink-0 text-right text-sm text-muted-foreground sm:block">
                    {contact.phone && <p className="tabular-nums">{contact.phone}</p>}
                    {contact.email && <p>{contact.email}</p>}
                  </div>
                  <ChevronRight
                    className="size-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
