import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import dotenv from 'dotenv';
import { logger } from './utils/logger';

dotenv.config();

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token || !clientId) {
  logger.error('Missing DISCORD_TOKEN or CLIENT_ID environment variables.');
  process.exit(1);
}

const commands = [
  new SlashCommandBuilder()
    .setName('start')
    .setDescription('Begin your adventure in ECLIPSE!')
    .addStringOption((option) =>
      option
        .setName('name')
        .setDescription('Your character name')
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('class')
        .setDescription('Select your specialized class')
        .setRequired(true)
        .addChoices(
          { name: 'Adventurer (Combat Specialist)', value: 'adventurer' },
          { name: 'Merchant (Market Specialist)', value: 'merchant' },
          { name: 'Explorer (Discovery Specialist)', value: 'explorer' },
          { name: 'Blacksmith (Crafting Specialist)', value: 'blacksmith' },
          { name: 'Alchemist (Brewing Specialist)', value: 'alchemist' }
        )
    ),

  new SlashCommandBuilder()
    .setName('profile')
    .setDescription('View your character stats, level, attributes, and location.'),

  new SlashCommandBuilder()
    .setName('explore')
    .setDescription('Explore your current region. Spends energy, yields loot/encounters/discoveries.'),

  new SlashCommandBuilder()
    .setName('inventory')
    .setDescription('View your items, resources, and equipped gear.'),

  new SlashCommandBuilder()
    .setName('quests')
    .setDescription('Manage your active and available quests.')
    .addSubcommand((sub) =>
      sub
        .setName('list')
        .setDescription('List all active and available quests')
    )
    .addSubcommand((sub) =>
      sub
        .setName('start')
        .setDescription('Start a new quest')
        .addStringOption((opt) =>
          opt
            .setName('quest_id')
            .setDescription('ID of the quest to start')
            .setRequired(true)
            .addChoices(
              { name: 'The Lost Merchant', value: 'lost_merchant' },
              { name: 'Forging a Legacy', value: 'forge_request' }
            )
        )
    ),

  new SlashCommandBuilder()
    .setName('market')
    .setDescription('Buy and sell items with other players.')
    .addSubcommand((sub) =>
      sub
        .setName('list')
        .setDescription('List an item from your inventory onto the marketplace')
        .addStringOption((opt) =>
          opt.setName('item_id').setDescription('ID of item to list').setRequired(true)
        )
        .addIntegerOption((opt) =>
          opt.setName('quantity').setDescription('Number of items to list').setRequired(true)
        )
        .addIntegerOption((opt) =>
          opt.setName('price').setDescription('Total price in gold').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('browse')
        .setDescription('Browse active marketplace listings')
        .addStringOption((opt) =>
          opt.setName('item_id').setDescription('Filter by item ID').setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('buy')
        .setDescription('Purchase an active marketplace listing')
        .addStringOption((opt) =>
          opt.setName('listing_id').setDescription('ID of listing to purchase').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('cancel')
        .setDescription('Cancel your active marketplace listing and reclaim items')
        .addStringOption((opt) =>
          opt.setName('listing_id').setDescription('ID of listing to cancel').setRequired(true)
        )
    ),

  new SlashCommandBuilder()
    .setName('shop')
    .setDescription('Buy and sell items with Oakhaven Merchant.')
    .addSubcommand((sub) =>
      sub
        .setName('browse')
        .setDescription('Browse items available for purchase')
    )
    .addSubcommand((sub) =>
      sub
        .setName('buy')
        .setDescription('Buy an item from the shop')
        .addStringOption((opt) =>
          opt.setName('item_id').setDescription('Item ID').setRequired(true)
        )
        .addIntegerOption((opt) =>
          opt.setName('quantity').setDescription('Quantity to purchase').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('sell')
        .setDescription('Sell items from your inventory to the shop')
        .addStringOption((opt) =>
          opt.setName('item_id').setDescription('Item ID').setRequired(true)
        )
        .addIntegerOption((opt) =>
          opt.setName('quantity').setDescription('Quantity to sell').setRequired(true)
        )
    ),

  new SlashCommandBuilder()
    .setName('craft')
    .setDescription('Smelt materials or brew potions.')
    .addStringOption((opt) =>
      opt
        .setName('recipe_id')
        .setDescription('ID of recipe to craft')
        .setRequired(true)
        .addChoices(
          { name: 'Smelt Copper Bar (Mining/Smithing)', value: 'craft_copper_bar' },
          { name: 'Smelt Iron Bar (Mining/Smithing)', value: 'craft_iron_bar' },
          { name: 'Smith Bronze Blade (Weaponry)', value: 'craft_bronze_sword' },
          { name: 'Smith Iron Sword (Weaponry)', value: 'craft_iron_sword' },
          { name: 'Brew Minor Health Potion (Alchemy)', value: 'craft_health_potion' },
          { name: 'Brew Energy Elixir (Alchemy)', value: 'craft_energy_elixir' },
          { name: 'Smith Volcanic Edge (Endgame Weapon)', value: 'craft_volcano_blade' }
        )
    ),

  new SlashCommandBuilder()
    .setName('guild')
    .setDescription('Team up with other players.')
    .addSubcommand((sub) =>
      sub
        .setName('create')
        .setDescription('Create a new guild. Costs 5,000 Gold.')
        .addStringOption((opt) => opt.setName('name').setDescription('Guild Name').setRequired(true))
        .addStringOption((opt) => opt.setName('tag').setDescription('Guild Tag (2-5 letters)').setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName('view')
        .setDescription('View your guild details, members, and treasury')
    )
    .addSubcommand((sub) =>
      sub
        .setName('donate')
        .setDescription('Donate gold coins to the guild treasury')
        .addIntegerOption((opt) => opt.setName('amount').setDescription('Gold amount').setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName('upgrade')
        .setDescription('Upgrade guild assets using treasury gold')
        .addStringOption((opt) =>
          opt
            .setName('asset')
            .setDescription('Select asset to upgrade')
            .setRequired(true)
            .addChoices(
              { name: 'Storage Vault (Forge & Items)', value: 'storage' },
              { name: 'Guild Merchant (Fee reduction)', value: 'merchant' },
              { name: 'Forge (Crafting boost)', value: 'forge' },
              { name: 'Expedition Center (Reputation boost)', value: 'expedition' }
            )
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('leave')
        .setDescription('Leave your current guild')
    ),

  new SlashCommandBuilder()
    .setName('map')
    .setDescription('View all world regions and travel to a new area.')
    .addStringOption((opt) =>
      opt
        .setName('travel_to')
        .setDescription('Select region to travel to')
        .setRequired(false)
        .addChoices(
          { name: 'Oakhaven Village (Lvl 1+)', value: 'village' },
          { name: 'Whispering Forest (Lvl 3+)', value: 'forest' },
          { name: 'Ancient Ruins (Lvl 6+)', value: 'ruins' },
          { name: 'Volcanic Wastes (Lvl 12+)', value: 'volcanic' },
          { name: 'Eclipse Citadel (Lvl 20+)', value: 'citadel' }
        )
    ),

  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('View rankings in level, wealth, and reputation.')
    .addStringOption((opt) =>
      opt
        .setName('category')
        .setDescription('Select metric to rank')
        .setRequired(true)
        .addChoices(
          { name: 'Wealth (Gold coins)', value: 'wealth' },
          { name: 'Level (Adventuring levels)', value: 'level' },
          { name: 'Reputation (Social reputation)', value: 'reputation' }
        )
    ),

  new SlashCommandBuilder()
    .setName('achievements')
    .setDescription('View your unlocked badges and milestone rewards.'),

  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Learn how to play ECLIPSE.'),

  // Admin System commands
  new SlashCommandBuilder()
    .setName('admin')
    .setDescription('Administrator settings and commands.')
    .addSubcommand((sub) =>
      sub
        .setName('give')
        .setDescription('Give gold or items to a player')
        .addUserOption((opt) => opt.setName('user').setDescription('Player user').setRequired(true))
        .addStringOption((opt) => opt.setName('type').setDescription('gold or item').setRequired(true).addChoices(
          { name: 'Gold Coins', value: 'gold' },
          { name: 'Item', value: 'item' }
        ))
        .addIntegerOption((opt) => opt.setName('amount').setDescription('Quantity/Gold amount').setRequired(true))
        .addStringOption((opt) => opt.setName('item_id').setDescription('Item ID (if item type chosen)').setRequired(false))
    )
    .addSubcommand((sub) =>
      sub
        .setName('event')
        .setDescription('Activate a new global world event')
        .addStringOption((opt) =>
          opt
            .setName('type')
            .setDescription('Select event type')
            .setRequired(true)
            .addChoices(
              { name: 'Volcanic Season (Fire Crystal surge)', value: 'VOLCANIC_SEASON' },
              { name: 'Merchant Festival (Listing discount)', value: 'MERCHANTS_FESTIVAL' },
              { name: 'Solar Eclipse (Combat boost)', value: 'ECLIPSE' }
            )
        )
        .addIntegerOption((opt) => opt.setName('objective').setDescription('Global contribution objective').setRequired(false))
    )
].map((command) => command.toJSON());

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    logger.info(`Started refreshing ${commands.length} application (/) commands.`);

    if (guildId) {
      // Register in dev guild immediately
      await rest.put(
        Routes.applicationGuildCommands(clientId, guildId),
        { body: commands }
      );
      logger.info(`Successfully reloaded application (/) commands in Guild ${guildId}.`);
    } else {
      // Register globally
      await rest.put(
        Routes.applicationCommands(clientId),
        { body: commands }
      );
      logger.info('Successfully reloaded application (/) commands globally.');
    }
  } catch (error) {
    logger.error('Error deploying application commands:', error);
  }
})();
