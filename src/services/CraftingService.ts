import { prisma } from '../database/client';
import { GAME_CONFIG, RecipeDefinition } from '../config/gameConfig';
import { CharacterService } from './CharacterService';
import { logger } from '../utils/logger';

export class CraftingService {
  static getRecipeDefinition(recipeId: string): RecipeDefinition {
    const recipe = GAME_CONFIG.recipes.find((r) => r.id === recipeId);
    if (!recipe) {
      throw new Error(`Recipe ${recipeId} not found`);
    }
    return recipe;
  }

  /**
   * Crafts an item if the character has requirements and ingredients.
   */
  static async craftItem(
    characterId: string,
    recipeId: string
  ): Promise<{ success: boolean; resultItemId: string; quantity: number; message: string }> {
    const recipe = this.getRecipeDefinition(recipeId);
    const char = await CharacterService.getCharacter(characterId);

    if (char.level < recipe.requiredLevel) {
      throw new Error(`Requires level ${recipe.requiredLevel} to craft this recipe.`);
    }

    return await prisma.$transaction(async (tx) => {
      // 1. Verify and consume ingredients
      for (const ingredient of recipe.ingredients) {
        // Find ingredients in inventory
        const items = await tx.inventoryItem.findMany({
          where: { characterId, itemId: ingredient.itemId, equipped: false }
        });

        const ownedQty = items.reduce((sum, i) => sum + i.quantity, 0);
        if (ownedQty < ingredient.quantity) {
          throw new Error(`Insufficient ingredients. Need ${ingredient.quantity}x ${GAME_CONFIG.items[ingredient.itemId]?.name || ingredient.itemId}, but you only own ${ownedQty}.`);
        }

        // Consume items
        let remainingToRemove = ingredient.quantity;
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
      }

      // 2. Roll for success
      // Success chance = base success chance + intelligence/200 + class bonus
      const classDef = GAME_CONFIG.classes[char.class];
      const classBonus = classDef?.bonuses?.craftingSuccessBonus || 0.0;
      const statBonus = char.intelligence / 200; // E.g. 10 intelligence adds +5% success
      const finalSuccessChance = Math.min(0.98, recipe.successChance + statBonus + classBonus);

      const roll = Math.random();
      const success = roll < finalSuccessChance;

      if (success) {
        // Give items
        const existingResult = await tx.inventoryItem.findFirst({
          where: { characterId, itemId: recipe.resultItemId, equipped: false }
        });

        if (existingResult) {
          await tx.inventoryItem.update({
            where: { id: existingResult.id },
            data: { quantity: { increment: recipe.resultQuantity } }
          });
        } else {
          await tx.inventoryItem.create({
            data: {
              characterId,
              itemId: recipe.resultItemId,
              quantity: recipe.resultQuantity,
              equipped: false
            }
          });
        }

        // Award crafting XP
        const xpGained = recipe.requiredLevel * 15;
        let currentXp = char.xp + xpGained;
        let lvl = char.level;
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

        const resultName = GAME_CONFIG.items[recipe.resultItemId]?.name || recipe.resultItemId;
        logger.info(`Crafting success: Char ${characterId} crafted ${recipe.resultQuantity}x ${recipe.resultItemId}`);
        return {
          success: true,
          resultItemId: recipe.resultItemId,
          quantity: recipe.resultQuantity,
          message: `🔨 **Crafting Success!** You successfully crafted **${recipe.resultQuantity}x ${resultName}** and gained **+${xpGained} XP**!`
        };
      } else {
        logger.info(`Crafting failure: Char ${characterId} failed to craft ${recipe.resultItemId}`);
        return {
          success: false,
          resultItemId: recipe.resultItemId,
          quantity: 0,
          message: `🔨 **Crafting Failed!** You miscalculated the mixture and the ingredients were ruined. Better luck next time!`
        };
      }
    });
  }
}
