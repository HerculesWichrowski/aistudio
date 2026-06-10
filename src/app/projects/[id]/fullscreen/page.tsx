import { Suspense } from "react";
import AppWorkspace from "@/components/AppWorkspace";

export default function FullscreenPage() {
  return (
    <Suspense fallback={<div className="empty-state">Loading workspace...</div>}>
      <AppWorkspace fullscreen />
    </Suspense>
  );
}
