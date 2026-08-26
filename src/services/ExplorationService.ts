import { prisma } from '../database/client';
import { GAME_CONFIG } from '../config/gameConfig';
import { CharacterService } from './CharacterService';
import { InventoryService } from './InventoryService';
import { EconomyService } from './EconomyService';

export type ExploreResultType = 'LOOT' | 'COMBAT' | 'DISCOVERY' | 'GOLD' | 'NOTHING';

export interface ExploreResult {
  type: ExploreResultType;
  message: string;
  regionId: string;
  regionName: string;
  energyConsumed: number;
  data?: any;
}

export class ExplorationService {
  /**
   * Explores the character's current region, consuming energy and returning an event.
   */
  static async explore(characterId: string): Promise<ExploreResult> {
    const char = await CharacterService.getCharacter(characterId);
    const region = GAME_CONFIG.regions[char.currentRegion];

    if (!region) {
      throw new Error(`Region not found: ${char.currentRegion}`);
    }

    // Check level locks
    if (char.level < region.requiredLevel) {
      throw new Error(`Your level (${char.level}) is too low for ${region.name} (Requires ${region.requiredLevel}).`);
    }

    // Consume energy
    await CharacterService.consumeEnergy(characterId, region.energyCost);

    // Apply class bonuses
    const classDef = GAME_CONFIG.classes[char.class];
    const discoveryChanceMult = classDef?.bonuses?.rareDiscoverChanceBonus || 1.0;
    const rewardMult = classDef?.bonuses?.explorationRewardMultiplier || 1.0;

    // Roll for events:
    // 1. Discovery (15% base modified by explorer luck/class bonus)
    // 2. Combat (35%)
    // 3. Loot (30%)
    // 4. Gold (15%)
    // 5. Nothing (5%)
    const roll = Math.random();

    // 1. Roll Discovery first (location discovery)
    const discoveryRoll = Math.random();
    // Look up discoveries in the region
    const possibleDiscoveries = region.discoveries;
    if (possibleDiscoveries.length > 0) {
      for (const discovery of possibleDiscoveries) {
        const actualChance = discovery.chance * discoveryChanceMult;
        if (discoveryRoll < actualChance) {
          // Verify if already discovered
          const alreadyDiscovered = await prisma.playerDiscovery.findUnique({
            where: {
              characterId_regionId_locationId: {
                characterId,
                regionId: region.id,
                locationId: discovery.id
              }
            }
          });

          if (!alreadyDiscovered) {
            await prisma.playerDiscovery.create({
              data: {
                characterId,
                regionId: region.id,
                locationId: discovery.id
              }
            });

            // Reward reputation & gold for new discovery
            const bonusGold = Math.floor(100 * char.level * rewardMult);
            await EconomyService.addGold(characterId, bonusGold, 'EXPLORE_REWARD', `Discovered ${discovery.name}`);
            await prisma.character.update({
              where: { id: characterId },
              data: { reputation: { increment: 10 } }
            });

            return {
              type: 'DISCOVERY',
              regionId: region.id,
              regionName: region.name,
              energyConsumed: region.energyCost,
              message: `🗺️ **Location Discovered!** You found: **${discovery.name}**.\n\n"${discovery.description}"\n\nReward: **+${bonusGold} Gold** and **+10 Reputation**!`,
              data: { discoveryId: discovery.id, gold: bonusGold, reputation: 10 }
            };
          }
        }
      }
    }

    // 2. Combat (Roll between 0.0 and 0.35)
    if (roll < 0.35 && region.enemies.length > 0) {
      // Pick random enemy from region list
      const enemyId = region.enemies[Math.floor(Math.random() * region.enemies.length)];
      const enemyDef = GAME_CONFIG.enemies[enemyId];

      if (enemyDef) {
        // Initialize Combat state (handled in combat service, but flagged here)
        return {
          type: 'COMBAT',
          regionId: region.id,
          regionName: region.name,
          energyConsumed: region.energyCost,
          message: `⚔️ **Encounter!** A wild **${enemyDef.name}** (Lvl ${enemyDef.level}) jumps out from the shadows!`,
          data: { enemyId }
        };
      }
    }

    // 3. Loot (Roll between 0.35 and 0.65)
    if (roll >= 0.35 && roll < 0.65 && region.explorationLoot.length > 0) {
      // Roll for items in exploration loot table
      const rolledLoot: { itemId: string; quantity: number }[] = [];
      for (const itemChance of region.explorationLoot) {
        if (Math.random() < itemChance.chance) {
          const qty = Math.floor(
            (Math.random() * (itemChance.quantity[1] - itemChance.quantity[0] + 1) + itemChance.quantity[0]) * rewardMult
          );
          if (qty > 0) {
            rolledLoot.push({ itemId: itemChance.itemId, quantity: qty });
          }
        }
      }

      if (rolledLoot.length > 0) {
        for (const loot of rolledLoot) {
          await InventoryService.addItem(characterId, loot.itemId, loot.quantity);
        }

        const lootList = rolledLoot
          .map((l) => {
            const itemDef = GAME_CONFIG.items[l.itemId];
            return `**${l.quantity}x ${itemDef?.name || l.itemId}**`;
          })
          .join(', ');

        return {
          type: 'LOOT',
          regionId: region.id,
          regionName: region.name,
          energyConsumed: region.energyCost,
          message: `🎒 **Gathered Resources!** You searched around and found: ${lootList}`,
          data: { loot: rolledLoot }
        };
      }
    }

    // 4. Gold (Roll between 0.65 and 0.85)
    if (roll >= 0.65 && roll < 0.85) {
      // Find a stash of gold
      const goldAmt = Math.floor((Math.random() * 20 + 10) * char.level * rewardMult);
      await EconomyService.addGold(characterId, goldAmt, 'EXPLORE_REWARD', 'Found gold stash while exploring');

      return {
        type: 'GOLD',
        regionId: region.id,
        regionName: region.name,
        energyConsumed: region.energyCost,
        message: `💰 **Stumbled upon Treasure!** You spot a dusty pouch on the ground containing **${goldAmt} Gold**!`,
        data: { gold: goldAmt }
      };
    }

    // 5. Nothing (Roll >= 0.85)
    return {
      type: 'NOTHING',
      regionId: region.id,
      regionName: region.name,
      energyConsumed: region.energyCost,
      message: `🌲 **Quiet Journey.** You explore the area but find nothing of interest. It is a peaceful walk.`,
      data: null
    };
  }
}
