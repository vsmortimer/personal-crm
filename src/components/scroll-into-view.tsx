"use client";

import { useEffect } from "react";

// Scrolls the page to an element once it is rendered, e.g. a just-added contact
export function ScrollIntoView({ elementId }: { elementId: string }) {
  useEffect(() => {
    document
      .getElementById(elementId)
      ?.scrollIntoView({ block: "center" });
  }, [elementId]);

  return null;
}
