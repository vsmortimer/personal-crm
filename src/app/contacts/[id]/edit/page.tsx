import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { updateContactAction } from "@/app/actions";
import { BackLink } from "@/components/back-link";
import { ContactForm } from "@/components/contact-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getContact } from "@/lib/contacts";
import { parseContactId } from "@/lib/format";

export const metadata: Metadata = {
  title: "Изменить контакт",
};

export default function EditContactPage({
  params,
}: PageProps<"/contacts/[id]/edit">) {
  return (
    <Suspense fallback={<EditSkeleton />}>
      {params.then(({ id }) => (
        <EditContact rawId={id} />
      ))}
    </Suspense>
  );
}

async function EditContact({ rawId }: { rawId: string }) {
  const id = parseContactId(rawId);
  if (!id) notFound();

  const contact = await getContact(id);
  if (!contact) notFound();

  return (
    <div className="flex flex-col gap-4">
      <BackLink href={`/contacts/${contact.id}`}>К карточке</BackLink>
      <Card>
        <CardHeader>
          <CardTitle>
            <h1 className="font-display text-title font-medium sm:text-title-lg">Изменить контакт</h1>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ContactForm
            action={updateContactAction.bind(null, contact.id)}
            initialValues={{
              name: contact.name,
              about: contact.about ?? "",
              howWeMet: contact.howWeMet ?? "",
              phone: contact.phone ?? "",
              email: contact.email ?? "",
            }}
            submitLabel="Сохранить"
            cancelHref={`/contacts/${contact.id}`}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function EditSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <Skeleton className="h-5 w-28" />
      <div className="flex flex-col gap-4 rounded-lg border p-5 sm:p-7">
        <Skeleton className="h-10 w-56" />
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-11 w-full" />
        ))}
      </div>
    </div>
  );
}
