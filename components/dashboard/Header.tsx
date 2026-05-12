import Link from "next/link";
import { Hexagon } from "lucide-react";

export function Header() {
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
        </nav>
      </div>
    </header>
  );
}
