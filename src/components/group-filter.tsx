import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { homeHref } from "@/lib/format";
import type { GroupListItem } from "@/lib/groups";

// «Все» and a button per group, under the search. Plain links: the group
// lives in the address, so Back and reloading the page keep it.
export function GroupFilter({
  groups,
  selectedId,
  query,
}: {
  groups: GroupListItem[];
  selectedId: number | null;
  query: string;
}) {
  const options = [
    { id: null, name: "Все" },
    ...groups.map(({ id, name }) => ({ id, name })),
  ];

  return (
    <nav aria-label="Группы">
      <ul className="flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = option.id === selectedId;
          return (
            <li key={option.id ?? "all"} className="max-w-full">
              <Link
                href={homeHref(query, option.id)}
                aria-current={selected ? "true" : undefined}
                className={buttonVariants({
                  variant: selected ? "default" : "outline",
                  // 44px on phones, so it is easy to tap
                  className: "h-11 max-w-full sm:h-10",
                })}
              >
                <span className="truncate">{option.name}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
