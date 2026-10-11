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
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Контакты</h1>
        <Link href="/contacts/new" className={buttonVariants({ size: "lg" })}>
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
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"
        >
          Контакт «{added.name}» добавлен в список.{" "}
          <Link
            href={`/contacts/${added.id}`}
            className="font-medium underline underline-offset-4"
          >
            Открыть карточку
          </Link>
          <ScrollIntoView elementId={`contact-${added.id}`} />
        </div>
      )}

      <p className="text-sm text-muted-foreground" aria-live="polite">
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
    <div className="rounded-xl border border-dashed bg-background px-6 py-12 text-center">
      {hasContacts ? (
        <>
          <p className="font-medium">Никого не нашлось по запросу «{query}»</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Проверьте написание или поищите по части имени.
          </p>
        </>
      ) : (
        <>
          <p className="font-medium">Контактов пока нет</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Добавьте первого человека, чтобы не потерять с ним связь.
          </p>
        </>
      )}
    </div>
  );
}

function ContactsSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-4 w-32" />
      <div className="flex flex-col gap-2 rounded-xl border bg-background p-4">
        {Array.from({ length: 8 }, (_, index) => (
          <Skeleton key={index} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}
