import { signOutAction } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/session";

// The address of the person and the button to sign out, on the right of the
// header. Nothing for a person who is not signed in.
export async function UserMenu() {
  const user = await getCurrentUser();
  if (!user) return null;

  return (
    <div className="flex min-w-0 items-center gap-3">
      {/* A long address is cut with an ellipsis; the button always stays */}
      <span
        className="min-w-0 truncate text-sm text-ink-soft"
        title={user.email}
      >
        {user.email}
      </span>
      <form action={signOutAction} className="shrink-0">
        <Button type="submit" variant="outline" size="sm">
          Выйти
        </Button>
      </form>
    </div>
  );
}
