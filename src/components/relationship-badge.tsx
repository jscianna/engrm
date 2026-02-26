import { Badge } from "@/components/ui/badge";
import type { MemoryRelationshipType } from "@/lib/types";

const relationshipStyles: Record<MemoryRelationshipType, string> = {
  similar: "border-cyan-700/60 text-cyan-200",
  updates: "border-amber-700/60 text-amber-200",
  contradicts: "border-rose-700/60 text-rose-200",
  extends: "border-emerald-700/60 text-emerald-200",
  derives_from: "border-indigo-700/60 text-indigo-200",
  references: "border-zinc-700 text-zinc-200",
};

export function RelationshipBadge({ type }: { type: MemoryRelationshipType }) {
  return (
    <Badge variant="outline" className={relationshipStyles[type]}>
      {type}
    </Badge>
  );
}
