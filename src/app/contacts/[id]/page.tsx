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
import {
  formatDateTime,
  initials,
  parseContactId,
  pluralize,
} from "@/lib/format";

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
        <CardHeader className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <div
              aria-hidden
              className="flex size-14 shrink-0 items-center justify-center rounded-full bg-line-soft font-display text-initials font-medium"
            >
              {initials(contact.name)}
            </div>
            <div className="min-w-0">
              <h1 className="font-display text-title font-medium break-words sm:text-title-lg">
                {contact.name}
              </h1>
              {contact.about && (
                <p className="mt-1 text-ink-soft">{contact.about}</p>
              )}
            </div>
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
          <dl className="grid gap-5 sm:grid-cols-[11rem_1fr] sm:gap-x-6 sm:gap-y-4">
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

      <section className="flex flex-col gap-5" aria-labelledby="notes-title">
        <div className="mt-6 flex items-baseline justify-between gap-4">
          <h2
            id="notes-title"
            className="font-display text-section font-medium sm:text-section-lg"
          >
            Заметки
          </h2>
          <span className="eyebrow">
            {pluralize(notes.length, ["заметка", "заметки", "заметок"])}
          </span>
        </div>

        <NoteForm action={addNoteAction.bind(null, contact.id)} />

        {notes.length > 0 ? (
          // Lines between notes, like the lists on the landing
          <ol className="mt-3 border-b">
            {notes.map((note) => (
              <li key={note.id} className="border-t py-5">
                <time dateTime={note.createdAt.toISOString()} className="eyebrow">
                  {formatDateTime(note.createdAt)}
                </time>
                <p className="mt-2 whitespace-pre-wrap break-words">{note.body}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-3 rounded-lg border px-4 py-6 text-center text-ink-soft">
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
      <dt className="text-xs font-medium tracking-widest text-muted-foreground uppercase sm:pt-1">
        {label}
      </dt>
      <dd className="-mt-3 sm:mt-0">
        {children || <span className="text-muted-foreground/70">Не указано</span>}
      </dd>
    </div>
  );
}

function ContactSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <div className="flex flex-col gap-3 rounded-lg border p-5 sm:p-7">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-4 h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
      </div>
      <Skeleton className="mt-6 h-8 w-32" />
      <Skeleton className="h-20 w-full" />
    </div>
  );
}
