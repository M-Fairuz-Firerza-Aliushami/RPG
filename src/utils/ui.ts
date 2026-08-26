import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { FullCharacterStats } from '../services/CharacterService';
import { GAME_CONFIG, EnemyDefinition } from '../config/gameConfig';
import { CombatState } from '../services/CombatService';
import { ExploreResult } from '../services/ExplorationService';

export class UIGenerator {
  /**
   * Generates a text-based progress bar.
   */
  static createProgressBar(current: number, max: number, length: number = 10): string {
    const fillChar = '█';
    const emptyChar = '░';
    const percent = Math.max(0, Math.min(1, current / max));
    const fillLength = Math.round(percent * length);
    const emptyLength = length - fillLength;
    const percentageText = Math.round(percent * 100);
    return `${fillChar.repeat(fillLength)}${emptyChar.repeat(emptyLength)} ${percentageText}%`;
  }

  /**
   * Generates character profile embed.
   */
  static createProfileEmbed(char: FullCharacterStats, avatarUrl?: string): EmbedBuilder {
    const classDef = GAME_CONFIG.classes[char.class];
    const className = classDef?.name || char.class;

    const xpBar = this.createProgressBar(char.xp, char.xpNeeded);
    const hpBar = this.createProgressBar(char.hp, char.maxHp);
    const energyBar = this.createProgressBar(char.energy, GAME_CONFIG.maxEnergy);

    const embed = new EmbedBuilder()
      .setColor('#2F3136')
      .setTitle(`🌌 ECLIPSE — Profile`)
      .setDescription(`**${char.name}**\nLevel ${char.level} ${className}`)
      .addFields(
        { name: '✨ Experience', value: `\`${xpBar}\` (${char.xp}/${char.xpNeeded} XP)`, inline: false },
        { name: '❤️ Health Points', value: `\`${hpBar}\` (${char.hp}/${char.maxHp} HP)`, inline: true },
        { name: '⚡ Energy', value: `\`${energyBar}\` (${char.energy}/${GAME_CONFIG.maxEnergy} Energy)`, inline: true },
        { name: '💰 Gold Coins', value: `**${char.gold.toLocaleString()}** Gold`, inline: true },
        {
          name: '📊 Attributes',
          value: `💪 Strength: **${char.strength}**\n🛡️ Defense: **${char.defense}**\n💨 Agility: **${char.agility}**\n🧠 Intelligence: **${char.intelligence}**\n🍀 Luck: **${char.luck}**`,
          inline: true
        },
        {
          name: '🏆 Progression',
          value: `🏅 Reputation: **${char.reputation}**\n📍 Location: **${GAME_CONFIG.regions[char.currentRegion]?.name || char.currentRegion}**`,
          inline: true
        }
      )
      .setTimestamp();

    if (avatarUrl) {
      embed.setThumbnail(avatarUrl);
    }

    return embed;
  }

