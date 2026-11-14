import { cn } from "@/lib/utils"

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("tk-skel rounded-md bg-hover", className)}
      {...props}
    />
  )
}

export { Skeleton }
