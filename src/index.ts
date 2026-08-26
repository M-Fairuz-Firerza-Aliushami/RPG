import { Client, GatewayIntentBits, Interaction, EmbedBuilder } from 'discord.js';
import dotenv from 'dotenv';
import { logger } from './utils/logger';
import { prisma } from './database/client';
import { CharacterService } from './services/CharacterService';
import { EconomyService } from './services/EconomyService';
import { InventoryService } from './services/InventoryService';
import { ExplorationService } from './services/ExplorationService';
import { CombatService } from './services/CombatService';
import { QuestService } from './services/QuestService';
import { MarketplaceService } from './services/MarketplaceService';
import { GuildService } from './services/GuildService';
import { WorldEventService } from './services/WorldEventService';
import { AchievementService } from './services/AchievementService';
import { UIGenerator } from './utils/ui';
import { GAME_CONFIG } from './config/gameConfig';
import { CraftingService } from './services/CraftingService';

dotenv.config();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

// Anti-Exploit: In-memory lock map to prevent double-click race conditions
const interactionLocks = new Set<string>();

function acquireLock(userId: string): boolean {
  if (interactionLocks.has(userId)) return false;
  interactionLocks.add(userId);
  return true;
}

function releaseLock(userId: string) {
  interactionLocks.delete(userId);
}

// Bot ready handler
client.once('ready', () => {
  logger.info(`🤖 ECLIPSE Discord Bot logged in as ${client.user?.tag}`);
});

// Router for all interactions
client.on('interactionCreate', async (interaction: Interaction) => {
  if (interaction.isChatInputCommand()) {
    const userId = interaction.user.id;
    if (!acquireLock(userId)) {
      await interaction.reply({ content: '⏳ **Slow down!** Your previous action is still being processed.', ephemeral: true });
      return;
    }

    try {
      await handleSlashCommand(interaction);
    } catch (err: any) {
      logger.error(`Error handling slash command:`, err);
      const content = `❌ **Error:** ${err.message || 'An unexpected error occurred.'}`;
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content, ephemeral: true });
      } else {
        await interaction.reply({ content, ephemeral: true });
      }
    } finally {
      releaseLock(userId);
    }
  } else if (interaction.isButton()) {
    const userId = interaction.user.id;

    // Verify button belongs to this user
    // A button customId should check context.
    // For combat actions, we verify the user is in combat.
    if (interaction.customId.startsWith('combat_')) {
      const activeCombat = CombatService.getActiveCombat(userId);
      if (!activeCombat) {
        await interaction.reply({ content: '❌ You are not in combat or this battle has ended.', ephemeral: true });
        return;
      }

      if (!acquireLock(userId)) {
        await interaction.reply({ content: '⏳ Please wait for the current turn to resolve.', ephemeral: true });
        return;
      }

      try {
        await interaction.deferUpdate();
        await handleCombatButton(interaction, userId);
      } catch (err: any) {
        logger.error(`Combat action error:`, err);
        await interaction.followUp({ content: `❌ **Combat Error:** ${err.message}`, ephemeral: true });
      } finally {
        releaseLock(userId);
      }
    } else if (interaction.customId.startsWith('nav_')) {
      // Navigation buttons on profile
      if (!acquireLock(userId)) {
        await interaction.reply({ content: '⏳ Please wait...', ephemeral: true });
        return;
      }
      try {
        await interaction.deferUpdate();
        await handleNavigationButton(interaction, userId);
      } catch (err: any) {
        await interaction.followUp({ content: `❌ **Error:** ${err.message}`, ephemeral: true });
      } finally {
        releaseLock(userId);
      }
    }
  }
});

/**
 * Handle Slash Commands routing.
 */
