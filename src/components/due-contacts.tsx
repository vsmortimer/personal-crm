"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, ChevronUp } from "lucide-react";

import { CONTACT_FREQUENCY_LABELS } from "@/lib/contact-frequency";
import type { DueContact } from "@/lib/contacts";
import { pluralize } from "@/lib/format";

const VISIBLE_COUNT = 5;
const DAY_WORDS = ["день", "дня", "дней"] as const;

// Styled like ContactList: the title sits on the same band as its letters
export function DueContacts({ contacts }: { contacts: DueContact[] }) {
  const [expanded, setExpanded] = useState(false);
  // Next.js keeps a page's state while you are away from it; collapse when
  // the page is left, so coming back to it shows the block collapsed
  useEffect(() => () => setExpanded(false), []);
  const hiddenCount = contacts.length - VISIBLE_COUNT;
  const visible = expanded ? contacts : contacts.slice(0, VISIBLE_COUNT);

  return (
    <section
      aria-labelledby="due-contacts-title"
      className="overflow-clip rounded-lg border"
    >
      <h2
        id="due-contacts-title"
        className="border-b bg-muted px-4 pt-2 pb-1.5 font-display text-letter font-medium sm:px-5"
      >
        Пора связаться
      </h2>
      <ul id="due-contacts-list" className="divide-y">
        {visible.map((contact) => (
          <li key={contact.id}>
            <Link
              href={`/contacts/${contact.id}`}
              className="group flex items-center gap-4 px-4 py-3 transition-colors duration-150 ease-out hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:-outline-offset-2 sm:px-5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{contact.listName}</p>
                <p className="truncate text-sm text-muted-foreground">
                  {CONTACT_FREQUENCY_LABELS[contact.contactFrequency]} ·{" "}
                  <span className="font-medium text-brand">
                    не общались {pluralize(contact.daysSinceContact, DAY_WORDS)}
                  </span>
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
      {hiddenCount > 0 && (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls="due-contacts-list"
          onClick={() => setExpanded(!expanded)}
          className="flex min-h-11 w-full items-center justify-center gap-2 border-t px-4 py-2.5 text-sm font-semibold transition-colors duration-150 ease-out hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:-outline-offset-2 sm:px-5"
        >
          {expanded ? "Свернуть" : `Показать ещё ${hiddenCount}`}
          {expanded ? (
            <ChevronUp className="size-4" aria-hidden />
          ) : (
            <ChevronDown className="size-4" aria-hidden />
          )}
        </button>
      )}
    </section>
  );
}
