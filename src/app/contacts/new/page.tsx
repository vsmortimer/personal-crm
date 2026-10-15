import type { Metadata } from "next";

import { createContactAction } from "@/app/actions";
import { BackLink } from "@/components/back-link";
import { ContactForm } from "@/components/contact-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
            <h1 className="font-display text-title font-medium sm:text-title-lg">Новый контакт</h1>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ContactForm
            action={createContactAction}
            initialValues={emptyContactValues}
            submitLabel="Добавить контакт"
            cancelHref="/"
          />
        </CardContent>
      </Card>
    </div>
  );
}
