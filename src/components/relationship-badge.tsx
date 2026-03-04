import { Badge } from "@/components/ui/badge";
import type { MemoryRelationshipType } from "@/lib/types";

const relationshipStyles: Record<MemoryRelationshipType, string> = {
  similar: "border-zinc-600/60 text-zinc-300",
  same_entity: "border-zinc-400/60 text-zinc-100",
  updates: "border-amber-600/60 text-amber-200",
  contradicts: "border-rose-600/60 text-rose-200",
  extends: "border-emerald-600/60 text-emerald-200",
  derives_from: "border-indigo-600/60 text-indigo-200",
  references: "border-zinc-700 text-zinc-300",
};

export function RelationshipBadge({ type }: { type: MemoryRelationshipType }) {
  return (
    <Badge variant="outline" className={relationshipStyles[type]}>
      {type}
    </Badge>
  );
}
