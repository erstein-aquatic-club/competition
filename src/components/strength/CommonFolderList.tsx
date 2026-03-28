import { useMemo, useState } from "react";
import { StrengthSessionTemplate, StrengthFolder } from "@/lib/api";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { ChevronRight, FolderOpen, Dumbbell } from "lucide-react";
import { cn } from "@/lib/utils";

interface CommonFolderListProps {
  folders: StrengthFolder[];
  allSessions: StrengthSessionTemplate[];
  onStartCatalog: (session: StrengthSessionTemplate) => void;
}

export function CommonFolderList({ folders, allSessions, onStartCatalog }: CommonFolderListProps) {
  const rootFolders = useMemo(() => folders.filter((f) => !f.parent_id), [folders]);
  const subFoldersMap = useMemo(() => {
    const map = new Map<number, StrengthFolder[]>();
    for (const f of folders) {
      if (f.parent_id) {
        const arr = map.get(f.parent_id) ?? [];
        arr.push(f);
        map.set(f.parent_id, arr);
      }
    }
    return map;
  }, [folders]);

  const sessionsByFolder = useMemo(() => {
    const folderIds = new Set(folders.map((f) => f.id));
    const map = new Map<number, StrengthSessionTemplate[]>();
    for (const s of allSessions) {
      if (s.folder_id && folderIds.has(s.folder_id)) {
        const arr = map.get(s.folder_id) ?? [];
        arr.push(s);
        map.set(s.folder_id, arr);
      }
    }
    return map;
  }, [folders, allSessions]);

  if (rootFolders.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 pt-1">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">Biblioth\u00e8que</span>
        <div className="flex-1 h-px bg-border/40" />
      </div>

      {rootFolders.map((root) => {
        const subs = subFoldersMap.get(root.id) ?? [];
        const directSessions = sessionsByFolder.get(root.id) ?? [];
        const allFolderSessions = [
          ...directSessions,
          ...subs.flatMap((sub) => sessionsByFolder.get(sub.id) ?? []),
        ];
        if (allFolderSessions.length === 0) return null;

        return (
          <FolderAccordion
            key={root.id}
            folder={root}
            subFolders={subs}
            sessionsByFolder={sessionsByFolder}
            directSessions={directSessions}
            totalCount={allFolderSessions.length}
            onStartCatalog={onStartCatalog}
          />
        );
      })}
    </div>
  );
}

function FolderAccordion({
  folder,
  subFolders,
  sessionsByFolder,
  directSessions,
  totalCount,
  onStartCatalog,
}: {
  folder: StrengthFolder;
  subFolders: StrengthFolder[];
  sessionsByFolder: Map<number, StrengthSessionTemplate[]>;
  directSessions: StrengthSessionTemplate[];
  totalCount: number;
  onStartCatalog: (session: StrengthSessionTemplate) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-2.5 w-full rounded-xl border bg-card px-3 py-2.5 text-left hover:bg-accent/50 transition-colors">
        <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-[13px] font-semibold flex-1 truncate">{folder.name}</span>
        <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">{totalCount}</span>
        <ChevronRight className={cn("h-3.5 w-3.5 text-muted-foreground/40 transition-transform", open && "rotate-90")} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="pl-3 pt-1 space-y-1">
          {directSessions.map((s) => (
            <SessionRow key={s.id} session={s} onSelect={onStartCatalog} />
          ))}
          {subFolders.map((sub) => {
            const sessions = sessionsByFolder.get(sub.id) ?? [];
            if (sessions.length === 0) return null;
            return (
              <div key={sub.id} className="space-y-1">
                <p className="text-[11px] font-semibold text-muted-foreground/70 pt-1.5 pl-1">{sub.name}</p>
                {sessions.map((s) => (
                  <SessionRow key={s.id} session={s} onSelect={onStartCatalog} />
                ))}
              </div>
            );
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function SessionRow({ session, onSelect }: { session: StrengthSessionTemplate; onSelect: (s: StrengthSessionTemplate) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(session)}
      className="group flex items-center gap-2.5 w-full rounded-lg px-2.5 py-2 text-left hover:bg-accent/50 transition-colors"
    >
      <Dumbbell className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
      <span className="text-[13px] font-medium flex-1 truncate">{session.title ?? session.name ?? "Sans titre"}</span>
      <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">{session.items?.length ?? 0} ex.</span>
      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/30 transition-transform group-hover:translate-x-0.5 shrink-0" />
    </button>
  );
}
