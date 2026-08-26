import { prisma } from '../database/client';
import { logger } from '../utils/logger';

export class EconomyService {
  /**
   * Adds gold to a character's account with auditing.
   */
  static async addGold(
    characterId: string,
    amount: number,
    type: string,
    details?: string
  ): Promise<number> {
    if (amount <= 0) {
      throw new Error('Amount must be positive');
    }

    return await prisma.$transaction(async (tx) => {
      const character = await tx.character.findUnique({
        where: { id: characterId },
        select: { gold: true }
      });

      if (!character) {
        throw new Error('Character not found');
      }

      const updated = await tx.character.update({
        where: { id: characterId },
        data: { gold: { increment: amount } },
        select: { gold: true }
      });

      await tx.transactionLog.create({
        data: {
          characterId,
          type,
          goldDelta: amount,
          details: details || `Added ${amount} gold`
        }
      });

      logger.info(`Added ${amount} gold to ${characterId} (${type})`);
      return updated.gold;
    });
  }

  /**
   * Removes gold from a character's account with auditing.
   * Prevents balance from dropping below 0.
   */
  static async removeGold(
    characterId: string,
    amount: number,
    type: string,
    details?: string
  ): Promise<number> {
    if (amount <= 0) {
      throw new Error('Amount must be positive');
    }

    return await prisma.$transaction(async (tx) => {
      const character = await tx.character.findUnique({
        where: { id: characterId },
        select: { gold: true }
      });

      if (!character) {
        throw new Error('Character not found');
      }

      if (character.gold < amount) {
        throw new Error(`Insufficient gold. Balance: ${character.gold}, Required: ${amount}`);
      }

      const updated = await tx.character.update({
        where: { id: characterId },
        data: { gold: { decrement: amount } },
        select: { gold: true }
      });

      await tx.transactionLog.create({
        data: {
          characterId,
          type,
          goldDelta: -amount,
          details: details || `Removed ${amount} gold`
        }
      });

      logger.info(`Removed ${amount} gold from ${characterId} (${type})`);
      return updated.gold;
    });
  }

  /**
   * Transfers gold between two characters atomically.
   */
  static async transferGold(
    fromId: string,
    toId: string,
    amount: number,
    type: string
  ): Promise<{ fromGold: number; toGold: number }> {
    if (amount <= 0) {
      throw new Error('Amount must be positive');
    }
    if (fromId === toId) {
      throw new Error('Cannot transfer gold to yourself');
    }

    return await prisma.$transaction(async (tx) => {
      const sender = await tx.character.findUnique({
        where: { id: fromId },
        select: { gold: true }
      });

      const receiver = await tx.character.findUnique({
        where: { id: toId },
        select: { gold: true }
      });

      if (!sender || !receiver) {
        throw new Error('One or both characters do not exist');
      }

      if (sender.gold < amount) {
        throw new Error(`Insufficient gold. Balance: ${sender.gold}, Required: ${amount}`);
      }

      const updatedSender = await tx.character.update({
        where: { id: fromId },
        data: { gold: { decrement: amount } },
        select: { gold: true }
      });

      const updatedReceiver = await tx.character.update({
        where: { id: toId },
        data: { gold: { increment: amount } },
        select: { gold: true }
      });

      // Log for sender
      await tx.transactionLog.create({
        data: {
          characterId: fromId,
          type,
          goldDelta: -amount,
          details: `Transferred to ${toId}`
        }
      });

      // Log for receiver
      await tx.transactionLog.create({
        data: {
          characterId: toId,
          type,
          goldDelta: amount,
          details: `Transferred from ${fromId}`
        }
      });

      logger.info(`Transferred ${amount} gold from ${fromId} to ${toId}`);
      return {
        fromGold: updatedSender.gold,
        toGold: updatedReceiver.gold
      };
    });
  }
}
