-- Fix : restaurer l'accès SELECT anonyme à la table groups pour l'inscription.
--
-- Contexte : l'écran d'inscription (src/pages/Login.tsx → getGroups()) charge la
-- liste des groupes AVANT que l'utilisateur soit authentifié (rôle anon). La
-- migration 00126 avait re-scopé groups_select en `TO authenticated` en supposant
-- (à tort) que la table n'était jamais lue en anon. Résultat : la requête anon
-- renvoyait 0 ligne (RLS deny par défaut), le <Select> de groupe restait vide donc
-- `disabled` (groups.length === 0) et l'utilisatrice ne pouvait pas l'ouvrir.
--
-- Correctif : étendre la policy SELECT aux rôles anon + authenticated. Une seule
-- policy par action est conservée (pas de régression multiple_permissive_policies).
-- Les noms de groupes ne sont pas sensibles ; c'était le comportement d'origine
-- (pré-00126, USING (true) sans restriction de rôle = PUBLIC).

DROP POLICY IF EXISTS "groups_select" ON public.groups;

CREATE POLICY "groups_select"
  ON public.groups FOR SELECT
  TO anon, authenticated
  USING (true);
