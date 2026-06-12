import { Suspense } from "react";
import AppWorkspace from "@/components/AppWorkspace";
import PageLoader from "@/components/PageLoader";

export default function ProjectPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <AppWorkspace />
    </Suspense>
  );
}
