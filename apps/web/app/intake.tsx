"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, FileText, X } from "lucide-react";
import { Button } from "@dark-factory/ui/components/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@dark-factory/ui/components/card";
import { FileUpload } from "@dark-factory/ui/components/file-upload";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@dark-factory/ui/components/item";
import { formatSize } from "@/lib/format";

export function Intake() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    if (!file) return;
    setBusy(true);
    setError(null);
    const body = new FormData();
    body.set("file", file);
    try {
      const res = await fetch("/api/jobs", { method: "POST", body });
      if (res.status === 202) {
        const { id } = (await res.json()) as { id: string };
        router.push(`/jobs/${id}`);
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(
        res.status === 400 && data.error
          ? data.error
          : "could not start the job",
      );
    } catch {
      setError("could not start the job");
    }
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-8">
      <FileUpload
        accept=".pdf,application/pdf"
        title={
          file
            ? "Drop another document to replace it"
            : "Drop a requirements document here"
        }
        description="PDF only for now"
        onFiles={(added) => {
          setFile(added[0] ?? null);
          setError(null);
        }}
      />

      {file && (
        <Card>
          <CardHeader>
            <CardTitle>Ready to start</CardTitle>
            <CardDescription>1 document queued</CardDescription>
            <CardAction>
              <Button size="lg" onClick={start} disabled={busy}>
                {busy ? "Starting…" : "Start run"}
                <ArrowRight />
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Item size="sm" className="px-0">
              <ItemMedia variant="icon">
                <FileText />
              </ItemMedia>
              <ItemContent className="min-w-0">
                <ItemTitle className="max-w-full truncate">
                  {file.name}
                </ItemTitle>
                <ItemDescription>{formatSize(file.size)}</ItemDescription>
              </ItemContent>
              <ItemActions>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${file.name}`}
                  onClick={() => setFile(null)}
                  disabled={busy}
                >
                  <X />
                </Button>
              </ItemActions>
            </Item>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
