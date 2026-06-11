/**
 * API Swim - Swim catalog methods
 */

import {
  supabase,
  canUseSupabase,
  safeInt,
  safeOptionalInt,
  parseRawPayload,
  STORAGE_KEYS,
  assertSupabase,
} from './client';
import type { SwimSessionTemplate, SwimSessionItem, SwimCatalogFolder } from './types';
import { localStorageGet, localStorageSave } from './localStorage';

export async function getSwimCatalog(): Promise<SwimSessionTemplate[]> {
  if (canUseSupabase()) {
    const catalogs = assertSupabase(
      await supabase
        .from("swim_sessions_catalog")
        .select("*, swim_session_items(*)")
        .order("created_at", { ascending: false })
        // §378 — filet anti-vieillissement : le catalogue + items imbriqués est
        // chargé entier sur le chemin chaud coach ; on garde les 500 plus récents.
        .limit(500)
    );
    return (catalogs ?? []).map((catalog: any) => ({
      id: safeInt(catalog.id, Date.now()),
      name: String(catalog.name || ""),
      description: catalog.description ?? null,
      created_by: safeOptionalInt(catalog.created_by) ?? null,
      created_at: catalog.created_at ?? null,
      updated_at: catalog.updated_at ?? null,
      folder: catalog.folder ?? null,
      is_archived: catalog.is_archived ?? false,
      items: Array.isArray(catalog.swim_session_items)
        ? catalog.swim_session_items
            .sort((a: any, b: any) => (a.ordre ?? 0) - (b.ordre ?? 0))
            .map((item: any, index: number) => ({
              id: safeOptionalInt(item.id) ?? undefined,
              catalog_id: safeOptionalInt(item.catalog_id) ?? undefined,
              ordre: safeOptionalInt(item.ordre) ?? index,
              label: item.label ?? null,
              distance: safeOptionalInt(item.distance) ?? null,
              duration: safeOptionalInt(item.duration) ?? null,
              intensity: item.intensity ?? null,
              notes: item.notes ?? null,
              raw_payload: parseRawPayload(item.raw_payload),
            }))
        : [],
    }));
  }

  const raw = (localStorageGet(STORAGE_KEYS.SWIM_SESSIONS) || []) as any[];
  return raw.map((catalog: any) => ({
    id: safeInt(catalog.id, Date.now()),
    name: String(catalog.name || catalog.title || ""),
    description: catalog.description ?? null,
    created_by: safeOptionalInt(catalog.created_by) ?? null,
    created_at: catalog.created_at ?? null,
    updated_at: catalog.updated_at ?? null,
    folder: catalog.folder ?? null,
    is_archived: catalog.is_archived ?? false,
    items: Array.isArray(catalog.items)
      ? catalog.items.map((item: any, index: number) => ({
          id: safeOptionalInt(item.id) ?? undefined,
          catalog_id: safeOptionalInt(item.catalog_id) ?? undefined,
          ordre: safeOptionalInt(item.ordre) ?? index,
          label: item.label ?? item.section ?? null,
          distance: safeOptionalInt(item.distance) ?? null,
          duration: safeOptionalInt(item.duration) ?? null,
          intensity: item.intensity ?? null,
          notes: item.notes ?? item.instruction ?? null,
          raw_payload:
            parseRawPayload(item.raw_payload) ??
            (item.section || item.stroke || item.instruction || item.rest
              ? {
                  section: item.section,
                  stroke: item.stroke,
                  instruction: item.instruction,
                  rest: item.rest,
                }
              : null),
        }))
      : [],
  }));
}

