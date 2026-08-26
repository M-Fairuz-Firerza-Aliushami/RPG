import { prisma } from '../database/client';
import { GAME_CONFIG } from '../config/gameConfig';
import { logger } from '../utils/logger';

export class WorldEventService {
  /**
   * Retrieves the currently active server-wide event.
   */
  static async getActiveEvent() {
    return await prisma.worldEvent.findFirst({
      where: { status: 'ACTIVE' }
    });
  }

  /**
   * Starts a new server-wide event.
   */
  static async startEvent(type: string, objective: number = 10000) {
    // End any currently active events
    await prisma.worldEvent.updateMany({
      where: { status: 'ACTIVE' },
      data: {
        status: 'COMPLETED',
        endedAt: new Date()
      }
    });

    const newEvent = await prisma.worldEvent.create({
      data: {
        type: type.toUpperCase(),
        status: 'ACTIVE',
        progress: 0,
        objective
      }
    });

    logger.info(`World Event started: ${newEvent.type} with objective ${objective}`);
    return newEvent;
  }

  /**
   * Contributes resources from player inventory towards the global objective.
   */
  static async contribute(
    characterId: string,
    itemId: string,
    quantity: number
  ): Promise<{ event: any; completed: boolean }> {
    if (quantity <= 0) throw new Error('Quantity must be greater than 0');

    const activeEvent = await this.getActiveEvent();
    if (!activeEvent) {
      throw new Error('There is no active world event to contribute to.');
    }

    // Determine target contribution item for active event
    // Volcanic Season -> Fire Crystals
    // Merchants Festival -> Copper Bars
    // Eclipse -> Star Dust
    let requiredItem = 'fire_crystal';
    if (activeEvent.type === 'MERCHANTS_FESTIVAL') {
      requiredItem = 'copper_bar';
    } else if (activeEvent.type === 'ECLIPSE') {
      requiredItem = 'star_dust';
    }

    if (itemId !== requiredItem) {
      const name = GAME_CONFIG.items[requiredItem]?.name || requiredItem;
      throw new Error(`The current world event "${activeEvent.type}" only accepts contributions of **${name}**.`);
    }

    return await prisma.$transaction(async (tx) => {
      // Consume item from player
      const items = await tx.inventoryItem.findMany({
        where: { characterId, itemId, equipped: false }
      });

      const totalOwned = items.reduce((sum, item) => sum + item.quantity, 0);
      if (totalOwned < quantity) {
        throw new Error(`You do not have enough ${GAME_CONFIG.items[itemId]?.name || itemId} in your inventory. Owned: ${totalOwned}`);
      }

      let remaining = quantity;
      for (const item of items) {
        if (remaining <= 0) break;
        if (item.quantity <= remaining) {
          remaining -= item.quantity;
          await tx.inventoryItem.delete({ where: { id: item.id } });
        } else {
          await tx.inventoryItem.update({
            where: { id: item.id },
            data: { quantity: { decrement: remaining } }
          });
          remaining = 0;
        }
      }

      // Update event progress
      const updatedEvent = await tx.worldEvent.update({
        where: { id: activeEvent.id },
        data: { progress: { increment: quantity } }
      });

      let completed = false;
      if (updatedEvent.progress >= updatedEvent.objective) {
        completed = true;
        await tx.worldEvent.update({
          where: { id: activeEvent.id },
          data: {
            status: 'COMPLETED',
            endedAt: new Date()
          }
        });
        logger.info(`World Event completed! ${updatedEvent.type}`);
      }

      // Award reputation to character for contributing
      const repGained = quantity * 2;
      await tx.character.update({
        where: { id: characterId },
        data: { reputation: { increment: repGained } }
      });

      logger.info(`Character ${characterId} contributed ${quantity}x ${itemId} to World Event ${activeEvent.id}`);
      return { event: updatedEvent, completed };
    });
  }

  /**
   * Resolves active multipliers/modifiers according to world weather/season status.
   */
  static async getModifiers() {
    const active = await this.getActiveEvent();
    if (!active) {
      return {
        explorationRewardMult: 1.0,
        marketFeeMult: 1.0,
        combatXpMult: 1.0,
        combatGoldMult: 1.0
      };
    }

    if (active.type === 'VOLCANIC_SEASON') {
      return {
        explorationRewardMult: 1.3, // 30% more materials
        marketFeeMult: 1.0,
        combatXpMult: 1.0,
        combatGoldMult: 1.1 // 10% more gold
      };
    }

    if (active.type === 'MERCHANTS_FESTIVAL') {
      return {
        explorationRewardMult: 1.0,
        marketFeeMult: 0.5, // 50% discount on market listing fees
        combatXpMult: 1.0,
        combatGoldMult: 1.0
      };
    }

    if (active.type === 'ECLIPSE') {
      return {
        explorationRewardMult: 1.0,
        marketFeeMult: 1.0,
        combatXpMult: 1.5, // 50% more XP
        combatGoldMult: 1.5 // 50% more Gold
      };
    }

    return {
      explorationRewardMult: 1.0,
      marketFeeMult: 1.0,
      combatXpMult: 1.0,
      combatGoldMult: 1.0
    };
  }
}
