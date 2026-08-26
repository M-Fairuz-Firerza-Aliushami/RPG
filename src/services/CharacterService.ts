import { prisma } from '../database/client';
import { GAME_CONFIG } from '../config/gameConfig';
import { logger } from '../utils/logger';

export interface FullCharacterStats {
  id: string;
  name: string;
  class: string;
  level: number;
  xp: number;
  xpNeeded: number;
  gold: number;
  energy: number;
  hp: number;
  maxHp: number;
  strength: number;
  defense: number;
  agility: number;
  intelligence: number;
  luck: number;
  reputation: number;
  currentRegion: string;
  createdAt: Date;
  lastActiveAt: Date;
}

export class CharacterService {
  /**
   * Registers a new character for a Discord user.
   */
  static async createCharacter(
    id: string,
    name: string,
    classId: string
  ): Promise<FullCharacterStats> {
    const classDef = GAME_CONFIG.classes[classId.toLowerCase()];
    if (!classDef) {
      throw new Error(`Invalid class: ${classId}. Available: ${Object.keys(GAME_CONFIG.classes).join(', ')}`);
    }

    const existing = await prisma.character.findUnique({ where: { id } });
    if (existing) {
      throw new Error('You already have a character! Use /profile to view it.');
    }

    const stats = classDef.baseStats;

    const char = await prisma.character.create({
      data: {
        id,
        name,
        class: classId.toLowerCase(),
        level: 1,
        xp: 0,
        gold: 500, // Starter gold
        energy: GAME_CONFIG.maxEnergy,
        hp: stats.maxHp,
        maxHp: stats.maxHp,
        strength: stats.strength,
        defense: stats.defense,
        agility: stats.agility,
        intelligence: stats.intelligence,
        luck: stats.luck,
        currentRegion: 'village'
      }
    });

    // Give starter item (rusted sword)
    await prisma.inventoryItem.create({
      data: {
        characterId: char.id,
        itemId: 'rusted_sword',
        quantity: 1,
        equipped: true
      }
    });

    // Give starter health potion
    await prisma.inventoryItem.create({
      data: {
        characterId: char.id,
        itemId: 'health_potion',
        quantity: 2,
        equipped: false
      }
    });

    logger.info(`Character created: ${name} (${classId}) for user ${id}`);
    return this.getCharacter(id);
  }

  /**
   * Fetches the character, applies lazy energy recovery, and resolves equipment stats.
   */
  static async getCharacter(id: string): Promise<FullCharacterStats> {
    const char = await prisma.character.findUnique({
      where: { id },
      include: {
        inventory: {
          where: { equipped: true }
        }
      }
    });

    if (!char) {
      throw new Error('No character found. Use `/start` to begin your journey!');
    }

    // Lazy energy recovery
    const now = new Date();
    const timeDiffMs = now.getTime() - new Date(char.lastActiveAt).getTime();
    const hoursDiff = timeDiffMs / (1000 * 60 * 60);
    const recoveredEnergy = Math.floor(hoursDiff * GAME_CONFIG.energyRecoveryPerHour);

    let finalEnergy = char.energy;
    let updatedActiveDate = char.lastActiveAt;

    if (recoveredEnergy > 0 && char.energy < GAME_CONFIG.maxEnergy) {
      finalEnergy = Math.min(GAME_CONFIG.maxEnergy, char.energy + recoveredEnergy);
      updatedActiveDate = now;

      await prisma.character.update({
        where: { id },
        data: {
          energy: finalEnergy,
          lastActiveAt: now
        }
      });
    } else {
      // Just update activity timestamp to keep it fresh
      await prisma.character.update({
        where: { id },
        data: { lastActiveAt: now }
      });
    }

    // Resolve base stats from config + level updates
    const classDef = GAME_CONFIG.classes[char.class];
    if (!classDef) {
      throw new Error(`Invalid class configuration found for character: ${char.class}`);
    }

    // Level progression formula: +1 to stats per level, +10 HP per level
    const lvlBonus = char.level - 1;
    let strength = classDef.baseStats.strength + lvlBonus;
    let defense = classDef.baseStats.defense + lvlBonus;
    let agility = classDef.baseStats.agility + lvlBonus;
    let intelligence = classDef.baseStats.intelligence + lvlBonus;
    let luck = classDef.baseStats.luck + lvlBonus;
    let maxHp = classDef.baseStats.maxHp + lvlBonus * 10;

    // Apply equipment modifiers
    for (const eq of char.inventory) {
      const itemDef = GAME_CONFIG.items[eq.itemId];
      if (itemDef?.stats) {
        if (itemDef.stats.strength) strength += itemDef.stats.strength;
        if (itemDef.stats.defense) defense += itemDef.stats.defense;
        if (itemDef.stats.agility) agility += itemDef.stats.agility;
        if (itemDef.stats.intelligence) intelligence += itemDef.stats.intelligence;
        if (itemDef.stats.luck) luck += itemDef.stats.luck;
        if (itemDef.stats.maxHp) maxHp += itemDef.stats.maxHp;
      }
    }

    const xpNeeded = GAME_CONFIG.xpFormula(char.level);

    return {
      id: char.id,
      name: char.name,
      class: char.class,
      level: char.level,
      xp: char.xp,
      xpNeeded,
      gold: char.gold,
      energy: finalEnergy,
      hp: Math.min(char.hp, maxHp), // HP cannot exceed dynamic max HP
      maxHp,
      strength,
      defense,
      agility,
      intelligence,
      luck,
      reputation: char.reputation,
      currentRegion: char.currentRegion,
      createdAt: char.createdAt,
      lastActiveAt: updatedActiveDate
    };
  }