export async function getSwimSessionById(sessionId: number): Promise<SwimSessionTemplate | null> {
  if (canUseSupabase()) {
    const { data: catalog, error } = await supabase
      .from("swim_sessions_catalog")
      .select("*, swim_session_items(*)")
      .eq("id", sessionId)
      .single();
    if (error || !catalog) return null;
    return {
      id: safeInt(catalog.id, Date.now()),
      name: String(catalog.name || ""),
      description: catalog.description ?? null,
      created_by: safeOptionalInt(catalog.created_by) ?? null,
      created_at: catalog.created_at ?? null,
      updated_at: catalog.updated_at ?? null,
      folder: catalog.folder ?? null,
      is_archived: catalog.is_archived ?? false,
      items: Array.isArray(catalog.swim_session_items)
        ? catalog.swim_session_items
            .sort((a: any, b: any) => (a.ordre ?? 0) - (b.ordre ?? 0))
            .map((item: any, index: number) => ({
              id: safeOptionalInt(item.id) ?? undefined,
              catalog_id: safeOptionalInt(item.catalog_id) ?? undefined,
              ordre: safeOptionalInt(item.ordre) ?? index,
              label: item.label ?? null,
              distance: safeOptionalInt(item.distance) ?? null,
              duration: safeOptionalInt(item.duration) ?? null,
              intensity: item.intensity ?? null,
              notes: item.notes ?? null,
              raw_payload: parseRawPayload(item.raw_payload),
            }))
        : [],
    };
  }
  return null;
}

export async function createSwimSession(session: any) {
  if (!Array.isArray(session.items) || session.items.length === 0) {
    throw new Error("La séance doit contenir au moins un exercice.");
  }
  if (canUseSupabase()) {
    const items = session.items.map((item: any, index: number) => ({
          ordre: item.ordre ?? index,
          label: item.label ?? null,
          distance: item.distance ?? null,
          duration: item.duration ?? null,
          intensity: item.intensity ?? null,
          notes: item.notes ?? null,
          raw_payload: item.raw_payload ?? null,
        }));
    if (session.id) {
      // Update existing — atomic RPC (DELETE + INSERT in single transaction)
      assertSupabase(await supabase.rpc('update_swim_session_atomic', {
        p_session_id: session.id,
        p_name: session.name,
        p_description: session.description ?? null,
        p_total_distance: session.total_distance ?? null,
        p_folder: session.folder ?? null,
        p_items: items,
      }));
      return { status: "updated" };
    }
    // Create new — atomic RPC
    const data = assertSupabase(await supabase.rpc('create_swim_session_atomic', {
      p_name: session.name,
      p_description: session.description ?? null,
      p_total_distance: session.total_distance ?? null,
      p_folder: session.folder ?? null,
      p_created_by: session.created_by ?? null,
      p_items: items,
    }));
    return { status: "created", sessionId: data?.session_id };
  }

  const s = (localStorageGet(STORAGE_KEYS.SWIM_SESSIONS) || []) as any[];
  if (session.id) {
    const exists = s.some((entry: any) => entry.id === session.id);
    const updated = exists
      ? s.map((entry: any) => (entry.id === session.id ? { ...entry, ...session } : entry))
      : [...s, { ...session, id: session.id }];
    localStorageSave(STORAGE_KEYS.SWIM_SESSIONS, updated);
    return { status: exists ? "updated" : "created" };
  }
  localStorageSave(STORAGE_KEYS.SWIM_SESSIONS, [...s, { ...session, id: Date.now() }]);
  return { status: "created" };
}

export async function deleteSwimSession(sessionId: number) {
  if (canUseSupabase()) {
    const data = assertSupabase(
      await supabase
        .from("swim_sessions_catalog")
        .delete()
        .eq("id", sessionId)
        .select("id")
    );
    if (!data || data.length === 0) {
      throw new Error("Suppression refusée ou séance introuvable");
    }
    return { status: "deleted" };
  }
  const sessions = (localStorageGet(STORAGE_KEYS.SWIM_SESSIONS) || []) as any[];
  const updatedSessions = sessions.filter(
    (session: SwimSessionTemplate) => session.id !== sessionId,
  );
  localStorageSave(STORAGE_KEYS.SWIM_SESSIONS, updatedSessions);
  return { status: "deleted" };
}

export async function archiveSwimSession(sessionId: number, archived: boolean) {
  if (canUseSupabase()) {
    const data = assertSupabase(
      await supabase
        .from("swim_sessions_catalog")
        .update({ is_archived: archived })
        .eq("id", sessionId)
        .select("id")
    );
    if (!data || data.length === 0) {
      throw new Error("Modification refusée ou séance introuvable");
    }
    return { status: archived ? "archived" : "restored" };
  }
  const sessions = (localStorageGet(STORAGE_KEYS.SWIM_SESSIONS) || []) as any[];
  const updated = sessions.map((s: any) =>
    s.id === sessionId ? { ...s, is_archived: archived } : s
  );
  localStorageSave(STORAGE_KEYS.SWIM_SESSIONS, updated);
  return { status: archived ? "archived" : "restored" };
}

