"use client";

import { Fragment, useState } from "react";
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
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from "@dark-factory/ui/components/item";

const formatSize = (bytes: number) =>
  bytes < 1e6
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1048576).toFixed(1)} MB`;

export function Intake() {
  const [files, setFiles] = useState<File[]>([]);

  return (
    <div className="flex flex-col gap-8">
      <FileUpload
        accept=".pdf,application/pdf"
        multiple
        title={
          files.length
            ? "Drop more documents"
            : "Drop requirements documents here"
        }
        description="PDF only for now"
        onFiles={(added) => setFiles((prev) => [...prev, ...added])}
      />

      {files.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Ready to run</CardTitle>
            <CardDescription>
              {files.length} {files.length === 1 ? "document" : "documents"}{" "}
              queued
            </CardDescription>
            <CardAction>
              {/* Not wired yet: this is where the run gets fired off. */}
              <Button size="lg">
                Start run
                <ArrowRight />
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <ItemGroup>
              {files.map((file, i) => (
                <Fragment key={`${i}-${file.name}`}>
                  {i > 0 && <ItemSeparator />}
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
                        onClick={() =>
                          setFiles((prev) => prev.filter((_, j) => j !== i))
                        }
                      >
                        <X />
                      </Button>
                    </ItemActions>
                  </Item>
                </Fragment>
              ))}
            </ItemGroup>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
