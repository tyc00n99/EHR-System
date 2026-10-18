import { ChevronRight } from "lucide-react";
import { Fragment } from "react";

/**
 * EVV screens open with a breadcrumb, the title and one sentence saying what the screen holds
 * (Oct 18, 2026, the user's pick "A"). The breadcrumb's last crumb is the title; the sidebar is
 * how you move between screens.
 */
export function EvvHeader({ crumbs, title, lead }: { crumbs: string[]; title: string; lead?: React.ReactNode }) {
  return (
    <header className="mb-5">
      <nav aria-label="Breadcrumb" className="-mx-1 mb-5 flex flex-wrap items-center gap-2 border-b border-line px-1 pb-3.5 text-[15px] text-muted-foreground">
        {["EVV", ...crumbs].map((c, i, all) => (
          <Fragment key={i}>
            {i > 0 && <ChevronRight size={14} aria-hidden />}
            <span className={i === all.length - 1 ? "font-medium text-text-strong" : undefined} aria-current={i === all.length - 1 ? "page" : undefined}>{c}</span>
          </Fragment>
        ))}
      </nav>
      <h1>{title}</h1>
      {lead && <p className="mt-1 text-[15px] text-muted-foreground">{lead}</p>}
    </header>
  );
}
