import { Suspense } from "react";
import { RouteSheet } from "@/components/route-sheet";
import { VisitRecord } from "./visit-record";

/** Mount on any page: `{sp.visit && <VisitSheet id={sp.visit} />}`. */
export function VisitSheet({ id }: { id: string }) {
  return (
    <Suspense>
      <RouteSheet param="visit" title="Service record"><VisitRecord id={id} inSheet /></RouteSheet>
    </Suspense>
  );
}
