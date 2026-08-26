import { prisma } from '../database/client';
import { GAME_CONFIG } from '../config/gameConfig';
import { CharacterService } from './CharacterService';
import { InventoryService } from './InventoryService';
import { EconomyService } from './EconomyService';
import { logger } from '../utils/logger';

export interface CombatState {
  characterId: string;
  enemyId: string;
  enemyHp: number;
  playerHp: number;
  turn: number; // 0 = Player, 1 = Enemy
  rounds: number;
  defenseBuff: boolean; // Player defended this round
}

export interface CombatRoundResult {
  combatState: CombatState | null; // null if ended
  playerActionLog: string;
  enemyActionLog: string;
  victory: boolean;
  defeated: boolean;
  rewards?: {
    gold: number;
    xp: number;
    items: { itemId: string; name: string; quantity: number }[];
  };
}

export class CombatService {
  private static activeCombats = new Map<string, CombatState>();

  static getActiveCombat(characterId: string): CombatState | undefined {
    return this.activeCombats.get(characterId);
  }

  /**
   * Initializes combat state between character and enemy.
   */
  static async startCombat(characterId: string, enemyId: string): Promise<CombatState> {
    const char = await CharacterService.getCharacter(characterId);
    const enemyDef = GAME_CONFIG.enemies[enemyId];

    if (!enemyDef) {
      throw new Error(`Enemy ${enemyId} not found`);
    }

    const state: CombatState = {
      characterId,
      enemyId,
      enemyHp: enemyDef.hp,
      playerHp: char.hp,
      turn: 0, // Player goes first
      rounds: 1,
      defenseBuff: false
    };

    this.activeCombats.set(characterId, state);
    logger.info(`Combat started: ${char.name} vs ${enemyDef.name}`);
    return state;
  }

