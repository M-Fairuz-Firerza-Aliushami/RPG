import { prisma } from '../database/client';
import { GAME_CONFIG, QuestDefinition } from '../config/gameConfig';
import { CharacterService } from './CharacterService';
import { InventoryService } from './InventoryService';
import { logger } from '../utils/logger';

export class QuestService {
  static getQuestDefinition(questId: string): QuestDefinition {
    const quest = GAME_CONFIG.quests.find((q) => q.id === questId);
    if (!quest) {
      throw new Error(`Quest ${questId} not found`);
    }
    return quest;
  }

  /**
   * Starts a quest for a character.
   */
  static async startQuest(characterId: string, questId: string): Promise<void> {
    const quest = this.getQuestDefinition(questId);
    const char = await CharacterService.getCharacter(characterId);

    if (char.level < quest.requiredLevel) {
      throw new Error(`Requires level ${quest.requiredLevel} to start this quest.`);
    }

    if (quest.requiredQuestId) {
      const prevQuest = await prisma.playerQuest.findUnique({
        where: {
          characterId_questId: {
            characterId,
            questId: quest.requiredQuestId
          }
        }
      });
      if (!prevQuest || prevQuest.status !== 'COMPLETED') {
        const reqName = this.getQuestDefinition(quest.requiredQuestId).name;
        throw new Error(`You must complete "${reqName}" before starting this quest.`);
      }
    }

    const existing = await prisma.playerQuest.findUnique({
      where: {
        characterId_questId: {
          characterId,
          questId
        }
      }
    });

    if (existing) {
      throw new Error(`Quest is already ${existing.status.toLowerCase()}.`);
    }

    // Initialize quest step 0
    await prisma.playerQuest.create({
      data: {
        characterId,
        questId,
        status: 'ACTIVE',
        currentStep: 0,
        progressData: JSON.stringify({ count: 0 })
      }
    });

    logger.info(`Quest started: ${questId} for character ${characterId}`);
  }

  /**
   * Advances an active quest step, applying branching options if applicable.
   */
  static async advanceQuestStep(
    characterId: string,
    questId: string,
    choiceIndex?: number
  ): Promise<{ nextStepDescription: string; completed: boolean; dialog?: string }> {
    const quest = this.getQuestDefinition(questId);

    return await prisma.$transaction(async (tx) => {
      const playerQuest = await tx.playerQuest.findUnique({
        where: {
          characterId_questId: { characterId, questId }
        }
      });

      if (!playerQuest || playerQuest.status !== 'ACTIVE') {
        throw new Error('Quest is not active.');
      }

      const currentStepDef = quest.steps[playerQuest.currentStep];
      let nextStepIndex = playerQuest.currentStep + 1;
      let dialog: string | undefined;

      // Handle Branching Choices
      if (currentStepDef.textChoiceBranching) {
        if (choiceIndex === undefined || choiceIndex < 0 || choiceIndex >= currentStepDef.textChoiceBranching.choices.length) {
          throw new Error('You must provide a valid choice index for this branching step.');
        }

        const choice = currentStepDef.textChoiceBranching.choices[choiceIndex];
        nextStepIndex = choice.branchToStep;
        dialog = choice.dialog;
      }

      // Check if quest completed (out of steps or step points to terminal step)
      const isCompleted = nextStepIndex >= quest.steps.length;

      if (isCompleted) {
        // Complete the quest and award rewards
        await tx.playerQuest.update({
          where: { id: playerQuest.id },
          data: {
            status: 'COMPLETED',
            currentStep: nextStepIndex
          }
        });

        // Award rewards
        // Gold
        await tx.character.update({
          where: { id: characterId },
          data: {
            gold: { increment: quest.rewards.gold },
            reputation: { increment: quest.rewards.reputation }
          }
        });

        // Log transaction
        await tx.transactionLog.create({
          data: {
            characterId,
            type: 'QUEST_REWARD',
            goldDelta: quest.rewards.gold,
            details: `Completed quest ${quest.name}`
          }
        });

        // XP
        const char = await tx.character.findUnique({ where: { id: characterId } });
        let currentXp = (char?.xp || 0) + quest.rewards.xp;
        let lvl = char?.level || 1;
        while (true) {
          const needed = GAME_CONFIG.xpFormula(lvl);
          if (currentXp >= needed) {
            currentXp -= needed;
            lvl += 1;
          } else {
            break;
          }
        }
        await tx.character.update({
          where: { id: characterId },
          data: { level: lvl, xp: currentXp }
        });

        // Items reward
        if (quest.rewards.items) {
          for (const rewardItem of quest.rewards.items) {
            // Find existing stack or create
            const existingStack = await tx.inventoryItem.findFirst({
              where: { characterId, itemId: rewardItem.itemId, equipped: false }
            });

            if (existingStack) {
              await tx.inventoryItem.update({
                where: { id: existingStack.id },
                data: { quantity: { increment: rewardItem.quantity } }
              });
            } else {
              await tx.inventoryItem.create({
                data: {
                  characterId,
                  itemId: rewardItem.itemId,
                  quantity: rewardItem.quantity,
                  equipped: false
                }
              });
            }
          }
        }

        logger.info(`Quest completed: ${questId} for character ${characterId}`);
        return {
          nextStepDescription: 'Quest Completed!',
          completed: true,
          dialog
        };
      } else {
        // Advance to next step
        const nextStepDef = quest.steps[nextStepIndex];
        await tx.playerQuest.update({
          where: { id: playerQuest.id },
          data: {
            currentStep: nextStepIndex,
            progressData: JSON.stringify({ count: 0 })
          }
        });

        logger.info(`Quest advanced: ${questId} to step ${nextStepIndex} for character ${characterId}`);
        return {
          nextStepDescription: nextStepDef.description,
          completed: false,
          dialog
        };
      }
    });
  }

