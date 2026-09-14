"use client";

import { useEffect, useState } from "react";
import type { JobResponse } from "@/lib/graph";

const INTERVAL_MS = 2000;

/** Polls the job until it is done or failed. Stops on any error; the user reloads. */
export function useJob(id: string) {
  const [job, setJob] = useState<JobResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const res = await fetch(`/api/jobs/${id}`);
        if (stopped) return;
        if (res.status === 404) return setError("job not found");
        if (!res.ok) return setError(`request failed (${res.status})`);
        const next = (await res.json()) as JobResponse;
        if (stopped) return;
        setJob(next);
        if (next.status === "done" || next.status === "failed") return;
      } catch {
        if (!stopped) setError("connection lost, reload to retry");
        return;
      }
      timer = setTimeout(tick, INTERVAL_MS);
    };
    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [id]);

  return { job, error };
}
