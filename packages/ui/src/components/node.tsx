"use client";

import { Handle, Position } from "@xyflow/react";
import type { ComponentProps } from "react";

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@dark-factory/ui/components/card";
import { cn } from "@dark-factory/ui/lib/utils";

export type NodeProps = ComponentProps<typeof Card> & {
  handles: { target: boolean; source: boolean };
};

export const Node = ({ handles, className, ...props }: NodeProps) => (
  <Card
    className={cn(
      "node-container relative size-full h-auto w-sm gap-0 rounded-md p-0",
      className,
    )}
    {...props}
  >
    {handles.target && <Handle position={Position.Left} type="target" />}
    {handles.source && <Handle position={Position.Right} type="source" />}
    {props.children}
  </Card>
);

export const NodeHeader = ({
  className,
  ...props
}: ComponentProps<typeof CardHeader>) => (
  <CardHeader
    className={cn("gap-0.5 rounded-t-md border-b bg-secondary p-3!", className)}
    {...props}
  />
);
export const NodeTitle = (props: ComponentProps<typeof CardTitle>) => (
  <CardTitle {...props} />
);
export const NodeDescription = (
  props: ComponentProps<typeof CardDescription>,
) => <CardDescription {...props} />;
export const NodeAction = (props: ComponentProps<typeof CardAction>) => (
  <CardAction {...props} />
);
export const NodeContent = ({
  className,
  ...props
}: ComponentProps<typeof CardContent>) => (
  <CardContent className={cn("p-3", className)} {...props} />
);
export const NodeFooter = ({
  className,
  ...props
}: ComponentProps<typeof CardFooter>) => (
  <CardFooter
    className={cn("rounded-b-md border-t bg-secondary p-3!", className)}
    {...props}
  />
);
