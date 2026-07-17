import { cn } from "@/lib/utils";

/**
 * Skeleton — placeholder shown while content loads.
 * Follows the shadcn/ui convention.
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}

export { Skeleton };