  /**
   * Generates default interaction buttons for character control.
   */
  static createNavigationComponents(): ActionRowBuilder<ButtonBuilder> {
    const exploreBtn = new ButtonBuilder()
      .setCustomId('nav_explore')
      .setLabel('⚔️ Explore')
      .setStyle(ButtonStyle.Primary);

    const inventoryBtn = new ButtonBuilder()
      .setCustomId('nav_inventory')
      .setLabel('🎒 Inventory')
      .setStyle(ButtonStyle.Secondary);

    const questsBtn = new ButtonBuilder()
      .setCustomId('nav_quests')
      .setLabel('📜 Quests')
      .setStyle(ButtonStyle.Secondary);

    const marketBtn = new ButtonBuilder()
      .setCustomId('nav_market')
      .setLabel('🛒 Market')
      .setStyle(ButtonStyle.Secondary);

    const profileBtn = new ButtonBuilder()
      .setCustomId('nav_profile')
      .setLabel('👤 Profile')
      .setStyle(ButtonStyle.Secondary);

    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      exploreBtn,
      inventoryBtn,
      questsBtn,
      marketBtn,
      profileBtn
    );
  }

  /**
   * Generates exploration event output embed.
   */
  static createExploreEmbed(result: ExploreResult): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setTitle(`🌲 Exploration: ${result.regionName}`)
      .setDescription(result.message)
      .setFooter({ text: `Consumed ${result.energyConsumed} energy` })
      .setTimestamp();

    switch (result.type) {
      case 'LOOT':
        embed.setColor('#43B581'); // Green
        break;
      case 'COMBAT':
        embed.setColor('#F04747'); // Red
        break;
      case 'DISCOVERY':
        embed.setColor('#FAA61A'); // Orange
        break;
      case 'GOLD':
        embed.setColor('#FEE75C'); // Yellow
        break;
      default:
        embed.setColor('#747F8D'); // Grey
    }

    return embed;
  }

  /**
   * Generates combat screen embed with double HP bars.
   */
  static createCombatEmbed(enemy: EnemyDefinition, state: CombatState, char: FullCharacterStats): EmbedBuilder {
    const playerBar = this.createProgressBar(state.playerHp, char.maxHp);
    const enemyBar = this.createProgressBar(state.enemyHp, enemy.hp);

    return new EmbedBuilder()
      .setColor('#E02424')
      .setTitle(`⚔️ ECLIPSE — Combat Encounter`)
      .setDescription(`Round **${state.rounds}** — Active Battle`)
      .addFields(
        {
          name: `👤 ${char.name} (Lvl ${char.level})`,
          value: `HP: \`${playerBar}\` (${state.playerHp}/${char.maxHp} HP)\nState: ${state.defenseBuff ? '🛡️ Defending' : '⚔️ Attacking'}`,
          inline: false
        },
        {
          name: `👹 ${enemy.name} (Lvl ${enemy.level})`,
          value: `HP: \`${enemyBar}\` (${state.enemyHp}/${enemy.hp} HP)`,
          inline: false
        }
      )
      .setFooter({ text: 'Pick your next battle action below:' })
      .setTimestamp();
  }

  /**
   * Generates buttons for turn-based combat.
   */
  static createCombatButtons(hasPotions: boolean): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('combat_attack')
        .setLabel('⚔️ Attack')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('combat_defend')
        .setLabel('🛡️ Defend')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('combat_skill')
        .setLabel('✨ Skill')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('combat_item')
        .setLabel('🎒 Item')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!hasPotions),
      new ButtonBuilder()
        .setCustomId('combat_flee')
        .setLabel('🏃 Flee')
        .setStyle(ButtonStyle.Secondary)
    );
  }

  /**
   * Generates inventory listing embed.
   */
  static createInventoryEmbed(charName: string, items: any[]): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setColor('#7289DA')
      .setTitle(`🎒 ${charName}'s Inventory`)
      .setDescription(items.length === 0 ? 'Your inventory is currently empty.' : null)
      .setTimestamp();

    if (items.length > 0) {
      const equippedLines: string[] = [];
      const materialLines: string[] = [];
      const consumableLines: string[] = [];

      for (const item of items) {
        const def = GAME_CONFIG.items[item.itemId];
        if (!def) continue;

        const line = `• **${def.name}** (x${item.quantity}) — *${def.description}*`;

        if (item.equipped) {
          equippedLines.push(`• 🌟 **${def.name}** (Equipped) — *${def.description}*`);
        } else if (def.type === 'MATERIAL') {
          materialLines.push(line);
        } else if (def.type === 'CONSUMABLE') {
          consumableLines.push(line);
        } else {
          materialLines.push(line); // fallback
        }
      }

      if (equippedLines.length > 0) {
        embed.addFields({ name: '🌟 Equipped Gear', value: equippedLines.join('\n') });
      }
      if (consumableLines.length > 0) {
        embed.addFields({ name: '🧪 Potions & Consumables', value: consumableLines.join('\n') });
      }
      if (materialLines.length > 0) {
        embed.addFields({ name: '🧱 Materials & Resources', value: materialLines.join('\n') });
      }
    }

    return embed;
  }
}
