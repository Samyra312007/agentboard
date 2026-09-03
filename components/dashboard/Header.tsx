"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Hexagon, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

export function Header() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const {
        data: { user: sessionUser },
      } = await supabase.auth.getUser();
      if (!cancelled) setUser(sessionUser);
    })().catch(() => {
      // Session unavailable — header just renders without user info.
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSignOut = async () => {
    await fetch("/auth/signout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-12 items-center justify-between">
        <Link href="/" className="flex items-center space-x-2">
          <Hexagon className="h-5 w-5 text-primary" />
          <span className="font-semibold text-foreground">AgentBoard</span>
        </Link>
        <nav className="flex items-center space-x-6">
          <Link
            href="/"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Dashboard
          </Link>
          <Link
            href="/runs"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            History
          </Link>
          {user && (
            <div className="flex items-center gap-3 border-l border-border pl-6">
              <span className="text-sm text-muted-foreground max-w-[160px] truncate">
                {user.email}
              </span>
              <button
                onClick={() => void handleSignOut()}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                title="Sign out"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}