  /**
   * Executes one turn cycle (Player action + Enemy reaction if enemy survives).
   */
  static async executeAction(
    characterId: string,
    action: 'ATTACK' | 'DEFEND' | 'SKILL' | 'ITEM' | 'FLEE',
    itemIdToUse?: string
  ): Promise<CombatRoundResult> {
    const state = this.activeCombats.get(characterId);
    if (!state) {
      throw new Error('You are not in combat!');
    }

    const char = await CharacterService.getCharacter(characterId);
    const enemyDef = GAME_CONFIG.enemies[state.enemyId];

    if (!enemyDef) {
      this.activeCombats.delete(characterId);
      throw new Error('Enemy definition missing. Combat aborted.');
    }

    let playerLog = '';
    let enemyLog = '';
    let victory = false;
    let defeated = false;
    let rewards: CombatRoundResult['rewards'];

    // --- PLAYER TURN ---
    state.defenseBuff = false; // Reset defense buff at start of turn

    if (action === 'FLEE') {
      // Escape chance: Agility and Luck vs Enemy level
      const escapeChance = Math.min(0.9, 0.4 + (char.agility + char.luck) / 200);
      if (Math.random() < escapeChance) {
        this.activeCombats.delete(characterId);
        return {
          combatState: null,
          playerActionLog: `🏃 **Flee!** You successfully managed to escape from the **${enemyDef.name}**!`,
          enemyActionLog: '',
          victory: false,
          defeated: false
        };
      } else {
        playerLog = `🏃 **Flee Failed!** You tried to escape, but the **${enemyDef.name}** blocked your path!`;
      }
    } else if (action === 'DEFEND') {
      state.defenseBuff = true;
      playerLog = `🛡️ **Defend!** You raise your guard, reducing damage taken next turn by 50%.`;
    } else if (action === 'ITEM') {
      if (!itemIdToUse) {
        throw new Error('No item specified to use.');
      }
      const hasItem = await InventoryService.hasItem(characterId, itemIdToUse, 1);
      if (!hasItem) {
        throw new Error(`You do not have any ${GAME_CONFIG.items[itemIdToUse]?.name || itemIdToUse} left!`);
      }

      const itemDef = GAME_CONFIG.items[itemIdToUse];
      if (itemDef.type !== 'CONSUMABLE') {
        throw new Error('You can only consume potions or items during combat.');
      }

      // Consume item logic
      await InventoryService.removeItem(characterId, itemIdToUse, 1);

      // Check item effects
      if (itemIdToUse === 'health_potion') {
        const healed = Math.min(char.maxHp - state.playerHp, 30);
        state.playerHp += healed;
        playerLog = `🧪 **Item!** You drank a **Health Potion** and restored **${healed} HP**! (${state.playerHp}/${char.maxHp} HP)`;
      } else if (itemIdToUse === 'energy_elixir') {
        // Energy potions usually restore energy, but in combat maybe it restores HP too, or does something else.
        // For now, let's say it gives player a small attack buff or restores HP
        const healed = Math.min(char.maxHp - state.playerHp, 15);
        state.playerHp += healed;
        playerLog = `🧪 **Item!** You drank an **Energy Elixir** and restored **${healed} HP**!`;
      } else {
        playerLog = `🧪 **Item!** You consumed **${itemDef.name}** but nothing happened.`;
      }

      // Sync character HP
      await CharacterService.setHp(characterId, state.playerHp);
    } else {
      // ATTACK or SKILL
      const isSkill = action === 'SKILL';
      const baseAtk = char.strength * 2; // Strength influence
      const variance = (Math.random() * 0.2 - 0.1) * baseAtk; // 10% variance

      let rawDmg = isSkill ? baseAtk * 1.5 : baseAtk;
      rawDmg += variance;

      // Apply class combat bonus (Adventurer has combatDmgMultiplier)
      const classBonus = GAME_CONFIG.classes[char.class]?.bonuses?.combatDmgMultiplier || 1.0;
      rawDmg *= classBonus;

      // Critical Hit roll
      const critChance = char.luck / (char.luck + 100);
      const isCrit = Math.random() < critChance;
      if (isCrit) {
        rawDmg *= 1.5;
      }

      // Calculate final damage (minus enemy defense)
      const dmg = Math.max(1, Math.floor(rawDmg - enemyDef.def));
      state.enemyHp = Math.max(0, state.enemyHp - dmg);

      const hitType = isCrit ? '💥 **CRITICAL HIT!**' : '⚔️';
      const actionName = isSkill ? 'Stellar Slash ✨' : 'Basic Attack';
      playerLog = `${hitType} You strike the **${enemyDef.name}** using **${actionName}** for **${dmg} Damage**! (${state.enemyHp}/${enemyDef.hp} HP)`;
    }

    // --- CHECK VICTORY ---
    if (state.enemyHp <= 0) {
      victory = true;
      this.activeCombats.delete(characterId);

      // Award XP
      const xpGained = enemyDef.xpReward;
      const xpRes = await CharacterService.addXp(characterId, xpGained);

      // Award Gold
      const goldGained = Math.floor(enemyDef.goldReward * (1 + char.luck / 100)); // Luck boosts gold rewards
      await EconomyService.addGold(characterId, goldGained, 'COMBAT_REWARD', `Defeated ${enemyDef.name}`);

      // Award Loot
      const itemsLooted: { itemId: string; name: string; quantity: number }[] = [];
      for (const lootItem of enemyDef.lootTable) {
        if (Math.random() < lootItem.chance) {
          const qty = Math.floor(Math.random() * (lootItem.quantity[1] - lootItem.quantity[0] + 1)) + lootItem.quantity[0];
          if (qty > 0) {
            await InventoryService.addItem(characterId, lootItem.itemId, qty);
            const name = GAME_CONFIG.items[lootItem.itemId]?.name || lootItem.itemId;
            itemsLooted.push({ itemId: lootItem.itemId, name, quantity: qty });
          }
        }
      }

      // Fully sync player HP back to DB after victory
      await CharacterService.setHp(characterId, state.playerHp);

      rewards = {
        gold: goldGained,
        xp: xpGained,
        items: itemsLooted
      };

      playerLog += `\n\n🎉 **Victory!** You defeated the **${enemyDef.name}**!`;
      if (xpRes.leveledUp) {
        playerLog += `\n🌟 **LEVEL UP!** You reached **Level ${xpRes.newLevel}**! Your HP has been fully restored.`;
      }

      return {
        combatState: null,
        playerActionLog: playerLog,
        enemyActionLog: '',
        victory,
        defeated,
        rewards
      };
    }

    // --- ENEMY TURN ---
    // Enemy attacks player if player didn't flee successfully or defeat the enemy
    const enemyAtk = enemyDef.atk;
    const playerDef = char.defense;
    const enemyVariance = (Math.random() * 0.2 - 0.1) * enemyAtk;

    // Agility vs enemy level determines player evasion chance
    const evasionChance = Math.min(0.5, char.agility / (char.agility + 50));
    const isEvaded = Math.random() < evasionChance;

    if (isEvaded) {
      enemyLog = `💨 The **${enemyDef.name}** attacks you, but you quickly dodge out of the way!`;
    } else {
      let rawEnemyDmg = enemyAtk + enemyVariance;
      if (state.defenseBuff) {
        rawEnemyDmg *= 0.5; // Block 50%
      }

      const enemyDmg = Math.max(1, Math.floor(rawEnemyDmg - playerDef));
      state.playerHp = Math.max(0, state.playerHp - enemyDmg);
      enemyLog = `👹 The **${enemyDef.name}** counter-attacks you for **${enemyDmg} Damage**! (${state.playerHp}/${char.maxHp} HP)`;

      // Sync character HP
      await CharacterService.setHp(characterId, state.playerHp);
    }

    // --- CHECK DEFEAT ---
    if (state.playerHp <= 0) {
      defeated = true;
      this.activeCombats.delete(characterId);

      // Defeat penalty: lose 10% gold and teleport to Village with 20% HP
      const goldPenalty = Math.floor(char.gold * 0.10);
      if (goldPenalty > 0) {
        await EconomyService.removeGold(characterId, goldPenalty, 'COMBAT_REWARD', `Defeated by ${enemyDef.name} penalty`);
      }

      // Teleport to village and restore 20% HP
      const reviveHp = Math.floor(char.maxHp * 0.20);
      await prisma.character.update({
        where: { id: characterId },
        data: {
          currentRegion: 'village',
          hp: reviveHp
        }
      });

      enemyLog += `\n\n💀 **Defeated!** You collapsed in battle. You woke up in **Oakhaven Village** feeling weak (+${reviveHp} HP). You lost **${goldPenalty} Gold** in the wilderness.`;
      return {
        combatState: null,
        playerActionLog: playerLog,
        enemyActionLog: enemyLog,
        victory,
        defeated
      };
    }

    // Update round counter
    state.rounds += 1;

    return {
      combatState: state,
      playerActionLog: playerLog,
      enemyActionLog: enemyLog,
      victory,
      defeated
    };
  }
}
