/**
 * API Temporary Groups - CRUD for coach temporary groups (stages)
 */

import { supabase, canUseSupabase, safeInt, assertSupabase } from "./client";
import type { TemporaryGroupSummary, TemporaryGroupDetail, TemporaryGroupMember } from "./types";

export async function getTemporaryGroups(): Promise<TemporaryGroupSummary[]> {
  if (!canUseSupabase()) return [];
  const data = assertSupabase(
    await supabase
      .from("groups")
      .select("id, name, is_active, parent_group_id, created_by, created_at")
      .eq("is_temporary", true)
      .is("parent_group_id", null)
      .order("created_at", { ascending: false })
  );
  if (!data?.length) return [];

  const parentIds = data.map((g: any) => g.id);
  const { data: subgroups } = await supabase
    .from("groups")
    .select("parent_group_id")
    .eq("is_temporary", true)
    .in("parent_group_id", parentIds);

  const subgroupCounts = new Map<number, number>();
  (subgroups ?? []).forEach((sg: any) => {
    subgroupCounts.set(sg.parent_group_id, (subgroupCounts.get(sg.parent_group_id) ?? 0) + 1);
  });

  const { data: members } = await supabase
    .from("group_members")
    .select("group_id")
    .in("group_id", parentIds);

  const memberCounts = new Map<number, number>();
  (members ?? []).forEach((m: any) => {
    memberCounts.set(m.group_id, (memberCounts.get(m.group_id) ?? 0) + 1);
  });

  return data.map((g: any) => ({
    id: safeInt(g.id, 0),
    name: g.name,
    is_active: g.is_active ?? true,
    parent_group_id: g.parent_group_id ?? null,
    member_count: memberCounts.get(g.id) ?? 0,
    subgroup_count: subgroupCounts.get(g.id) ?? 0,
    created_at: g.created_at ?? "",
    created_by: g.created_by ?? 0,
  }));
}

export async function getTemporaryGroupDetail(groupId: number): Promise<TemporaryGroupDetail | null> {
  if (!canUseSupabase()) return null;

  const { data: group, error } = await supabase
    .from("groups")
    .select("id, name, is_active")
    .eq("id", groupId)
    .eq("is_temporary", true)
    .single();
  if (error || !group) return null;

  const { data: membersRaw } = await supabase
    .from("group_members")
    .select("user_id, users!inner(display_name)")
    .eq("group_id", groupId);

  const memberUserIds = (membersRaw ?? []).map((m: any) => m.user_id);
  const { data: permanentMemberships } = memberUserIds.length
    ? await supabase
        .from("group_members")
        .select("user_id, group_id, groups!inner(name, is_temporary)")
        .in("user_id", memberUserIds)
        .eq("groups.is_temporary", false)
    : { data: [] };

  const permGroupByUser = new Map<number, string>();
  (permanentMemberships ?? []).forEach((pm: any) => {
    if (!permGroupByUser.has(pm.user_id)) {
      permGroupByUser.set(pm.user_id, (pm.groups as any)?.name ?? null);
    }
  });

  const members: TemporaryGroupMember[] = (membersRaw ?? []).map((m: any) => ({
    user_id: m.user_id,
    display_name: (m.users as any)?.display_name ?? "",
    permanent_group_label: permGroupByUser.get(m.user_id) ?? null,
  }));

  const { data: subgroupsRaw } = await supabase
    .from("groups")
    .select("id, name")
    .eq("parent_group_id", groupId)
    .eq("is_temporary", true);

  const subgroups = await Promise.all(
    (subgroupsRaw ?? []).map(async (sg: any) => {
      const { data: sgMembers } = await supabase
        .from("group_members")
        .select("user_id, users!inner(display_name)")
        .eq("group_id", sg.id);
      return {
        id: sg.id,
        name: sg.name,
        members: (sgMembers ?? []).map((m: any) => ({
          user_id: m.user_id,
          display_name: (m.users as any)?.display_name ?? "",
        })),
      };
    }),
  );

  return { id: group.id, name: group.name, is_active: group.is_active, members, subgroups };
}

