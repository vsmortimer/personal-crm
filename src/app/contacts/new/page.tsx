import type { Metadata } from "next";
import { Suspense } from "react";

import { createContactAction } from "@/app/actions";
import { BackLink } from "@/components/back-link";
import { ContactForm } from "@/components/contact-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { listGroups } from "@/lib/groups";
import { requireUser } from "@/lib/session";
import { emptyContactValues } from "@/lib/validation";

export const metadata: Metadata = {
  title: "Новый контакт",
};

export default function NewContactPage() {
  return (
    <div className="flex flex-col gap-4">
      <BackLink href="/">Все контакты</BackLink>
      <Card>
        <CardHeader>
          <CardTitle>
            <h1 className="font-display text-title font-medium sm:text-title-lg">
              Новый контакт
            </h1>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* The groups are read fresh for every visit */}
          <Suspense fallback={<FormSkeleton />}>
            <NewContactForm />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}

async function NewContactForm() {
  const user = await requireUser();
  const groups = await listGroups(user.id);

  return (
    <ContactForm
      action={createContactAction}
      initialValues={emptyContactValues}
      groups={groups.map(({ id, name }) => ({ id, name }))}
      initialGroupIds={[]}
      submitLabel="Добавить контакт"
      cancelHref="/"
    />
  );
}

function FormSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      {Array.from({ length: 5 }, (_, index) => (
        <Skeleton key={index} className="h-11 w-full" />
      ))}
      <Skeleton className="mt-2 h-12 w-44" />
    </div>
  );
}
