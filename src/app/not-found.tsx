import { Suspense } from "react";
import { NotFoundChasePage } from "@/components/NotFoundChasePage";

function NotFoundFallback() {
  return (
    <div className="flex h-screen w-full items-center justify-center">
      <div className="text-xl text-stone-500 font-medium">Page not found</div>
    </div>
  );
}

export default function NotFound() {
  return (
    <Suspense fallback={<NotFoundFallback />}>
      <NotFoundChasePage fallbackWord="this page" />
    </Suspense>
  );
}