export async function createTemporaryGroup(data: {
  name: string;
  member_user_ids: number[];
  parent_group_id?: number | null;
}): Promise<{ id: number }> {
  if (!canUseSupabase()) throw new Error("Supabase required");

  if (data.member_user_ids.length > 0) {
    const { data: existing } = await supabase
      .from("group_members")
      .select("user_id, group_id, groups!inner(is_temporary, is_active, parent_group_id)")
      .in("user_id", data.member_user_ids)
      .eq("groups.is_temporary", true)
      .eq("groups.is_active", true);

    const conflicts = (existing ?? []).filter((row: any) => {
      const g = row.groups as any;
      if (data.parent_group_id && (row.group_id === data.parent_group_id || g.parent_group_id === data.parent_group_id)) {
        return false;
      }
      return true;
    });

    if (conflicts.length > 0) {
      const conflictUserIds = [...new Set(conflicts.map((c: any) => c.user_id))];
      throw new Error(`Nageurs déjà dans un groupe temporaire actif: IDs ${conflictUserIds.join(", ")}`);
    }
  }

  if (data.parent_group_id && data.member_user_ids.length > 0) {
    const { data: parentMembers } = await supabase
      .from("group_members")
      .select("user_id")
      .eq("group_id", data.parent_group_id);
    const parentUserIds = new Set((parentMembers ?? []).map((m: any) => m.user_id));
    const invalid = data.member_user_ids.filter((uid) => !parentUserIds.has(uid));
    if (invalid.length > 0) {
      throw new Error(`Nageurs non membres du groupe parent: IDs ${invalid.join(", ")}`);
    }
  }

  const created = assertSupabase(
    await supabase
      .from("groups")
      .insert({
        name: data.name.trim(),
        is_temporary: true,
        is_active: true,
        parent_group_id: data.parent_group_id ?? null,
      })
      .select("id")
      .single()
  )!;

  const groupId = created.id;

  if (data.member_user_ids.length > 0) {
    const memberRows = data.member_user_ids.map((uid) => ({
      group_id: groupId,
      user_id: uid,
    }));
    const { error: memberError } = await supabase.from("group_members").insert(memberRows);
    if (memberError) throw new Error(memberError.message);
  }

  return { id: groupId };
}

export async function addTemporaryGroupMembers(groupId: number, userIds: number[]): Promise<void> {
  if (!canUseSupabase()) throw new Error("Supabase required");
  if (!userIds.length) return;

  const { data: existing } = await supabase
    .from("group_members")
    .select("user_id, group_id, groups!inner(is_temporary, is_active, parent_group_id)")
    .in("user_id", userIds)
    .eq("groups.is_temporary", true)
    .eq("groups.is_active", true);

  const conflicts = (existing ?? []).filter((row: any) => {
    if (row.group_id === groupId) return false;
    const g = row.groups as any;
    if (g.parent_group_id === groupId) return false;
    return true;
  });

  if (conflicts.length > 0) {
    const conflictUserIds = [...new Set(conflicts.map((c: any) => c.user_id))];
    throw new Error(`Nageurs déjà dans un groupe temporaire actif: IDs ${conflictUserIds.join(", ")}`);
  }

  const rows = userIds.map((uid) => ({ group_id: groupId, user_id: uid }));
  assertSupabase(await supabase.from("group_members").insert(rows));
}

export async function removeTemporaryGroupMember(groupId: number, userId: number): Promise<void> {
  if (!canUseSupabase()) throw new Error("Supabase required");

  const { data: subgroups } = await supabase
    .from("groups")
    .select("id")
    .eq("parent_group_id", groupId)
    .eq("is_temporary", true);

  const groupIds = [groupId, ...(subgroups ?? []).map((sg: any) => sg.id)];

  assertSupabase(
    await supabase
      .from("group_members")
      .delete()
      .eq("user_id", userId)
      .in("group_id", groupIds)
  );
}

export async function deactivateTemporaryGroup(groupId: number): Promise<void> {
  if (!canUseSupabase()) throw new Error("Supabase required");
  assertSupabase(
    await supabase
      .from("groups")
      .update({ is_active: false })
      .or(`id.eq.${groupId},parent_group_id.eq.${groupId}`)
      .eq("is_temporary", true)
  );
}

export async function reactivateTemporaryGroup(groupId: number): Promise<void> {
  if (!canUseSupabase()) throw new Error("Supabase required");

  const { data: members } = await supabase
    .from("group_members")
    .select("user_id")
    .eq("group_id", groupId);
  const memberIds = (members ?? []).map((m: any) => m.user_id);

  if (memberIds.length > 0) {
    const { data: conflicts } = await supabase
      .from("group_members")
      .select("user_id, groups!inner(is_temporary, is_active)")
      .in("user_id", memberIds)
      .eq("groups.is_temporary", true)
      .eq("groups.is_active", true);

    if (conflicts && conflicts.length > 0) {
      throw new Error("Certains nageurs sont déjà dans un autre groupe temporaire actif.");
    }
  }

  assertSupabase(
    await supabase
      .from("groups")
      .update({ is_active: true })
      .or(`id.eq.${groupId},parent_group_id.eq.${groupId}`)
      .eq("is_temporary", true)
  );
}

export async function deleteTemporaryGroup(groupId: number): Promise<void> {
  if (!canUseSupabase()) throw new Error("Supabase required");

  const { data: group } = await supabase
    .from("groups")
    .select("is_active")
    .eq("id", groupId)
    .single();

  if (group?.is_active) {
    throw new Error("Impossible de supprimer un groupe temporaire actif. Désactivez-le d'abord.");
  }

  await supabase
    .from("groups")
    .delete()
    .eq("parent_group_id", groupId)
    .eq("is_temporary", true);

  assertSupabase(
    await supabase
      .from("groups")
      .delete()
      .eq("id", groupId)
      .eq("is_temporary", true)
  );
}
