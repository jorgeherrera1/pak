"use client"

import * as React from "react"
import { FileUp } from "lucide-react"

import { cn } from "@dark-factory/ui/lib/utils"
import { Button } from "@dark-factory/ui/components/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@dark-factory/ui/components/empty"
import { Input } from "@dark-factory/ui/components/input"

// The browser applies `accept` to the file picker only, so dropped files are
// filtered here with the same rules: ".ext", "type/*" or an exact MIME type.
function matchesAccept(file: File, accept?: string) {
  if (!accept) return true
  return accept.split(",").some((raw) => {
    const rule = raw.trim().toLowerCase()
    if (rule.startsWith(".")) return file.name.toLowerCase().endsWith(rule)
    if (rule.endsWith("/*")) return file.type.startsWith(rule.slice(0, -1))
    return file.type === rule
  })
}

function FileUpload({
  accept,
  multiple = false,
  title = "Drop files here",
  description,
  onFiles,
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "title"> & {
  accept?: string
  multiple?: boolean
  title?: React.ReactNode
  description?: React.ReactNode
  onFiles: (files: File[]) => void
}) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = React.useState(false)

  const add = (list: FileList | null) => {
    const files = Array.from(list ?? []).filter((f) => matchesAccept(f, accept))
    if (files.length) onFiles(multiple ? files : files.slice(0, 1))
  }

  return (
    <Empty
      data-slot="file-upload"
      data-dragging={dragging || undefined}
      className={cn(
        "border-2 border-border transition-colors data-dragging:border-primary data-dragging:bg-accent",
        className
      )}
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setDragging(false)
        }
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        add(e.dataTransfer.files)
      }}
      {...props}
    >
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FileUp />
        </EmptyMedia>
        <EmptyTitle className="font-display">{title}</EmptyTitle>
        {description && <EmptyDescription>{description}</EmptyDescription>}
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" onClick={() => inputRef.current?.click()}>
          Browse files
        </Button>
        <Input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            add(e.target.files)
            e.target.value = ""
          }}
        />
      </EmptyContent>
    </Empty>
  )
}

export { FileUpload }