async function handleSlashCommand(interaction: any) {
  const { commandName, options, user } = interaction;
  const userId = user.id;

  // 1. Check if user has registered (Except for /start and /help)
  const isRegistered = await prisma.character.findUnique({ where: { id: userId } });
  if (!isRegistered && commandName !== 'start' && commandName !== 'help') {
    return interaction.reply({
      content: '🌌 **Welcome to ECLIPSE!** You do not have an active character yet.\nUse `/start name: [name] class: [class]` to create your character and begin your journey!',
      ephemeral: true
    });
  }

  // 2. Prevent slash commands if in active combat
  if (isRegistered && CombatService.getActiveCombat(userId) && commandName !== 'help') {
    return interaction.reply({
      content: '⚔️ **You are currently in combat!** You must finish your battle or flee before doing anything else.',
      ephemeral: true
    });
  }

  switch (commandName) {
    case 'start': {
      const name = options.getString('name');
      const classId = options.getString('class');
      await interaction.deferReply();
      const stats = await CharacterService.createCharacter(userId, name, classId);
      const embed = UIGenerator.createProfileEmbed(stats, user.displayAvatarURL());
      const components = UIGenerator.createNavigationComponents();
      await interaction.editReply({
        content: `🎉 **Character Registered!** Welcome to ECLIPSE, adventurer **${name}**!`,
        embeds: [embed],
        components: [components]
      });
      break;
    }

    case 'profile': {
      await interaction.deferReply();
      const stats = await CharacterService.getCharacter(userId);
      const embed = UIGenerator.createProfileEmbed(stats, user.displayAvatarURL());
      const components = UIGenerator.createNavigationComponents();
      await interaction.editReply({ embeds: [embed], components: [components] });
      break;
    }

    case 'explore': {
      await interaction.deferReply();
      const result = await ExplorationService.explore(userId);
      const embed = UIGenerator.createExploreEmbed(result);

      if (result.type === 'COMBAT') {
        const enemyId = result.data.enemyId;
        const combat = await CombatService.startCombat(userId, enemyId);
        const char = await CharacterService.getCharacter(userId);
        const enemyDef = GAME_CONFIG.enemies[enemyId];

        // Check if player has health potions to enable the button
        const hasPotions = await InventoryService.hasItem(userId, 'health_potion', 1);

        const combatEmbed = UIGenerator.createCombatEmbed(enemyDef, combat, char);
        const combatBtns = UIGenerator.createCombatButtons(hasPotions);

        await interaction.editReply({
          content: result.message,
          embeds: [combatEmbed],
          components: [combatBtns]
        });
      } else {
        // Normal explore result (loot, gold, discovery, nothing)
        await CharacterService.getCharacter(userId);
        const navRow = UIGenerator.createNavigationComponents();

        // Check for achievements
        const achs = await AchievementService.checkAchievements(userId);
        let achText = '';
        if (achs.length > 0) {
          achText = `\n\n🏆 **Achievements Unlocked!**\n` + achs.map((a) => `• **${a.name}**: *${a.description}* (+${a.rewardGold} Gold)`).join('\n');
        }

        // Check quest progress hooks
        let questText = '';
        if (result.type === 'DISCOVERY') {
          const questHooks = await QuestService.checkQuestProgress(userId, 'EXPLORE', result.regionId);
          if (questHooks.length > 0) {
            questText = `\n\n` + questHooks.map((q) => q.announcement).join('\n');
          }
        } else if (result.type === 'LOOT' && result.data.loot) {
          const lootList: { itemId: string; quantity: number }[] = result.data.loot;
          const hooks: string[] = [];
          for (const item of lootList) {
            const h = await QuestService.checkQuestProgress(userId, 'GATHER', item.itemId, item.quantity);
            if (h.length > 0) hooks.push(...h.map((x) => x.announcement));
          }
          if (hooks.length > 0) {
            questText = `\n\n` + hooks.join('\n');
          }
        }

        await interaction.editReply({
          content: `${result.message}${achText}${questText}`,
          embeds: [embed],
          components: [navRow]
        });
      }
      break;
    }

    case 'inventory': {
      await interaction.deferReply();
      const char = await CharacterService.getCharacter(userId);
      const inventory = await prisma.inventoryItem.findMany({ where: { characterId: userId } });
      const embed = UIGenerator.createInventoryEmbed(char.name, inventory);
      const navRow = UIGenerator.createNavigationComponents();
      await interaction.editReply({ embeds: [embed], components: [navRow] });
      break;
    }

    case 'quests': {
      const sub = options.getSubcommand();
      await interaction.deferReply();

      if (sub === 'list') {
        const active = await prisma.playerQuest.findMany({
          where: { characterId: userId, status: 'ACTIVE' }
        });
        const completed = await prisma.playerQuest.findMany({
          where: { characterId: userId, status: 'COMPLETED' }
        });

        const activeList = active.length > 0
          ? active.map((a) => {
              const qDef = GAME_CONFIG.quests.find((x) => x.id === a.questId);
              return `• **${qDef?.name}** (Step ${a.currentStep}): *${qDef?.steps[a.currentStep]?.description}*`;
            }).join('\n')
          : 'None';

        const available = GAME_CONFIG.quests.filter((q) => {
          const isDone = completed.some((c) => c.questId === q.id);
          const isActive = active.some((ac) => ac.questId === q.id);
          return !isDone && !isActive;
        });

        const availableList = available.length > 0
          ? available.map((a) => `• **${a.name}** (Req Level ${a.requiredLevel}): ID: \`${a.id}\` — *${a.description}*`).join('\n')
          : 'No quests currently available.';

        const embed = new EmbedBuilder()
          .setColor('#7289DA')
          .setTitle('📜 ECLIPSE — Quest Board')
          .addFields(
            { name: '🔥 Active Quests', value: activeList },
            { name: '🌟 Available Quests', value: availableList }
          )
          .setFooter({ text: 'Use `/quests start quest_id: [id]` to begin a quest.' });

        await interaction.editReply({ embeds: [embed] });
      } else if (sub === 'start') {
        const questId = options.getString('quest_id');
        await QuestService.startQuest(userId, questId);
        const questDef = GAME_CONFIG.quests.find((q) => q.id === questId);

        await interaction.editReply({
          content: `📜 **Quest Started!** You accepted the quest: **${questDef?.name}**.\nObjective: ${questDef?.steps[0]?.description}`
        });
      }
      break;
    }

    case 'craft': {
      await interaction.deferReply();
      const recipeId = options.getString('recipe_id');
      const res = await CraftingService.craftItem(userId, recipeId);

      const navRow = UIGenerator.createNavigationComponents();
      await interaction.editReply({
        content: res.message,
        components: [navRow]
      });

      // Check achievements afterwards
      await AchievementService.checkAchievements(userId);
      break;
    }

    case 'guild': {
      const sub = options.getSubcommand();
      await interaction.deferReply();

      if (sub === 'create') {
        const name = options.getString('name');
        const tag = options.getString('tag');
        await GuildService.createGuild(userId, name, tag);

        await interaction.editReply({
          content: `🛡️ **Guild Created!** You are now the Leader of **${name} [${tag.toUpperCase()}]**!`
        });
      } else if (sub === 'view') {
        const guild = await GuildService.getGuildDetails(userId);
        if (!guild) {
          return interaction.editReply({
            content: '❌ You are not currently in a guild. Use `/guild create` to start one!'
          });
        }

        const membersList = guild.members
          .map((m) => `• **${m.character.name}** (${m.role}) — Level ${m.character.level}`)
          .join('\n');

        const upgradesList = guild.upgrades
          .map((u) => `• ${u.type.toUpperCase()}: Level **${u.level}**`)
          .join('\n');

        const embed = new EmbedBuilder()
          .setColor('#5865F2')
          .setTitle(`🛡️ Guild: ${guild.name} [${guild.tag}]`)
          .setDescription(guild.description || '*No description set.*')
          .addFields(
            { name: '💰 Treasury', value: `**${guild.treasury.toLocaleString()}** Gold coins`, inline: true },
            { name: '🌟 Guild Progression', value: `Level: **${guild.level}**\nXP: **${guild.xp}**`, inline: true },
            { name: '👥 Members', value: membersList, inline: false },
            { name: '🔧 Upgrades', value: upgradesList, inline: false }
          );

        await interaction.editReply({ embeds: [embed] });
      } else if (sub === 'donate') {
        const amount = options.getInteger('amount');
        const newTreasury = await GuildService.donateGold(userId, amount);
        await interaction.editReply({
          content: `💰 Donated **${amount.toLocaleString()} Gold** to your Guild! New Treasury Balance: **${newTreasury.toLocaleString()} Gold**.`
        });
      } else if (sub === 'upgrade') {
        const asset = options.getString('asset');
        const newLevel = await GuildService.upgradeAsset(userId, asset);
        await interaction.editReply({
          content: `🔧 Guild Upgrade Complete! **${asset.toUpperCase()}** is now Level **${newLevel}**!`
        });
      } else if (sub === 'leave') {
        await GuildService.leaveGuild(userId);
        await interaction.editReply({
          content: '👋 You have successfully left your guild.'
        });
      }
      break;
    }

    case 'map': {
      await interaction.deferReply();
      const travelTo = options.getString('travel_to');

      if (travelTo) {
        await CharacterService.travelToRegion(userId, travelTo);
        const regionName = GAME_CONFIG.regions[travelTo.toLowerCase()]?.name;
        await interaction.editReply({
          content: `🗺️ **Travel Complete!** You have traveled to **${regionName}**.`
        });
      } else {
        // Display map
        const char = await CharacterService.getCharacter(userId);
        const embed = new EmbedBuilder()
          .setColor('#3498DB')
          .setTitle('🗺️ ECLIPSE World Map')
          .setDescription('Select a region to travel using `/map travel_to: [region]`\n\n')
          .setTimestamp();

        const regionList = Object.values(GAME_CONFIG.regions).map((r) => {
          const active = char.currentRegion === r.id ? '📍 **CURRENT** ' : '';
          const locked = char.level < r.requiredLevel ? '🔒 *LOCKED*' : '✅ *AVAILABLE*';
          return `${active}**${r.name}**\n• Required Level: ${r.requiredLevel} (${locked})\n• Description: *${r.description}*`;
        }).join('\n\n');

        embed.setDescription(regionList);
        await interaction.editReply({ embeds: [embed] });
      }
      break;
    }

    case 'shop': {
      const sub = options.getSubcommand();
      await interaction.deferReply();

      if (sub === 'browse') {
        const embed = new EmbedBuilder()
          .setColor('#E67E22')
          .setTitle('🛒 Oakhaven Village Shop')
          .setDescription('Items currently in stock. Purchase with `/shop buy item_id: [id] quantity: [qty]`\nSell items with `/shop sell`.')
          .setTimestamp();

        const shopItems = Object.values(GAME_CONFIG.items)
          .filter((i) => i.baseValue > 0) // items that can be bought
          .map((i) => `• **${i.name}** (\`${i.id}\`): **${i.baseValue} Gold** (Sells for: ${i.sellValue} Gold) — *${i.description}*`)
          .join('\n');

        embed.addFields({ name: '🛍️ Shop Inventory', value: shopItems });
        await interaction.editReply({ embeds: [embed] });
      } else if (sub === 'buy') {
        const itemId = options.getString('item_id');
        const quantity = options.getInteger('quantity');

        const itemDef = GAME_CONFIG.items[itemId];
        if (!itemDef || itemDef.baseValue === 0) {
          throw new Error('This item is not sold at the shop.');
        }

        const totalCost = itemDef.baseValue * quantity;
        await EconomyService.removeGold(userId, totalCost, 'BUY_SHOP', `Bought ${quantity}x ${itemId}`);
        await InventoryService.addItem(userId, itemId, quantity);

        await interaction.editReply({
          content: `🛒 Shop purchase complete! Bought **${quantity}x ${itemDef.name}** for **${totalCost.toLocaleString()} Gold**.`
        });
      } else if (sub === 'sell') {
        const itemId = options.getString('item_id');
        const quantity = options.getInteger('quantity');

        const itemDef = GAME_CONFIG.items[itemId];
        if (!itemDef || itemDef.sellValue === 0) {
          throw new Error('This item cannot be sold to the shop.');
        }

        // Verify player owns it
        const owned = await InventoryService.hasItem(userId, itemId, quantity);
        if (!owned) {
          throw new Error(`You do not have ${quantity}x ${itemDef.name} to sell.`);
        }

        await InventoryService.removeItem(userId, itemId, quantity);

        // Apply Merchant sell bonus (+20% gold)
        const char = await CharacterService.getCharacter(userId);
        const classDef = GAME_CONFIG.classes[char.class];
        const multiplier = classDef?.bonuses?.sellPriceMultiplier || 1.0;
        const totalEarnings = Math.floor(itemDef.sellValue * quantity * multiplier);

        await EconomyService.addGold(userId, totalEarnings, 'SELL_SHOP', `Sold ${quantity}x ${itemId}`);

        await interaction.editReply({
          content: `🛒 Sold **${quantity}x ${itemDef.name}** for **${totalEarnings.toLocaleString()} Gold** (Bonus applied: ${Math.round((multiplier - 1) * 100)}%).`
        });

        // Scan achievements
        await AchievementService.checkAchievements(userId);
      }
      break;
    }

    case 'market': {
      const sub = options.getSubcommand();
      await interaction.deferReply();

      if (sub === 'list') {
        const itemId = options.getString('item_id');
        const quantity = options.getInteger('quantity');
        const price = options.getInteger('price');

        const listingId = await MarketplaceService.listItem(userId, itemId, quantity, price);
        const name = GAME_CONFIG.items[itemId]?.name || itemId;

        await interaction.editReply({
          content: `🛒 **Listing Active!** Listed **${quantity}x ${name}** on the marketplace for **${price.toLocaleString()} Gold**. (Listing ID: \`${listingId}\`)`
        });
      } else if (sub === 'browse') {
        const itemId = options.getString('item_id');
        const listings = await MarketplaceService.getListings(itemId ? { itemId } : undefined);

        const embed = new EmbedBuilder()
          .setColor('#9B59B6')
          .setTitle('🛒 Marketplace Board')
          .setDescription('Active player-to-player listings. Buy with `/market buy listing_id: [id]`\n\n')
          .setTimestamp();

        const listText = listings.length > 0
          ? listings.map((l) => {
              const def = GAME_CONFIG.items[l.itemId];
              return `• **${l.quantity}x ${def?.name || l.itemId}** — Listed by <@${l.sellerId}> for **${l.price.toLocaleString()} Gold**\n  Listing ID: \`${l.id}\``;
            }).join('\n\n')
          : 'No active listings found.';

        embed.setDescription(listText);
        await interaction.editReply({ embeds: [embed] });
      } else if (sub === 'buy') {
        const listingId = options.getString('listing_id');
        await MarketplaceService.buyListing(userId, listingId);

        await interaction.editReply({
          content: '🛒 Purchase complete! The items have been delivered to your inventory, and payment sent to the seller.'
        });

        // Scan achievements
        await AchievementService.checkAchievements(userId);
      } else if (sub === 'cancel') {
        const listingId = options.getString('listing_id');
        await MarketplaceService.cancelListing(userId, listingId);

        await interaction.editReply({
          content: '🛒 Listing cancelled. Escrowed items returned to your inventory.'
        });
      }
      break;
    }

    case 'leaderboard': {
      await interaction.deferReply();
      const category = options.getString('category');

      let characters: any[] = [];
      if (category === 'wealth') {
        characters = await prisma.character.findMany({
          orderBy: { gold: 'desc' },
          take: 10
        });
      } else if (category === 'level') {
        characters = await prisma.character.findMany({
          orderBy: [{ level: 'desc' }, { xp: 'desc' }],
          take: 10
        });
      } else if (category === 'reputation') {
        characters = await prisma.character.findMany({
          orderBy: { reputation: 'desc' },
          take: 10
        });
      }

      const embed = new EmbedBuilder()
        .setColor('#F1C40F')
        .setTitle(`🏆 ECLIPSE Leaderboard — ${category.toUpperCase()}`)
        .setDescription(`Top 10 players based on ${category}:`)
        .setTimestamp();

      const lines = characters.map((c, i) => {
        let val = `${c.gold.toLocaleString()} Gold`;
        if (category === 'level') val = `Level ${c.level}`;
        if (category === 'reputation') val = `${c.reputation} Rep`;
        return `**#${i + 1}** ${c.name} — **${val}**`;
      });

      embed.setDescription(lines.join('\n') || '*No characters registered yet.*');
      await interaction.editReply({ embeds: [embed] });
      break;
    }

    case 'achievements': {
      await interaction.deferReply();
      const char = await prisma.character.findUnique({
        where: { id: userId },
        include: { achievements: true }
      });

      const unlockedIds = new Set(char?.achievements.map((a) => a.achievementId));

      const listLines = GAME_CONFIG.achievements.map((ach) => {
        const unlocked = unlockedIds.has(ach.id) ? '🏆 **UNLOCKED**' : '🔒 *LOCKED*';
        return `• **${ach.name}**: *${ach.description}*\n  Reward: **${ach.rewardGold} Gold** (${unlocked})`;
      }).join('\n\n');

      const embed = new EmbedBuilder()
        .setColor('#E74C3C')
        .setTitle('🏆 Achievement Trophy Room')
        .setDescription(listLines)
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      break;
    }

    case 'admin': {
      // Permission Check: Verify admin has MANAGE_GUILD or is bot owner (for simplicity we check developer ID or ADMINISTRATOR permissions)
      const member = interaction.member;
      const isAdmin = member?.permissions?.has('Administrator') || userId === 'dev_showcase_user';

      if (!isAdmin) {
        return interaction.reply({
          content: '❌ **Access Denied:** Only administrators can run admin commands.',
          ephemeral: true
        });
      }

      const sub = options.getSubcommand();
      await interaction.deferReply({ ephemeral: true });

      if (sub === 'give') {
        const targetUser = options.getUser('user');
        const type = options.getString('type');
        const amount = options.getInteger('amount');

        if (type === 'gold') {
          await EconomyService.addGold(targetUser.id, amount, 'ADMIN_ACTION', 'Gained gold via admin action');
          await interaction.editReply({
            content: `✅ Admin command success: Gave **${amount.toLocaleString()} Gold** to <@${targetUser.id}>.`
          });
        } else {
          const itemId = options.getString('item_id');
          if (!itemId) throw new Error('You must specify item_id.');
          await InventoryService.addItem(targetUser.id, itemId, amount);
          await interaction.editReply({
            content: `✅ Admin command success: Gave **${amount}x ${itemId}** to <@${targetUser.id}>.`
          });
        }
      } else if (sub === 'event') {
        const type = options.getString('type');
        const objective = options.getInteger('objective') || 10000;
        await WorldEventService.startEvent(type, objective);

        await interaction.editReply({
          content: `✅ Admin command success: Activated world event **${type}** with target objective **${objective}**.`
        });
      }
      break;
    }

    case 'help': {
      const embed = new EmbedBuilder()
        .setColor('#2ECC71')
        .setTitle('🌌 Welcome to ECLIPSE!')
        .setDescription('ECLIPSE is a deep text-based MMORPG living inside your Discord server.\n\n')
        .addFields(
          { name: '🌲 Core Gameplay Loop', value: '1. Explore using `/explore` to gather raw materials, coins, and trigger discoveries.\n2. Fight wild beasts and enemies in turn-based battles.\n3. Complete quests using `/quests` to level up and unlock new regions.\n4. Craft powerful equipment and potions using `/craft`.' },
          { name: '👤 Specializations', value: 'Create your adventurer using `/start`. Special classes grant bonuses:\n• **Adventurer**: Combat damage boost\n• **Merchant**: Lower market fees, higher selling prices\n• **Explorer**: Increased loot quantities and discovery rates\n• **Blacksmith**: Crafting success buffs\n• **Alchemist**: Alchemy brewing success buffs' },
          { name: '🛒 Player Trade', value: 'List items using `/market list`, buy listed items from players with `/market buy`, or sell your extra materials to the shop keeper via `/shop sell`.' },
          { name: '🛡️ Guilds', value: 'Form guilds using `/guild create`, donate gold to expand your treasury, and purchase upgrades to boost storage, merchant fees, or forge capabilities!' }
        )
        .setFooter({ text: 'May the solar winds guide your blade.' })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
      break;
    }
  }
}