  /**
   * Consume energy. Throws error if energy is insufficient.
   */
  static async consumeEnergy(characterId: string, amount: number): Promise<number> {
    const char = await this.getCharacter(characterId);
    if (char.energy < amount) {
      throw new Error(`Insufficient energy! You have ${char.energy}/${GAME_CONFIG.maxEnergy} ⚡. Energy recovers by ${GAME_CONFIG.energyRecoveryPerHour}/hr.`);
    }

    const updated = await prisma.character.update({
      where: { id: characterId },
      data: {
        energy: { decrement: amount }
      },
      select: { energy: true }
    });

    return updated.energy;
  }

  /**
   * Adds XP to a character and handles level-ups automatically.
   */
  static async addXp(characterId: string, xpAmount: number): Promise<{ leveledUp: boolean; newLevel: number; currentXp: number }> {
    if (xpAmount <= 0) return { leveledUp: false, newLevel: 0, currentXp: 0 };

    return await prisma.$transaction(async (tx) => {
      const char = await tx.character.findUnique({
        where: { id: characterId }
      });
      if (!char) throw new Error('Character not found');

      let currentXp = char.xp + xpAmount;
      let level = char.level;
      let leveledUp = false;

      while (true) {
        const needed = GAME_CONFIG.xpFormula(level);
        if (currentXp >= needed) {
          currentXp -= needed;
          level += 1;
          leveledUp = true;
        } else {
          break;
        }
      }

      if (leveledUp) {
        // Adjust HP to new max HP
        const classDef = GAME_CONFIG.classes[char.class];
        const newMaxHp = classDef.baseStats.maxHp + (level - 1) * 10;

        await tx.character.update({
          where: { id: characterId },
          data: {
            xp: currentXp,
            level: level,
            hp: newMaxHp // Fully heal on level up
          }
        });
        logger.info(`Character ${characterId} leveled up to ${level}!`);
      } else {
        await tx.character.update({
          where: { id: characterId },
          data: { xp: currentXp }
        });
      }

      return {
        leveledUp,
        newLevel: level,
        currentXp
      };
    });
  }

  /**
   * Set dynamic HP. Capped at character's maxHp.
   */
  static async setHp(characterId: string, hpAmount: number): Promise<number> {
    const char = await this.getCharacter(characterId);
    const newHp = Math.max(0, Math.min(char.maxHp, hpAmount));

    await prisma.character.update({
      where: { id: characterId },
      data: { hp: newHp }
    });

    return newHp;
  }

  /**
   * Set traveler's current region.
   */
  static async travelToRegion(characterId: string, regionId: string): Promise<void> {
    const region = GAME_CONFIG.regions[regionId.toLowerCase()];
    if (!region) {
      throw new Error(`Invalid region: ${regionId}`);
    }

    const char = await this.getCharacter(characterId);
    if (char.level < region.requiredLevel) {
      throw new Error(`You must be level ${region.requiredLevel} to travel to ${region.name}.`);
    }

    await prisma.character.update({
      where: { id: characterId },
      data: { currentRegion: regionId.toLowerCase() }
    });
  }
}