export async function moveSwimSession(sessionId: number, folder: string | null) {
  if (canUseSupabase()) {
    const data = assertSupabase(
      await supabase
        .from("swim_sessions_catalog")
        .update({ folder })
        .eq("id", sessionId)
        .select("id")
    );
    if (!data || data.length === 0) {
      throw new Error("Déplacement refusé ou séance introuvable");
    }
    return { status: "moved" };
  }
  const sessions = (localStorageGet(STORAGE_KEYS.SWIM_SESSIONS) || []) as any[];
  const updated = sessions.map((s: any) =>
    s.id === sessionId ? { ...s, folder } : s
  );
  localStorageSave(STORAGE_KEYS.SWIM_SESSIONS, updated);
  return { status: "moved" };
}

export async function migrateLocalStorageArchive(archivedIds: number[]) {
  if (!canUseSupabase() || archivedIds.length === 0) return;
  assertSupabase(
    await supabase
      .from("swim_sessions_catalog")
      .update({ is_archived: true })
      .in("id", archivedIds)
  );
}

/**
 * Generate (or retrieve existing) share token for a swim session.
 * Returns the UUID token string.
 */
export async function generateShareToken(catalogId: number): Promise<string> {
  if (!canUseSupabase()) throw new Error("Supabase required for sharing");

  // Check if token already exists
  const existing = assertSupabase(
    await supabase
      .from("swim_sessions_catalog")
      .select("share_token")
      .eq("id", catalogId)
      .single()
  );
  if (existing?.share_token) return existing.share_token as string;

  // Generate new token via RPC
  return assertSupabase(await supabase.rpc("generate_swim_share_token", {
    p_catalog_id: catalogId,
  })) as string;
}

/**
 * Fetch a shared swim session by its public token.
 * Works without authentication (uses anon key).
 */
export async function getSharedSession(
  token: string,
): Promise<{ name: string; description: string | null; items: SwimSessionItem[] } | null> {
  // Use supabase directly (anon key, no auth needed)
  const { data, error } = await supabase
    .from("swim_sessions_catalog")
    .select("name, description, swim_session_items(*)")
    .eq("share_token", token)
    .single();
  if (error || !data) return null;

  const items: SwimSessionItem[] = Array.isArray((data as any).swim_session_items)
    ? (data as any).swim_session_items
        .sort((a: any, b: any) => (a.ordre ?? 0) - (b.ordre ?? 0))
        .map((item: any, index: number) => ({
          id: safeOptionalInt(item.id) ?? undefined,
          catalog_id: safeOptionalInt(item.catalog_id) ?? undefined,
          ordre: safeOptionalInt(item.ordre) ?? index,
          label: item.label ?? null,
          distance: safeOptionalInt(item.distance) ?? null,
          duration: safeOptionalInt(item.duration) ?? null,
          intensity: item.intensity ?? null,
          notes: item.notes ?? null,
          raw_payload: parseRawPayload(item.raw_payload),
        }))
    : [];

  return {
    name: String(data.name || ""),
    description: (data as any).description ?? null,
    items,
  };
}

