"use client";

import { RefObject } from "react";
import type { PreviewDevice } from "./types";

type PreviewPaneProps = {
  projectId: string;
  previewKey: number;
  device: PreviewDevice;
  iframeRef: RefObject<HTMLIFrameElement | null>;
  onLoad: () => void;
};

/** Sandboxed app preview, optionally constrained to tablet/phone widths. */
export default function PreviewPane({
  projectId,
  previewKey,
  device,
  iframeRef,
  onLoad,
}: PreviewPaneProps) {
  return (
    <div className={`preview-stage ${device}`}>
      <iframe
        key={previewKey}
        ref={iframeRef}
        className="preview-frame"
        title="App preview"
        src={`/p/${projectId}?v=${previewKey}`}
        sandbox="allow-scripts allow-forms allow-popups allow-modals"
        onLoad={onLoad}
      />
    </div>
  );
}