  /**
   * Hooks into player activity (explore, combat, gather) to progress active quests.
   */
  static async checkQuestProgress(
    characterId: string,
    actionType: 'EXPLORE' | 'GATHER' | 'COMBAT' | 'DELIVER',
    targetId: string,
    amount: number = 1
  ): Promise<{ questId: string; announcement: string }[]> {
    const activeQuests = await prisma.playerQuest.findMany({
      where: { characterId, status: 'ACTIVE' }
    });

    const notifications: { questId: string; announcement: string }[] = [];

    for (const pq of activeQuests) {
      try {
        const questDef = this.getQuestDefinition(pq.questId);
        const stepDef = questDef.steps[pq.currentStep];

        if (stepDef.type !== actionType) continue;

        // Check if targets match
        if (stepDef.targetId && stepDef.targetId.toLowerCase() !== targetId.toLowerCase()) continue;

        // Progress update
        const progress = JSON.parse(pq.progressData || '{"count":0}');

        if (actionType === 'GATHER' || actionType === 'DELIVER') {
          // Gather/Deliver items requires checking inventory
          const requiredCount = stepDef.targetCount || 1;
          const hasEnough = await InventoryService.hasItem(characterId, targetId, requiredCount);

          if (hasEnough) {
            // Remove items
            await InventoryService.removeItem(characterId, targetId, requiredCount);
            // Advance
            const adv = await this.advanceQuestStep(characterId, pq.questId);
            notifications.push({
              questId: pq.questId,
              announcement: `📜 **Quest "${questDef.name}" Updated!**\nDelivered ${requiredCount}x ${GAME_CONFIG.items[targetId]?.name || targetId}.\nNext: ${adv.nextStepDescription}`
            });
          }
        } else if (actionType === 'COMBAT') {
          // Kill target enemy
          const currentCount = progress.count + amount;
          const targetCount = stepDef.targetCount || 1;

          if (currentCount >= targetCount) {
            const adv = await this.advanceQuestStep(characterId, pq.questId);
            notifications.push({
              questId: pq.questId,
              announcement: `📜 **Quest "${questDef.name}" Updated!**\nDefeated ${targetCount}/${targetCount} ${GAME_CONFIG.enemies[targetId]?.name || targetId}.\nNext: ${adv.nextStepDescription}`
            });
          } else {
            // Update counts in db
            await prisma.playerQuest.update({
              where: { id: pq.id },
              data: {
                progressData: JSON.stringify({ count: currentCount })
              }
            });
            notifications.push({
              questId: pq.questId,
              announcement: `📜 **Quest Progress:** ${questDef.name}\nDefeated ${currentCount}/${targetCount} ${GAME_CONFIG.enemies[targetId]?.name || targetId}.`
            });
          }
        } else if (actionType === 'EXPLORE') {
          // Explore region
          const adv = await this.advanceQuestStep(characterId, pq.questId);
          notifications.push({
            questId: pq.questId,
            announcement: `📜 **Quest "${questDef.name}" Updated!**\nExplored ${GAME_CONFIG.regions[targetId]?.name || targetId}.\nNext: ${adv.nextStepDescription}`
          });
        }
      } catch (err) {
        logger.error(`Error checking quest progress for char ${characterId}, quest ${pq.questId}:`, err);
      }
    }

    return notifications;
  }
}
