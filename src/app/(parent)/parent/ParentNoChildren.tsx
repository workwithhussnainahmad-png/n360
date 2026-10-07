import { Card, CardContent } from "@/components/ui/card";

export function ParentNoChildren() {
  return (
    <Card>
      <CardContent className="px-6 py-12 text-center">
        <h1 className="font-display text-2xl font-semibold text-brand-950">No linked students</h1>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-stone-600">Ask the institution to add this guardian email to the student profile. The child will appear here automatically.</p>
      </CardContent>
    </Card>
  );
}