/**
 * Handle turn-based Combat button interactions.
 */
async function handleCombatButton(interaction: any, userId: string) {
  const customId = interaction.customId; // combat_attack, combat_defend, combat_skill, combat_item, combat_flee

  const actionMap: Record<string, 'ATTACK' | 'DEFEND' | 'SKILL' | 'ITEM' | 'FLEE'> = {
    combat_attack: 'ATTACK',
    combat_defend: 'DEFEND',
    combat_skill: 'SKILL',
    combat_item: 'ITEM',
    combat_flee: 'FLEE'
  };

  const action = actionMap[customId];
  if (!action) return;

  // Execute turn action
  let itemIdToUse: string | undefined;
  if (action === 'ITEM') {
    // For simplicity, default to using a health potion
    itemIdToUse = 'health_potion';
  }

  const res = await CombatService.executeAction(userId, action, itemIdToUse);
  const char = await CharacterService.getCharacter(userId);

  if (res.combatState === null) {
    // Battle ended
    let descriptionText = `${res.playerActionLog}\n\n${res.enemyActionLog}`;

    if (res.victory && res.rewards) {
      const rewardItemsText = res.rewards.items.length > 0
        ? res.rewards.items.map((i) => `• **${i.quantity}x ${i.name}**`).join('\n')
        : 'None';

      descriptionText += `\n\n🎁 **Loot Acquired:**\n• **+${res.rewards.gold} Gold Coins**\n• **+${res.rewards.xp} XP Points**\n${rewardItemsText}`;

      // Check quest kills progress
      const questHooks = await QuestService.checkQuestProgress(userId, 'COMBAT', GAME_CONFIG.enemies[char.currentRegion === 'citadel' ? 'eclipse_sentinel' : 'slime'].id); // check kills
      if (questHooks.length > 0) {
        descriptionText += `\n\n` + questHooks.map((q) => q.announcement).join('\n');
      }
    }

    const endEmbed = new EmbedBuilder()
      .setColor(res.victory ? '#43B581' : '#F04747')
      .setTitle(`⚔️ Combat Resolution`)
      .setDescription(descriptionText)
      .setTimestamp();

    const navComponents = UIGenerator.createNavigationComponents();

    await interaction.editReply({
      embeds: [endEmbed],
      components: [navComponents]
    });

    // Check achievements
    await AchievementService.checkAchievements(userId);
  } else {
    // Battle continues
    const enemyDef = GAME_CONFIG.enemies[res.combatState.enemyId];
    const combatEmbed = UIGenerator.createCombatEmbed(enemyDef, res.combatState, char);

    const hasPotions = await InventoryService.hasItem(userId, 'health_potion', 1);
    const combatBtns = UIGenerator.createCombatButtons(hasPotions);

    await interaction.editReply({
      content: `${res.playerActionLog}\n${res.enemyActionLog}`,
      embeds: [combatEmbed],
      components: [combatBtns]
    });
  }
}

/**
 * Handle Navigation Button interactions from profile embed.
 */
async function handleNavigationButton(interaction: any, _userId: string) {
  const customId = interaction.customId; // nav_explore, nav_inventory, nav_quests, nav_market, nav_profile

  // Route to the corresponding slash command logic
  const mockInteraction = {
    commandName: customId.replace('nav_', ''),
    options: {
      getSubcommand: () => 'list',
      getString: () => null,
      getInteger: () => null
    },
    user: interaction.user,
    reply: interaction.followUp.bind(interaction),
    deferReply: async () => {},
    editReply: interaction.editReply.bind(interaction)
  };

  await handleSlashCommand(mockInteraction);
}

// Start client login
const token = process.env.DISCORD_TOKEN;
if (token) {
  client.login(token).catch((err) => {
    logger.error('Failed to log in to Discord REST API. Token might be invalid or unset.', err);
  });
} else {
  logger.warn('DISCORD_TOKEN environment variable not set. Running in headless / CLI-mock mode.');
}
export { client };
