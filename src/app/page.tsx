import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Plus } from "lucide-react";

import { ContactList } from "@/components/contact-list";
import { ContactSearch } from "@/components/contact-search";
import { ScrollIntoView } from "@/components/scroll-into-view";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { listContacts } from "@/lib/contacts";
import { parseContactId, pluralize } from "@/lib/format";

export const metadata: Metadata = {
  title: "Контакты",
};

const CONTACT_WORDS = ["контакт", "контакта", "контактов"] as const;

export default function ContactsPage({ searchParams }: PageProps<"/">) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-6">
        <h1 className="font-display text-title font-medium sm:text-title-lg">
          Контакты
        </h1>
        {/* Full width on phones, like the landing's button */}
        <Link
          href="/contacts/new"
          className={buttonVariants({ size: "lg", className: "w-full sm:w-auto" })}
        >
          <Plus aria-hidden />
          Добавить контакт
        </Link>
      </div>
      <Suspense fallback={<ContactsSkeleton />}>
        <ContactsSection searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function ContactsSection({
  searchParams,
}: {
  searchParams: PageProps<"/">["searchParams"];
}) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q : "";
  const addedId =
    typeof params.added === "string" ? parseContactId(params.added) : null;

  const { contacts, total } = await listContacts(query);
  const added = addedId
    ? contacts.find((contact) => contact.id === addedId)
    : undefined;

  return (
    <>
      <ContactSearch query={query} />

      {added && (
        <div
          role="status"
          className="rounded-lg border border-success-line bg-success px-4 py-3 text-sm text-success-ink"
        >
          Контакт «{added.name}» добавлен в список.{" "}
          <Link
            href={`/contacts/${added.id}`}
            className="font-semibold underline underline-offset-4"
          >
            Открыть карточку
          </Link>
          <ScrollIntoView elementId={`contact-${added.id}`} />
        </div>
      )}

      <p className="eyebrow" aria-live="polite">
        {query
          ? `Найдено: ${contacts.length.toLocaleString("ru-RU")} из ${total.toLocaleString("ru-RU")}`
          : `Всего ${pluralize(total, CONTACT_WORDS)}`}
      </p>

      {contacts.length > 0 ? (
        <ContactList contacts={contacts} highlightId={added?.id} />
      ) : (
        <EmptyState query={query} hasContacts={total > 0} />
      )}
    </>
  );
}

function EmptyState({
  query,
  hasContacts,
}: {
  query: string;
  hasContacts: boolean;
}) {
  return (
    <div className="rounded-lg border px-6 py-12 text-center">
      {hasContacts ? (
        <>
          <p className="font-display text-section font-medium break-words">
            Никого не нашлось по запросу «{query}»
          </p>
          <p className="mt-3 text-ink-soft">
            Проверьте написание или поищите по части имени.
          </p>
        </>
      ) : (
        <>
          <p className="font-display text-section font-medium">
            Контактов пока нет
          </p>
          <p className="mt-3 text-ink-soft">
            Добавьте первого человека, чтобы не потерять с ним связь.
          </p>
        </>
      )}
    </div>
  );
}

function ContactsSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-4 w-32" />
      <div className="flex flex-col gap-2 rounded-lg border p-4">
        {Array.from({ length: 8 }, (_, index) => (
          <Skeleton key={index} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}
