/**
 * Badge definitions and checking logic for the achievement/gamification system.
 */

export interface BadgeDefinition {
  key: string;
  type: 'streak' | 'pr' | 'wellness' | 'attendance' | 'competition';
  label: string;
  description: string;
  icon: string; // emoji
  palier: number; // target threshold
}

export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  // Streak badges
  { key: 'streak_5', type: 'streak', label: 'Flamme 5j', description: '5 jours consecutifs de presence', icon: '\u{1F525}', palier: 5 },
  { key: 'streak_10', type: 'streak', label: 'Flamme 10j', description: '10 jours consecutifs', icon: '\u{1F525}', palier: 10 },
  { key: 'streak_20', type: 'streak', label: 'Flamme 20j', description: '20 jours consecutifs', icon: '\u{1F525}', palier: 20 },
  { key: 'streak_50', type: 'streak', label: 'Flamme 50j', description: '50 jours consecutifs', icon: '\u{1F525}', palier: 50 },
  // PR badges
  { key: 'pr_5', type: 'pr', label: 'PR Hunter', description: '5 records muscu battus', icon: '\u{1F3C6}', palier: 5 },
  { key: 'pr_15', type: 'pr', label: 'PR Master', description: '15 records muscu battus', icon: '\u{1F3C6}', palier: 15 },
  // Wellness badges
  { key: 'wellness_7', type: 'wellness', label: 'Wellness 7j', description: '7 jours consecutifs de wellness', icon: '\u{1F49A}', palier: 7 },
  { key: 'wellness_14', type: 'wellness', label: 'Wellness 14j', description: '14 jours consecutifs', icon: '\u{1F49A}', palier: 14 },
  { key: 'wellness_30', type: 'wellness', label: 'Wellness 30j', description: '30 jours consecutifs', icon: '\u{1F49A}', palier: 30 },
  // Attendance (strength sessions) badges
  { key: 'iron_10', type: 'attendance', label: 'Iron Will', description: '10 seances muscu completees', icon: '\u{1F4AA}', palier: 10 },
  { key: 'iron_25', type: 'attendance', label: 'Iron Will II', description: '25 seances muscu', icon: '\u{1F4AA}', palier: 25 },
  { key: 'iron_50', type: 'attendance', label: 'Iron Will III', description: '50 seances muscu', icon: '\u{1F4AA}', palier: 50 },
  // Competition badges
  { key: 'comp_3', type: 'competition', label: 'Competiteur', description: '3 competitions', icon: '\u{1F947}', palier: 3 },
  { key: 'comp_5', type: 'competition', label: 'Competiteur II', description: '5 competitions', icon: '\u{1F947}', palier: 5 },
];

/** Context needed to evaluate badge conditions. */
export interface BadgeContext {
  currentStreak: number;
  prCount: number;
  wellnessStreak: number;
  strengthSessionCount: number;
  competitionCount: number;
}

function getThresholdForType(type: BadgeDefinition['type'], context: BadgeContext): number {
  switch (type) {
    case 'streak': return context.currentStreak;
    case 'pr': return context.prCount;
    case 'wellness': return context.wellnessStreak;
    case 'attendance': return context.strengthSessionCount;
    case 'competition': return context.competitionCount;
  }
}

/**
 * Return badge definitions that should be newly unlocked given the current
 * context and a list of already-unlocked badge keys.
 */
export function getNewBadges(
  context: BadgeContext,
  alreadyUnlocked: string[],
): BadgeDefinition[] {
  const unlocked = new Set(alreadyUnlocked);
  return BADGE_DEFINITIONS.filter((badge) => {
    if (unlocked.has(badge.key)) return false;
    const value = getThresholdForType(badge.type, context);
    return value >= badge.palier;
  });
}
