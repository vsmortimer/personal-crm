"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { homeHref } from "@/lib/format";

const DEBOUNCE_MS = 250;

// `query` is the search currently applied in the URL; `groupId` is the
// group selected in the filter, kept in the URL when the search changes
export function ContactSearch({
  query,
  groupId,
}: {
  query: string;
  groupId: number | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const [value, setValue] = useState(query);
  // The last query this input put into the URL
  const [requested, setRequested] = useState(query);
  const [appliedQuery, setAppliedQuery] = useState(query);

  // The URL changed: if it wasn't our own search (e.g. the header link or
  // the browser's back button), show the query from the URL instead
  if (query !== appliedQuery) {
    setAppliedQuery(query);
    if (query !== requested) {
      setValue(query);
      setRequested(query);
    }
  }

  useEffect(() => () => clearTimeout(timer.current), []);

  function search(nextValue: string, delay: number) {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const nextQuery = nextValue.trim();
      setRequested(nextQuery);
      startTransition(() =>
        router.replace(homeHref(nextQuery, groupId), { scroll: false }),
      );
    }, delay);
  }

  return (
    // Without JavaScript the form still works as a plain GET request
    <form
      action="/"
      role="search"
      className="relative"
      onSubmit={(event) => {
        event.preventDefault();
        search(value, 0);
      }}
    >
      {groupId && <input type="hidden" name="group" value={groupId} />}
      <Search
        className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        type="search"
        name="q"
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          search(event.target.value, DEBOUNCE_MS);
        }}
        placeholder="Найти по имени"
        aria-label="Найти контакт по имени"
        autoComplete="off"
        className="h-12 pr-11 pl-11"
      />
      {isPending && (
        <LoaderCircle
          className="absolute top-1/2 right-4 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
          aria-label="Ищу…"
        />
      )}
    </form>
  );
}
