import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Mail, Pencil, Phone } from "lucide-react";

import { addNoteAction } from "@/app/actions";
import { BackLink } from "@/components/back-link";
import { NoteForm } from "@/components/note-form";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { getContact, listNotes } from "@/lib/contacts";
import { formatDateTime, parseContactId, pluralize } from "@/lib/format";

export async function generateMetadata({
  params,
}: PageProps<"/contacts/[id]">): Promise<Metadata> {
  const id = parseContactId((await params).id);
  const contact = id ? await getContact(id) : null;
  return { title: contact?.name ?? "Контакт не найден" };
}

export default function ContactPage({ params }: PageProps<"/contacts/[id]">) {
  return (
    <div className="flex flex-col gap-4">
      <BackLink href="/">Все контакты</BackLink>
      <Suspense fallback={<ContactSkeleton />}>
        {params.then(({ id }) => (
          <ContactDetails rawId={id} />
        ))}
      </Suspense>
    </div>
  );
}

async function ContactDetails({ rawId }: { rawId: string }) {
  const id = parseContactId(rawId);
  if (!id) notFound();

  const [contact, notes] = await Promise.all([getContact(id), listNotes(id)]);
  if (!contact) notFound();

  return (
    <>
      <Card>
        <CardHeader className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight break-words">
              {contact.name}
            </h1>
            {contact.about && (
              <p className="mt-1 text-muted-foreground">{contact.about}</p>
            )}
          </div>
          <Link
            href={`/contacts/${contact.id}/edit`}
            className={buttonVariants({ variant: "outline" })}
          >
            <Pencil aria-hidden />
            Изменить
          </Link>
        </CardHeader>
        <Separator />
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-[10rem_1fr] sm:gap-x-6 sm:gap-y-3">
            <DetailRow label="Откуда знакомы">
              {contact.howWeMet && (
                <span className="whitespace-pre-wrap">{contact.howWeMet}</span>
              )}
            </DetailRow>
            <DetailRow label="Телефон">
              {contact.phone && (
                <a
                  href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`}
                  className="inline-flex items-center gap-2 tabular-nums underline-offset-4 hover:underline"
                >
                  <Phone className="size-4 text-muted-foreground" aria-hidden />
                  {contact.phone}
                </a>
              )}
            </DetailRow>
            <DetailRow label="Почта">
              {contact.email && (
                <a
                  href={`mailto:${contact.email}`}
                  className="inline-flex items-center gap-2 break-all underline-offset-4 hover:underline"
                >
                  <Mail className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  {contact.email}
                </a>
              )}
            </DetailRow>
          </dl>
        </CardContent>
      </Card>

      <section className="flex flex-col gap-4" aria-labelledby="notes-title">
        <div className="mt-2 flex items-baseline justify-between gap-4">
          <h2 id="notes-title" className="text-lg font-semibold">
            Заметки
          </h2>
          <span className="text-sm text-muted-foreground">
            {pluralize(notes.length, ["заметка", "заметки", "заметок"])}
          </span>
        </div>

        <NoteForm action={addNoteAction.bind(null, contact.id)} />

        {notes.length > 0 ? (
          <ol className="flex flex-col gap-3">
            {notes.map((note) => (
              <li key={note.id} className="rounded-xl border bg-background px-4 py-3">
                <time
                  dateTime={note.createdAt.toISOString()}
                  className="text-xs text-muted-foreground"
                >
                  {formatDateTime(note.createdAt)}
                </time>
                <p className="mt-1 whitespace-pre-wrap break-words">{note.body}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="rounded-xl border border-dashed bg-background px-4 py-6 text-center text-sm text-muted-foreground">
            Заметок пока нет. Запишите, о чём говорили и о чём договорились.
          </p>
        )}
      </section>
    </>
  );
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="contents">
      <dt className="text-sm text-muted-foreground sm:pt-0.5">{label}</dt>
      <dd className="-mt-3 sm:mt-0">
        {children || <span className="text-muted-foreground/70">Не указано</span>}
      </dd>
    </div>
  );
}

function ContactSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <div className="flex flex-col gap-3 rounded-xl border bg-background p-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-4 h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
      </div>
      <Skeleton className="mt-2 h-6 w-28" />
      <Skeleton className="h-20 w-full" />
    </div>
  );
}
