import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type PageSkeletonProps = {
  variant?: "portal" | "public" | "detail" | "auth";
};

export function PageSkeleton({ variant = "portal" }: PageSkeletonProps) {
  if (variant === "public") return <PublicSkeleton />;
  if (variant === "detail") return <DetailSkeleton />;
  if (variant === "auth") return <AuthSkeleton />;
  return <PortalSkeleton />;
}

function PortalSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-3">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="h-10 w-full sm:w-40" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <SkeletonPanel key={index} className="h-32" />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <SkeletonPanel className="h-14" />
          {Array.from({ length: 5 }).map((_, index) => (
            <SkeletonPanel key={index} className="h-20" />
          ))}
        </div>
        <div className="space-y-4">
          <SkeletonPanel className="h-48" />
          <SkeletonPanel className="h-32" />
        </div>
      </div>
    </div>
  );
}

function PublicSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl space-y-10 px-4 py-4 sm:py-8 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          <Skeleton className="h-10 w-40" />
          <div className="hidden gap-3 sm:flex">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-24" />
          </div>
        </div>
        <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
          <div className="space-y-5">
            <Skeleton className="h-12 w-full max-w-xl" />
            <Skeleton className="h-12 w-4/5 max-w-lg" />
            <Skeleton className="h-5 w-full max-w-2xl" />
            <Skeleton className="h-5 w-3/4 max-w-xl" />
            <div className="flex gap-3 pt-2">
              <Skeleton className="h-11 w-36" />
              <Skeleton className="h-11 w-28" />
            </div>
          </div>
          <SkeletonPanel className="h-80" />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <SkeletonPanel key={index} className="h-44" />
          ))}
        </div>
      </div>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-brand-950">
        <div className="mx-auto max-w-5xl space-y-7 px-4 py-4 sm:py-8 sm:px-6 lg:px-8">
          <Skeleton className="h-10 w-36 bg-white/20" />
          <div className="space-y-4">
            <Skeleton className="h-8 w-40 bg-white/20" />
            <Skeleton className="h-12 w-full max-w-3xl bg-white/20" />
            <Skeleton className="h-5 w-full max-w-xl bg-white/20" />
          </div>
        </div>
      </div>
      <div className="mx-auto grid max-w-5xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_280px] lg:px-8">
        <SkeletonPanel className="h-96" />
        <div className="space-y-4">
          <SkeletonPanel className="h-56" />
          <SkeletonPanel className="h-32" />
        </div>
      </div>
    </div>
  );
}

function AuthSkeleton() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <SkeletonPanel className="h-[420px] w-full max-w-md" />
    </div>
  );
}

function SkeletonPanel({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-lg border border-border bg-surface p-4 shadow-sm", className)}>
      <div className="space-y-3">
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  );
}
