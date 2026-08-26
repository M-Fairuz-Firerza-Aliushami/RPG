import { prisma } from '../database/client';
import { GAME_CONFIG, ItemDefinition } from '../config/gameConfig';
import { logger } from '../utils/logger';

export class InventoryService {
  /**
   * Resolves the static item definition from config.
   */
  static getItemDefinition(itemId: string): ItemDefinition {
    const def = GAME_CONFIG.items[itemId];
    if (!def) {
      throw new Error(`Item definition not found: ${itemId}`);
    }
    return def;
  }

  /**
   * Adds an item to the character's inventory, adhering to stack limits.
   */
  static async addItem(
    characterId: string,
    itemId: string,
    quantity: number,
    equipped: boolean = false,
    metadata?: Record<string, any>
  ): Promise<void> {
    if (quantity <= 0) return;
    const def = this.getItemDefinition(itemId);

    await prisma.$transaction(async (tx) => {
      // For non-stackable items (equipable weapons/armor usually), stack limit is 1.
      // If stack limit is 1, each instance must be unique, or we can just insert unique rows.
      // For simplicity, if equipped or stack limit is 1, we create a new item row.
      if (equipped || def.stackLimit === 1) {
        await tx.inventoryItem.create({
          data: {
            characterId,
            itemId,
            quantity,
            equipped,
            metadata: metadata ? JSON.stringify(metadata) : null
          }
        });
      } else {
        // Look for existing unequipped stack
        const existing = await tx.inventoryItem.findFirst({
          where: { characterId, itemId, equipped: false }
        });

        if (existing) {
          await tx.inventoryItem.update({
            where: { id: existing.id },
            data: { quantity: { increment: quantity } }
          });
        } else {
          await tx.inventoryItem.create({
            data: {
              characterId,
              itemId,
              quantity,
              equipped: false
            }
          });
        }
      }
      logger.info(`Added ${quantity}x ${itemId} to character ${characterId}`);
    });
  }

  /**
   * Removes an item from the character's inventory.
   */
  static async removeItem(
    characterId: string,
    itemId: string,
    quantity: number,
    equipped: boolean = false
  ): Promise<void> {
    if (quantity <= 0) return;

    await prisma.$transaction(async (tx) => {
      // Find rows containing the item
      const items = await tx.inventoryItem.findMany({
        where: { characterId, itemId, equipped },
        orderBy: { quantity: 'asc' } // Consume smaller stacks or custom items first
      });

      const totalOwned = items.reduce((acc, item) => acc + item.quantity, 0);
      if (totalOwned < quantity) {
        throw new Error(`Not enough ${itemId} in inventory. Owned: ${totalOwned}, Required: ${quantity}`);
      }

      let remainingToRemove = quantity;
      for (const item of items) {
        if (remainingToRemove <= 0) break;

        if (item.quantity <= remainingToRemove) {
          remainingToRemove -= item.quantity;
          await tx.inventoryItem.delete({ where: { id: item.id } });
        } else {
          await tx.inventoryItem.update({
            where: { id: item.id },
            data: { quantity: { decrement: remainingToRemove } }
          });
          remainingToRemove = 0;
        }
      }
      logger.info(`Removed ${quantity}x ${itemId} from character ${characterId}`);
    });
  }

  /**
   * Checks if character has a specific quantity of an item.
   */
  static async hasItem(characterId: string, itemId: string, quantity: number = 1): Promise<boolean> {
    const items = await prisma.inventoryItem.findMany({
      where: { characterId, itemId }
    });
    const total = items.reduce((acc, item) => acc + item.quantity, 0);
    return total >= quantity;
  }

  /**
   * Equips a weapon or armor from the inventory.
   */
  static async equipItem(characterId: string, inventoryItemId: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const itemToEquip = await tx.inventoryItem.findUnique({
        where: { id: inventoryItemId }
      });

      if (!itemToEquip || itemToEquip.characterId !== characterId) {
        throw new Error('Item not found in inventory');
      }

      if (itemToEquip.equipped) {
        throw new Error('Item is already equipped');
      }

      const def = this.getItemDefinition(itemToEquip.itemId);
      if (def.type !== 'WEAPON' && def.type !== 'ARMOR') {
        throw new Error('Only weapons and armor can be equipped');
      }

      // Check level requirement
      const char = await tx.character.findUnique({
        where: { id: characterId },
        select: { level: true }
      });
      if (!char || char.level < def.requiredLevel) {
        throw new Error(`Required level ${def.requiredLevel} to equip this item`);
      }

      // Unequip currently equipped item of the same type
      const currentEquipped = await tx.inventoryItem.findMany({
        where: { characterId, equipped: true }
      });

      for (const eq of currentEquipped) {
        const eqDef = this.getItemDefinition(eq.itemId);
        if (eqDef.type === def.type) {
          // Unequip it
          await tx.inventoryItem.update({
            where: { id: eq.id },
            data: { equipped: false }
          });
        }
      }

      // Equip the new item
      // If quantity > 1, we split the stack: equip 1, keep remaining as unequipped
      if (itemToEquip.quantity > 1) {
        await tx.inventoryItem.update({
          where: { id: itemToEquip.id },
          data: { quantity: { decrement: 1 } }
        });
        await tx.inventoryItem.create({
          data: {
            characterId,
            itemId: itemToEquip.itemId,
            quantity: 1,
            equipped: true,
            metadata: itemToEquip.metadata
          }
        });
      } else {
        await tx.inventoryItem.update({
          where: { id: itemToEquip.id },
          data: { equipped: true }
        });
      }

      logger.info(`Character ${characterId} equipped ${itemToEquip.itemId}`);
    });
  }

  /**
   * Unequips an item.
   */
  static async unequipItem(characterId: string, inventoryItemId: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const itemToUnequip = await tx.inventoryItem.findUnique({
        where: { id: inventoryItemId }
      });

      if (!itemToUnequip || itemToUnequip.characterId !== characterId) {
        throw new Error('Item not found');
      }

      if (!itemToUnequip.equipped) {
        throw new Error('Item is not equipped');
      }

      // Unequip and merge back if possible
      await tx.inventoryItem.update({
        where: { id: itemToUnequip.id },
        data: { equipped: false }
      });

      // Try merging unequipped items of the same type if not stackLimit 1
      const def = this.getItemDefinition(itemToUnequip.itemId);
      if (def.stackLimit > 1) {
        const others = await tx.inventoryItem.findMany({
          where: { characterId, itemId: itemToUnequip.itemId, equipped: false }
        });

        if (others.length > 1) {
          const totalQty = others.reduce((sum, item) => sum + item.quantity, 0);
          const firstId = others[0].id;

          // Delete all except the first one, update the first one
          for (let i = 1; i < others.length; i++) {
            await tx.inventoryItem.delete({ where: { id: others[i].id } });
          }
          await tx.inventoryItem.update({
            where: { id: firstId },
            data: { quantity: totalQty }
          });
        }
      }

      logger.info(`Character ${characterId} unequipped ${itemToUnequip.itemId}`);
    });
  }
}