export async function getSwimSessionsPaginated(opts: {
  offset?: number;
  limit?: number;
  search?: string;
  folder?: string;
} = {}): Promise<{ sessions: SwimSessionTemplate[]; total: number }> {
  if (!canUseSupabase()) {
    const all = await getSwimCatalog();
    return { sessions: all, total: all.length };
  }
  const data = assertSupabase(await supabase.rpc('get_swim_catalog_paginated', {
    p_offset: opts.offset ?? 0,
    p_limit: opts.limit ?? 20,
    p_search: opts.search ?? null,
    p_folder: opts.folder ?? null,
  }));
  const rawSessions = data?.sessions ?? [];
  const sessions: SwimSessionTemplate[] = rawSessions.map((catalog: any) => ({
    id: safeInt(catalog.id, Date.now()),
    name: String(catalog.name || ""),
    description: catalog.description ?? null,
    created_by: safeOptionalInt(catalog.created_by) ?? null,
    created_at: catalog.created_at ?? null,
    updated_at: catalog.updated_at ?? null,
    folder: catalog.folder ?? null,
    is_archived: catalog.is_archived ?? false,
    items: Array.isArray(catalog.items)
      ? catalog.items
          .sort((a: any, b: any) => (a.ordre ?? 0) - (b.ordre ?? 0))
          .map((item: any, index: number) => ({
            id: safeOptionalInt(item.id) ?? undefined,
            catalog_id: safeOptionalInt(item.catalog_id) ?? undefined,
            ordre: safeOptionalInt(item.ordre) ?? index,
            label: item.label ?? null,
            distance: safeOptionalInt(item.distance) ?? null,
            duration: safeOptionalInt(item.duration) ?? null,
            intensity: item.intensity ?? null,
            notes: item.notes ?? null,
            raw_payload: parseRawPayload(item.raw_payload),
          }))
      : [],
  }));
  return { sessions, total: data?.total ?? 0 };
}

// ---------------------------------------------------------------------------
// Swim catalog folders
// ---------------------------------------------------------------------------

export async function getSwimCatalogFolders(): Promise<SwimCatalogFolder[]> {
  if (!canUseSupabase()) return [];
  const data = assertSupabase(
    await supabase
      .from("swim_catalog_folders")
      .select("*")
      .order("path")
  );
  return (data ?? []).map((f: any) => ({
    id: f.id,
    path: f.path,
    created_by: f.created_by,
    created_at: f.created_at,
  }));
}

export async function createSwimCatalogFolder(path: string): Promise<SwimCatalogFolder> {
  if (!canUseSupabase()) throw new Error("Supabase required");
  const data = assertSupabase(
    await supabase
      .from("swim_catalog_folders")
      .upsert({ path }, { onConflict: "path" })
      .select()
      .single()
  )!;
  return { id: data.id, path: data.path, created_by: data.created_by, created_at: data.created_at };
}

export async function renameSwimCatalogFolder(oldPath: string, newPath: string): Promise<void> {
  if (!canUseSupabase()) throw new Error("Supabase required");
  // Rename the folder itself
  const { error: folderErr } = await supabase
    .from("swim_catalog_folders")
    .update({ path: newPath })
    .eq("path", oldPath);
  if (folderErr) throw new Error(folderErr.message);

  // Fetch sub-folders + sessions in parallel (independent lookups)
  const [subFoldersRes, sessionsRes] = await Promise.all([
    supabase
      .from("swim_catalog_folders")
      .select("id, path")
      .like("path", `${oldPath}/%`),
    supabase
      .from("swim_sessions_catalog")
      .select("id, folder")
      .or(`folder.eq.${oldPath},folder.like.${oldPath}/%`),
  ]);

  // Parallelise updates — each row is independent
  await Promise.all((subFoldersRes.data ?? []).map((sf) => {
    const updated = newPath + sf.path.slice(oldPath.length);
    return supabase.from("swim_catalog_folders").update({ path: updated }).eq("id", sf.id);
  }));
  await Promise.all((sessionsRes.data ?? []).map((s) => {
    const updated = s.folder === oldPath ? newPath : newPath + s.folder.slice(oldPath.length);
    return supabase.from("swim_sessions_catalog").update({ folder: updated }).eq("id", s.id);
  }));
}

export async function deleteSwimCatalogFolder(path: string): Promise<void> {
  if (!canUseSupabase()) throw new Error("Supabase required");
  // Move sessions in this folder (and sub-folders) to root
  const { error: moveErr } = await supabase
    .from("swim_sessions_catalog")
    .update({ folder: null })
    .or(`folder.eq.${path},folder.like.${path}/%`);
  if (moveErr) throw new Error(moveErr.message);

  // Delete sub-folders then the folder itself
  await supabase.from("swim_catalog_folders").delete().like("path", `${path}/%`);
  assertSupabase(await supabase.from("swim_catalog_folders").delete().eq("path", path));
}
