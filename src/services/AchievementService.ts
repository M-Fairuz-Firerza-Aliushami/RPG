import { prisma } from '../database/client';
import { GAME_CONFIG, AchievementDefinition } from '../config/gameConfig';
import { logger } from '../utils/logger';

export class AchievementService {
  /**
   * Scans a character's stats and unlocks achievements they qualify for.
   */
  static async checkAchievements(characterId: string): Promise<AchievementDefinition[]> {
    const char = await prisma.character.findUnique({
      where: { id: characterId },
      include: {
        achievements: true,
        discoveries: true,
        quests: { where: { status: 'COMPLETED' } }
      }
    });

    if (!char) return [];

    const unlockedIds = new Set(char.achievements.map((a) => a.achievementId));
    const newlyUnlocked: AchievementDefinition[] = [];

    // Evaluate metrics
    const goldCount = char.gold;
    const discoveryCount = char.discoveries.length;
    const completedQuestsCount = char.quests.length;

    // Retrieve active listing/transaction counts if necessary, otherwise use these core indicators
    for (const ach of GAME_CONFIG.achievements) {
      if (unlockedIds.has(ach.id)) continue;

      let qualifies = false;

      switch (ach.category) {
        case 'WEALTH':
          qualifies = goldCount >= ach.targetValue;
          break;
        case 'EXPLORATION':
          qualifies = discoveryCount >= ach.targetValue;
          break;
        case 'QUESTS':
          qualifies = completedQuestsCount >= ach.targetValue;
          break;
        default:
          break;
      }

      if (qualifies) {
        // Unlock it!
        try {
          await prisma.$transaction(async (tx) => {
            // Re-verify inside transaction to avoid race conditions
            const alreadyUnlocked = await tx.playerAchievement.findUnique({
              where: {
                characterId_achievementId: {
                  characterId,
                  achievementId: ach.id
                }
              }
            });

            if (!alreadyUnlocked) {
              await tx.playerAchievement.create({
                data: {
                  characterId,
                  achievementId: ach.id
                }
              });

              // Give reward gold
              await tx.character.update({
                where: { id: characterId },
                data: { gold: { increment: ach.rewardGold } }
              });

              await tx.transactionLog.create({
                data: {
                  characterId,
                  type: 'QUEST_REWARD', // category grouping
                  goldDelta: ach.rewardGold,
                  details: `Unlocked achievement: ${ach.name}`
                }
              });

              newlyUnlocked.push(ach);
              logger.info(`Achievement unlocked: ${ach.id} for character ${characterId}`);
            }
          });
        } catch (err) {
          logger.error(`Failed to unlock achievement ${ach.id} for char ${characterId}:`, err);
        }
      }
    }

    return newlyUnlocked;
  }
}
