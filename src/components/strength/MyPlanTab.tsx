import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { StrengthSessionTemplate, StrengthFolder } from "@/lib/api/types";
import { ChevronRight, Dumbbell, FolderOpen } from "lucide-react";
import { useState } from "react";

interface MyPlanTabProps {
  athleteId: number;
  onSelectSession: (session: StrengthSessionTemplate) => void;
}

export function MyPlanTab({ athleteId, onSelectSession }: MyPlanTabProps) {
  // Fetch athlete's personal folders
  const { data: folders = [], isLoading: foldersLoading } = useQuery({
    queryKey: ["strength_folders", "session", athleteId],
    queryFn: () => api.getStrengthFolders("session", { athleteId }),
  });

  // Fetch full session catalog to get items
  const { data: allSessions = [] } = useQuery({
    queryKey: ["strength_catalog"],
    queryFn: () => api.getStrengthSessions(),
  });

  // Build hierarchy: root folders -> sub-folders (cycles)
  const rootFolders = folders.filter((f) => !f.parent_id);
  const subFoldersMap = new Map<number, StrengthFolder[]>();
  for (const f of folders) {
    if (f.parent_id) {
      const arr = subFoldersMap.get(f.parent_id) ?? [];
      arr.push(f);
      subFoldersMap.set(f.parent_id, arr);
    }
  }

  // Index sessions by folder_id
  const folderIds = new Set(folders.map((f) => f.id));
  const sessionsByFolder = new Map<number, StrengthSessionTemplate[]>();
  for (const s of allSessions) {
    if (s.folder_id && folderIds.has(s.folder_id)) {
      const arr = sessionsByFolder.get(s.folder_id) ?? [];
      arr.push(s);
      sessionsByFolder.set(s.folder_id, arr);
    }
  }

  if (foldersLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  if (rootFolders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
        <FolderOpen className="h-10 w-10 mb-3 opacity-40" />
        <p className="text-sm">Aucun plan personnalise.</p>
        <p className="text-xs mt-1">Ton coach peut creer un plan depuis le catalogue.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {rootFolders.map((root) => {
        const cycles = subFoldersMap.get(root.id) ?? [];
        const rootSessions = sessionsByFolder.get(root.id) ?? [];

        return (
          <div key={root.id}>
            {rootFolders.length > 1 && (
              <h3 className="text-sm font-medium text-muted-foreground mb-2">{root.name}</h3>
            )}
            {cycles.map((cycle) => (
              <CycleSection
                key={cycle.id}
                name={cycle.name}
                sessions={sessionsByFolder.get(cycle.id) ?? []}
                onSelectSession={onSelectSession}
              />
            ))}
            {rootSessions.map((s) => (
              <SessionRow key={s.id} session={s} onSelect={onSelectSession} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function CycleSection({
  name,
  sessions,
  onSelectSession,
}: {
  name: string;
  sessions: StrengthSessionTemplate[];
  onSelectSession: (s: StrengthSessionTemplate) => void;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className="mb-3">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full text-left py-2 px-1"
      >
        <ChevronRight
          className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
        />
        <span className="text-sm font-semibold">{name}</span>
        <span className="text-xs text-muted-foreground ml-auto">
          {sessions.length} seance{sessions.length > 1 ? "s" : ""}
        </span>
      </button>
      {open && (
        <div className="ml-6 space-y-1">
          {sessions.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">Aucune seance dans ce cycle.</p>
          ) : (
            sessions.map((s) => <SessionRow key={s.id} session={s} onSelect={onSelectSession} />)
          )}
        </div>
      )}
    </div>
  );
}

function SessionRow({
  session,
  onSelect,
}: {
  session: StrengthSessionTemplate;
  onSelect: (s: StrengthSessionTemplate) => void;
}) {
  const itemCount = session.items?.length ?? 0;

  return (
    <button
      onClick={() => onSelect(session)}
      className="flex items-center gap-3 w-full text-left rounded-lg border px-3 py-2.5 hover:bg-accent transition-colors"
    >
      <Dumbbell className="h-4 w-4 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{session.title || session.name}</p>
      </div>
      {itemCount > 0 && (
        <span className="text-xs text-muted-foreground shrink-0">{itemCount} ex.</span>
      )}
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </button>
  );
}
