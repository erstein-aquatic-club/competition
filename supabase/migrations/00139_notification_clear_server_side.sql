-- §161 — Nettoyage réel des notifications côté serveur
--
-- Avant ce patch : le bouton "Masquer toutes les notifications" de la vue
-- Messages nageur stockait uniquement un dismiss list dans localStorage. Sur
-- changement d'appareil / clear de cache / réinstall PWA / purge iOS Safari,
-- les notifications marquées read côté DB mais jamais supprimées redevenaient
-- visibles.
--
-- Ce patch introduit deux mécanismes côté serveur :
--  1. Une policy DELETE sur notification_targets pour que chaque user puisse
--     supprimer ses propres targets (target_user_id = app_user_id()).
--     Les coach/admin gardent un accès complet (maintenance).
--  2. Une table notification_dismissals pour les notifs de groupe, qu'un
--     membre ne peut pas supprimer sans affecter les autres membres.
--     Chaque user peut y masquer de façon persistante une notification
--     partagée, sans toucher à la row notification_targets du groupe.

-- 1) DELETE policy sur notification_targets
-- Les triggers crons/INSERT (§00045, §00070, §00074, §00090, §00104, §00109,
-- notifications_send) continueront à créer normalement les targets.
CREATE POLICY notification_targets_delete ON notification_targets FOR DELETE
    USING (
        target_user_id = app_user_id()
        OR app_user_role() IN ('admin', 'coach')
    );

-- 2) Table notification_dismissals
-- UNIQUE (user_id, notification_id) : au plus un dismissal par couple.
-- ON DELETE CASCADE sur notifications : si la notification est purgée par
-- §00085 cleanup_expired_notifications, on nettoie aussi l'entrée.
-- ON DELETE CASCADE sur users : suppression compte → dismissals purgés.
CREATE TABLE notification_dismissals (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    notification_id INTEGER NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
    dismissed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, notification_id)
);

CREATE INDEX idx_notification_dismissals_user
    ON notification_dismissals (user_id);
CREATE INDEX idx_notification_dismissals_notification
    ON notification_dismissals (notification_id);

ALTER TABLE notification_dismissals ENABLE ROW LEVEL SECURITY;

-- SELECT : user voit les siens ; coach/admin voient tout (debug/audit).
CREATE POLICY notification_dismissals_select ON notification_dismissals FOR SELECT
    USING (
        user_id = app_user_id()
        OR app_user_role() IN ('admin', 'coach')
    );

-- INSERT : user ne peut créer qu'un dismissal pour lui-même.
CREATE POLICY notification_dismissals_insert ON notification_dismissals FOR INSERT
    WITH CHECK (user_id = app_user_id());

-- DELETE : user peut retirer son propre dismissal (ré-affichage futur) ;
-- coach/admin peuvent nettoyer (maintenance).
CREATE POLICY notification_dismissals_delete ON notification_dismissals FOR DELETE
    USING (
        user_id = app_user_id()
        OR app_user_role() IN ('admin', 'coach')
    );

-- Pas de policy UPDATE : dismiss est immuable (soit présent, soit supprimé).
