import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Plus } from "lucide-react";

import { deleteGroupAction, renameGroupAction } from "@/app/actions";
import { ContactList } from "@/components/contact-list";
import { ContactSearch } from "@/components/contact-search";
import { DueContacts } from "@/components/due-contacts";
import { GroupFilter } from "@/components/group-filter";
import { GroupHeader } from "@/components/group-header";
import { ScrollIntoView } from "@/components/scroll-into-view";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { listContacts, listDueContacts } from "@/lib/contacts";
import { listGroups, selectedGroup, type GroupListItem } from "@/lib/groups";
import { parseContactId, pluralize } from "@/lib/format";
import { requireUser } from "@/lib/session";

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
          className={buttonVariants({
            size: "lg",
            className: "w-full sm:w-auto",
          })}
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
  const user = await requireUser();
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q : "";
  const addedId =
    typeof params.added === "string" ? parseContactId(params.added) : null;
  // The contact is gone, so its name comes from the URL; 200 is the name limit
  const deletedName =
    typeof params.deleted === "string" ? params.deleted.slice(0, 200) : "";
  // The same for a deleted group; 50 is the group name limit
  const deletedGroupName =
    typeof params.deletedGroup === "string"
      ? params.deletedGroup.slice(0, 50)
      : "";

  // An unknown or broken ?group= shows everyone, as «Все»
  const groups = await listGroups(user.id);
  const group = selectedGroup(groups, params.group);

  // Loaded together, so the block, the search and the list appear at once
  // and the search field does not jump down when the block arrives.
  // The block is the same whatever group is selected.
  const [{ contacts, total }, dueContacts] = await Promise.all([
    listContacts(user.id, query, group?.id ?? null),
    listDueContacts(user.id),
  ]);
  const added = addedId
    ? contacts.find((contact) => contact.id === addedId)
    : undefined;

  return (
    <>
      {dueContacts.length > 0 && <DueContacts contacts={dueContacts} />}

      <ContactSearch query={query} groupId={group?.id ?? null} />

      {groups.length > 0 && (
        <GroupFilter
          groups={groups}
          selectedId={group?.id ?? null}
          query={query}
        />
      )}

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

      {deletedName && (
        <div
          role="status"
          className="rounded-lg border border-success-line bg-success px-4 py-3 text-sm break-words text-success-ink"
        >
          Контакт «{deletedName}» удалён.
        </div>
      )}

      {deletedGroupName && (
        <div
          role="status"
          className="rounded-lg border border-success-line bg-success px-4 py-3 text-sm break-words text-success-ink"
        >
          Группа «{deletedGroupName}» удалена.
        </div>
      )}

      {group && (
        <GroupHeader
          // Another group gets a fresh header, with the rename field closed
          key={group.id}
          name={group.name}
          sizeLabel={pluralize(group.contactCount, CONTACT_WORDS)}
          renameAction={renameGroupAction.bind(null, group.id)}
          deleteAction={deleteGroupAction.bind(null, group.id)}
        />
      )}

      {/* With a group selected, its size is already in the header */}
      {(query || !group) && (
        <p className="eyebrow" aria-live="polite">
          {query
            ? `Найдено: ${contacts.length.toLocaleString("ru-RU")} из ${total.toLocaleString("ru-RU")}`
            : `Всего ${pluralize(total, CONTACT_WORDS)}`}
        </p>
      )}

      {contacts.length > 0 ? (
        <ContactList contacts={contacts} highlightId={added?.id} />
      ) : (
        <EmptyState query={query} hasContacts={total > 0} group={group} />
      )}
    </>
  );
}

// `hasContacts`: there are contacts at all, or in the selected group
function EmptyState({
  query,
  hasContacts,
  group,
}: {
  query: string;
  hasContacts: boolean;
  group: GroupListItem | null;
}) {
  return (
    <div className="rounded-lg border px-6 py-12 text-center">
      {group && !hasContacts ? (
        <>
          <p className="font-display text-section font-medium break-words">
            В группе «{group.name}» пока никого нет
          </p>
          <p className="mt-3 text-ink-soft">
            Отметьте эту группу в форме контакта
          </p>
        </>
      ) : hasContacts ? (
        <>
          <p className="font-display text-section font-medium break-words">
            Никого не нашлось по запросу «{query}»
            {group && <> в группе «{group.name}»</>}
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
          <p className="mt-3 text-ink-soft">Добавь первый контакт</p>
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
