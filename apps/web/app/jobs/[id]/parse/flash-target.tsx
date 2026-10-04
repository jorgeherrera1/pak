"use client";

import { useEffect } from "react";

/** Flashes the row the URL hash points at; for a section, every row inside it. */
export function FlashTarget() {
  useEffect(() => {
    const flash = () => {
      const id = decodeURIComponent(location.hash.slice(1));
      for (const el of document.querySelectorAll(`[data-anchors~="${id}"]`)) {
        el.classList.add("flash");
        el.addEventListener(
          "animationend",
          () => el.classList.remove("flash"),
          { once: true },
        );
      }
    };
    flash();
    window.addEventListener("hashchange", flash);
    return () => window.removeEventListener("hashchange", flash);
  }, []);
  return null;
}
