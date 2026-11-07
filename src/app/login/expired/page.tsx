import type { Metadata } from "next";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Ссылка устарела",
};

// Where a link from an email leads when it no longer works: it is too old,
// was used already or was replaced by a newer one. Whatever the reason, the
// answer is the same.
export default function ExpiredLinkPage() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border px-6 py-16 text-center">
      <h1 className="font-display text-section font-medium sm:text-section-lg">
        Ссылка устарела, запроси новую
      </h1>
      <Link href="/login" className={buttonVariants({ variant: "outline" })}>
        На страницу входа
      </Link>
    </div>
  );
}
