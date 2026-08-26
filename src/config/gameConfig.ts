export interface ClassConfig {
  id: string;
  name: string;
  description: string;
  baseStats: {
    strength: number;
    defense: number;
    agility: number;
    intelligence: number;
    luck: number;
    maxHp: number;
  };
  bonuses: {
    sellPriceMultiplier?: number;
    marketFeeReduction?: number;
    explorationRewardMultiplier?: number;
    rareDiscoverChanceBonus?: number;
    craftingSuccessBonus?: number;
    combatDmgMultiplier?: number;
  };
}

export type ItemRarity = 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC' | 'LEGENDARY' | 'MYTHIC';
export type ItemType = 'MATERIAL' | 'CONSUMABLE' | 'WEAPON' | 'ARMOR' | 'QUEST';

export interface ItemDefinition {
  id: string;
  name: string;
  description: string;
  rarity: ItemRarity;
  type: ItemType;
  stackLimit: number;
  baseValue: number;      // Value to buy from shop
  sellValue: number;      // Value to sell to shop
  requiredLevel: number;
  tradeable: boolean;
  stats?: {
    strength?: number;
    defense?: number;
    agility?: number;
    intelligence?: number;
    luck?: number;
    maxHp?: number;
  };
}

export interface EnemyDefinition {
  id: string;
  name: string;
  description: string;
  level: number;
  hp: number;
  atk: number;
  def: number;
  xpReward: number;
  goldReward: number;
  lootTable: {
    itemId: string;
    chance: number; // 0 to 1
    quantity: [number, number]; // [min, max]
  }[];
}

export interface RegionDefinition {
  id: string;
  name: string;
  description: string;
  requiredLevel: number;
  recommendedLevel: number;
  energyCost: number;
  discoveries: { id: string; name: string; chance: number; description: string }[];
  explorationLoot: {
    itemId: string;
    chance: number; // 0 to 1
    quantity: [number, number];
  }[];
  enemies: string[]; // Enemy IDs
}

export interface RecipeDefinition {
  id: string;
  name: string;
  description: string;
  profession: 'SMITHING' | 'ALCHEMY' | 'CRAFTING';
  requiredLevel: number;
  ingredients: { itemId: string; quantity: number }[];
  resultItemId: string;
  resultQuantity: number;
  successChance: number; // 0 to 1
}

export interface QuestStep {
  stepIndex: number;
  description: string;
  type: 'EXPLORE' | 'GATHER' | 'COMBAT' | 'DELIVER' | 'GOLD';
  targetId?: string; // enemy id, item id, or region id
  targetCount?: number;
  textChoiceBranching?: {
    choices: { text: string; branchToStep: number; dialog: string }[];
  };
}

export interface QuestDefinition {
  id: string;
  name: string;
  description: string;
  requiredLevel: number;
  requiredQuestId?: string;
  steps: QuestStep[];
  rewards: {
    gold: number;
    xp: number;
    items?: { itemId: string; quantity: number }[];
    reputation: number;
  };
}

export interface AchievementDefinition {
  id: string;
  name: string;
  description: string;
  category: 'WEALTH' | 'EXPLORATION' | 'QUESTS' | 'MARKET' | 'GUILD' | 'COMBAT';
  targetValue: number;
  rewardGold: number;
  rewardTitle?: string;
}

export const GAME_CONFIG = {
  xpFormula: (level: number): number => {
    return Math.floor(100 * Math.pow(level, 1.5));
  },
  energyRecoveryPerHour: 10,
  maxEnergy: 100,

  classes: {
    adventurer: {
      id: 'adventurer',
      name: 'Adventurer',
      description: 'Balanced class, deals increased damage in combat.',
      baseStats: { strength: 6, defense: 6, agility: 5, intelligence: 5, luck: 5, maxHp: 110 },
      bonuses: { combatDmgMultiplier: 1.15 }
    },
    merchant: {
      id: 'merchant',
      name: 'Merchant',
      description: 'Master of trade. Gets better shop prices and lower marketplace fees.',
      baseStats: { strength: 4, defense: 5, agility: 5, intelligence: 6, luck: 7, maxHp: 90 },
      bonuses: { sellPriceMultiplier: 1.20, marketFeeReduction: 0.5 }
    },
    explorer: {
      id: 'explorer',
      name: 'Explorer',
      description: 'Specializes in mapping the world. Better explore rewards and higher discovery rates.',
      baseStats: { strength: 5, defense: 4, agility: 7, intelligence: 5, luck: 6, maxHp: 95 },
      bonuses: { explorationRewardMultiplier: 1.25, rareDiscoverChanceBonus: 1.20 }
    },
    blacksmith: {
      id: 'blacksmith',
      name: 'Blacksmith',
      description: 'Crafting specialist. Enhanced success rate and item customization.',
      baseStats: { strength: 7, defense: 7, agility: 4, intelligence: 4, luck: 5, maxHp: 105 },
      bonuses: { craftingSuccessBonus: 0.15 }
    },
    alchemist: {
      id: 'alchemist',
      name: 'Alchemist',
      description: 'Proficient in brewing and magic stats. Extra Intelligence.',
      baseStats: { strength: 4, defense: 4, agility: 5, intelligence: 8, luck: 6, maxHp: 90 },
      bonuses: { craftingSuccessBonus: 0.10 }
    }
  } as Record<string, ClassConfig>,

  items: {
    // Materials
    wood: { id: 'wood', name: 'Oak Wood', description: 'Basic crafting material.', rarity: 'COMMON', type: 'MATERIAL', stackLimit: 99, baseValue: 10, sellValue: 4, requiredLevel: 1, tradeable: true },
    stone: { id: 'stone', name: 'Rough Stone', description: 'Simple stone used for blacksmithing.', rarity: 'COMMON', type: 'MATERIAL', stackLimit: 99, baseValue: 10, sellValue: 4, requiredLevel: 1, tradeable: true },
    copper_ore: { id: 'copper_ore', name: 'Copper Ore', description: 'Common raw metal ore.', rarity: 'COMMON', type: 'MATERIAL', stackLimit: 99, baseValue: 20, sellValue: 8, requiredLevel: 1, tradeable: true },
    iron_ore: { id: 'iron_ore', name: 'Iron Ore', description: 'Sturdy metal ore.', rarity: 'UNCOMMON', type: 'MATERIAL', stackLimit: 99, baseValue: 40, sellValue: 18, requiredLevel: 5, tradeable: true },
    coal: { id: 'coal', name: 'Coal', description: 'Fuel source used in smelting.', rarity: 'COMMON', type: 'MATERIAL', stackLimit: 99, baseValue: 15, sellValue: 6, requiredLevel: 1, tradeable: true },
    copper_bar: { id: 'copper_bar', name: 'Copper Bar', description: 'Refined copper ingot.', rarity: 'COMMON', type: 'MATERIAL', stackLimit: 99, baseValue: 50, sellValue: 22, requiredLevel: 1, tradeable: true },
    iron_bar: { id: 'iron_bar', name: 'Iron Bar', description: 'Refined iron ingot.', rarity: 'UNCOMMON', type: 'MATERIAL', stackLimit: 99, baseValue: 100, sellValue: 45, requiredLevel: 5, tradeable: true },
    fire_crystal: { id: 'fire_crystal', name: 'Fire Crystal', description: 'A glowing hot crystal found in volcanic regions.', rarity: 'RARE', type: 'MATERIAL', stackLimit: 99, baseValue: 300, sellValue: 120, requiredLevel: 10, tradeable: true },
    obsidian: { id: 'obsidian', name: 'Obsidian Shard', description: 'Extremely sharp volcanic glass.', rarity: 'EPIC', type: 'MATERIAL', stackLimit: 99, baseValue: 800, sellValue: 350, requiredLevel: 15, tradeable: true },
    star_dust: { id: 'star_dust', name: 'Star Dust', description: 'Sparkling celestial particles.', rarity: 'LEGENDARY', type: 'MATERIAL', stackLimit: 99, baseValue: 2000, sellValue: 900, requiredLevel: 20, tradeable: true },
    eclipse_shard: { id: 'eclipse_shard', name: 'Eclipse Shard', description: 'A shard radiating pure stellar energy.', rarity: 'MYTHIC', type: 'MATERIAL', stackLimit: 10, baseValue: 10000, sellValue: 4500, requiredLevel: 25, tradeable: true },

    // Consumables
    health_potion: { id: 'health_potion', name: 'Minor Health Potion', description: 'Restores 30 HP.', rarity: 'COMMON', type: 'CONSUMABLE', stackLimit: 20, baseValue: 30, sellValue: 10, requiredLevel: 1, tradeable: true },
    energy_elixir: { id: 'energy_elixir', name: 'Energy Elixir', description: 'Restores 25 Energy.', rarity: 'UNCOMMON', type: 'CONSUMABLE', stackLimit: 10, baseValue: 100, sellValue: 35, requiredLevel: 1, tradeable: true },
    phoenix_feather: { id: 'phoenix_feather', name: 'Phoenix Feather', description: 'Revives character with 50% HP during combat.', rarity: 'RARE', type: 'CONSUMABLE', stackLimit: 5, baseValue: 500, sellValue: 150, requiredLevel: 5, tradeable: true },

    // Equipment - Weapons
    rusted_sword: { id: 'rusted_sword', name: 'Rusted Sword', description: 'Barely functional blade.', rarity: 'COMMON', type: 'WEAPON', stackLimit: 1, baseValue: 50, sellValue: 15, requiredLevel: 1, tradeable: true, stats: { strength: 2 } },
    bronze_sword: { id: 'bronze_sword', name: 'Bronze Blade', description: 'Reliable entry weapon.', rarity: 'COMMON', type: 'WEAPON', stackLimit: 1, baseValue: 150, sellValue: 50, requiredLevel: 3, tradeable: true, stats: { strength: 5, agility: 1 } },
    iron_sword: { id: 'iron_sword', name: 'Iron Broadsword', description: 'Heavy and hard-hitting.', rarity: 'UNCOMMON', type: 'WEAPON', stackLimit: 1, baseValue: 450, sellValue: 150, requiredLevel: 7, tradeable: true, stats: { strength: 12, defense: 2 } },
    volcano_blade: { id: 'volcano_blade', name: 'Volcanic Edge', description: 'Forged in volcanic depths. Scorches foes.', rarity: 'EPIC', type: 'WEAPON', stackLimit: 1, baseValue: 3500, sellValue: 1200, requiredLevel: 15, tradeable: true, stats: { strength: 30, luck: 8 } },
    eclipse_calibur: { id: 'eclipse_calibur', name: 'Eclipse Calibur', description: 'The legendary weapon of the eclipse champion.', rarity: 'MYTHIC', type: 'WEAPON', stackLimit: 1, baseValue: 25000, sellValue: 10000, requiredLevel: 25, tradeable: true, stats: { strength: 75, agility: 20, luck: 15 } },

    // Equipment - Armors
    leather_tunic: { id: 'leather_tunic', name: 'Leather Tunic', description: 'Light protection.', rarity: 'COMMON', type: 'ARMOR', stackLimit: 1, baseValue: 80, sellValue: 25, requiredLevel: 1, tradeable: true, stats: { defense: 3, agility: 2 } },
    iron_chestplate: { id: 'iron_chestplate', name: 'Iron Plate', description: 'Solid protection.', rarity: 'UNCOMMON', type: 'ARMOR', stackLimit: 1, baseValue: 500, sellValue: 180, requiredLevel: 8, tradeable: true, stats: { defense: 14, strength: -2 } },
    eclipse_cloak: { id: 'eclipse_cloak', name: 'Cloak of the Eclipse', description: 'A mystical cloak that bends light.', rarity: 'LEGENDARY', type: 'ARMOR', stackLimit: 1, baseValue: 12000, sellValue: 4500, requiredLevel: 20, tradeable: true, stats: { defense: 35, agility: 25, intelligence: 15 } },

    // Quest Items
    merchant_ledger: { id: 'merchant_ledger', name: 'Lost Merchant Ledger', description: 'A waterlogged logbook belonging to a caravan merchant.', rarity: 'COMMON', type: 'QUEST', stackLimit: 1, baseValue: 0, sellValue: 0, requiredLevel: 1, tradeable: false },
    ancient_artifact: { id: 'ancient_artifact', name: 'Ancient Core', description: 'A glowing magical core recovered from ruins.', rarity: 'RARE', type: 'QUEST', stackLimit: 1, baseValue: 0, sellValue: 0, requiredLevel: 5, tradeable: false }
  } as Record<string, ItemDefinition>,

  recipes: [
    { id: 'craft_copper_bar', name: 'Smelt Copper Bar', description: 'Smelt 3 Copper Ore and 1 Coal into a Copper Bar.', profession: 'SMITHING', requiredLevel: 1, ingredients: [{ itemId: 'copper_ore', quantity: 3 }, { itemId: 'coal', quantity: 1 }], resultItemId: 'copper_bar', resultQuantity: 1, successChance: 0.95 },
    { id: 'craft_iron_bar', name: 'Smelt Iron Bar', description: 'Smelt 3 Iron Ore and 1 Coal into an Iron Bar.', profession: 'SMITHING', requiredLevel: 5, ingredients: [{ itemId: 'iron_ore', quantity: 3 }, { itemId: 'coal', quantity: 1 }], resultItemId: 'iron_bar', resultQuantity: 1, successChance: 0.85 },
    { id: 'craft_bronze_sword', name: 'Smith Bronze Blade', description: 'Smith a blade from 3 Copper Bars and 1 Wood.', profession: 'SMITHING', requiredLevel: 3, ingredients: [{ itemId: 'copper_bar', quantity: 3 }, { itemId: 'wood', quantity: 1 }], resultItemId: 'bronze_sword', resultQuantity: 1, successChance: 0.90 },
    { id: 'craft_iron_sword', name: 'Smith Iron Sword', description: 'Smith a sword from 4 Iron Bars and 2 Wood.', profession: 'SMITHING', requiredLevel: 7, ingredients: [{ itemId: 'iron_bar', quantity: 4 }, { itemId: 'wood', quantity: 2 }], resultItemId: 'iron_sword', resultQuantity: 1, successChance: 0.80 },
    { id: 'craft_health_potion', name: 'Brew Minor Health Potion', description: 'Brew 2 Wood and 1 Copper Ore (for trace minerals!) into a Health Potion.', profession: 'ALCHEMY', requiredLevel: 1, ingredients: [{ itemId: 'wood', quantity: 2 }, { itemId: 'copper_ore', quantity: 1 }], resultItemId: 'health_potion', resultQuantity: 1, successChance: 0.95 },
    { id: 'craft_energy_elixir', name: 'Brew Energy Elixir', description: 'Brew 1 Fire Crystal and 1 Wood into an Energy Elixir.', profession: 'ALCHEMY', requiredLevel: 8, ingredients: [{ itemId: 'fire_crystal', quantity: 1 }, { itemId: 'wood', quantity: 1 }], resultItemId: 'energy_elixir', resultQuantity: 1, successChance: 0.80 },
    { id: 'craft_volcano_blade', name: 'Smith Volcanic Edge', description: 'Smith an incredibly powerful blade from 5 Iron Bars, 3 Fire Crystals, and 2 Obsidian Shards.', profession: 'SMITHING', requiredLevel: 15, ingredients: [{ itemId: 'iron_bar', quantity: 5 }, { itemId: 'fire_crystal', quantity: 3 }, { itemId: 'obsidian', quantity: 2 }], resultItemId: 'volcano_blade', resultQuantity: 1, successChance: 0.70 }
  ] as RecipeDefinition[],

  enemies: {
    slime: { id: 'slime', name: 'Bouncy Slime', description: 'A squishy blob that gets in the way.', level: 1, hp: 20, atk: 4, def: 2, xpReward: 12, goldReward: 5, lootTable: [{ itemId: 'health_potion', chance: 0.15, quantity: [1, 1] }] },
    forest_wolf: { id: 'forest_wolf', name: 'Whispering Wolf', description: 'A feral wolf hiding in the shadows.', level: 3, hp: 45, atk: 8, def: 4, xpReward: 25, goldReward: 12, lootTable: [{ itemId: 'wood', chance: 0.40, quantity: [1, 2] }] },
    ruin_goblin: { id: 'ruin_goblin', name: 'Ruin Scavenger', description: 'A sneaky goblin collecting shinies.', level: 5, hp: 60, atk: 12, def: 6, xpReward: 45, goldReward: 25, lootTable: [{ itemId: 'copper_ore', chance: 0.50, quantity: [1, 3] }, { itemId: 'coal', chance: 0.30, quantity: [1, 2] }] },
    ancient_golem: { id: 'ancient_golem', name: 'Ruin Golem', description: 'A massive stone golem guarding ancient secrets.', level: 8, hp: 120, atk: 22, def: 18, xpReward: 90, goldReward: 60, lootTable: [{ itemId: 'stone', chance: 0.80, quantity: [2, 5] }, { itemId: 'iron_ore', chance: 0.40, quantity: [1, 2] }] },
    lava_slinger: { id: 'lava_slinger', name: 'Lava Slinger', description: 'An elemental beast that throws molten rocks.', level: 12, hp: 180, atk: 35, def: 20, xpReward: 200, goldReward: 120, lootTable: [{ itemId: 'fire_crystal', chance: 0.35, quantity: [1, 1] }, { itemId: 'coal', chance: 0.50, quantity: [1, 3] }] },
    obsidian_elemental: { id: 'obsidian_elemental', name: 'Obsidian Colossus', description: 'A lumbering giant of pure volcanic glass.', level: 17, hp: 300, atk: 55, def: 45, xpReward: 450, goldReward: 250, lootTable: [{ itemId: 'obsidian', chance: 0.40, quantity: [1, 2] }, { itemId: 'fire_crystal', chance: 0.60, quantity: [1, 2] }] },
    eclipse_sentinel: { id: 'eclipse_sentinel', name: 'Eclipse Sentinel', description: 'A powerful guardian clad in shadow plate.', level: 23, hp: 500, atk: 90, def: 75, xpReward: 1200, goldReward: 800, lootTable: [{ itemId: 'star_dust', chance: 0.50, quantity: [1, 2] }, { itemId: 'eclipse_shard', chance: 0.05, quantity: [1, 1] }] }
  } as Record<string, EnemyDefinition>,

  regions: {
    village: {
      id: 'village',
      name: 'Oakhaven Village',
      description: 'A peaceful village nestled in a lush valley. Safe and welcoming.',
      requiredLevel: 1,
      recommendedLevel: 1,
      energyCost: 2,
      discoveries: [
        { id: 'village_well', name: 'Old Village Well', chance: 0.15, description: 'You peer down the well and spot a faint glitter in the bucket. Gold!' },
        { id: 'blacksmith_forge', name: 'Oakhaven Forge', chance: 0.20, description: 'You visit the local blacksmith and gain some crafting advice.' }
      ],
      explorationLoot: [
        { itemId: 'wood', chance: 0.50, quantity: [1, 2] },
        { itemId: 'stone', chance: 0.40, quantity: [1, 2] },
        { itemId: 'health_potion', chance: 0.10, quantity: [1, 1] }
      ],
      enemies: ['slime']
    },
    forest: {
      id: 'forest',
      name: 'Whispering Forest',
      description: 'Looming trees and strange sounds. Wolves and bandits lurk.',
      requiredLevel: 3,
      recommendedLevel: 4,
      energyCost: 4,
      discoveries: [
        { id: 'lost_caravan', name: 'Overturned Caravan', chance: 0.12, description: 'You find a broken caravan with a merchant ledger inside!' },
        { id: 'mystic_clearing', name: 'Mystic Clearing', chance: 0.08, description: 'A glowing spring restores your energy!' }
      ],
      explorationLoot: [
        { itemId: 'wood', chance: 0.60, quantity: [2, 4] },
        { itemId: 'copper_ore', chance: 0.35, quantity: [1, 2] },
        { itemId: 'coal', chance: 0.25, quantity: [1, 2] }
      ],
      enemies: ['slime', 'forest_wolf']
    },
    ruins: {
      id: 'ruins',
      name: 'Ancient Ruins',
      description: 'Mysterious stone pillars of a collapsed empire. Brimming with magic and danger.',
      requiredLevel: 6,
      recommendedLevel: 7,
      energyCost: 6,
      discoveries: [
        { id: 'sunken_vault', name: 'Sunken Vault', chance: 0.10, description: 'You find a hidden chest containing old relic weapons!' },
        { id: 'golem_altar', name: 'Golem Altar', chance: 0.15, description: 'An inactive stone heart sits on a pedestal.' }
      ],
      explorationLoot: [
        { itemId: 'stone', chance: 0.50, quantity: [2, 5] },
        { itemId: 'iron_ore', chance: 0.40, quantity: [1, 3] },
        { itemId: 'coal', chance: 0.40, quantity: [1, 3] }
      ],
      enemies: ['ruin_goblin', 'ancient_golem']
    },
    volcanic: {
      id: 'volcanic',
      name: 'Volcanic Wastes',
      description: 'A desolate wasteland covered in cracked obsidian and flowing lava.',
      requiredLevel: 12,
      recommendedLevel: 14,
      energyCost: 8,
      discoveries: [
        { id: 'magma_chamber', name: 'Hidden Magma Chamber', chance: 0.08, description: 'An extremely hot cave packed with fire crystals.' }
      ],
      explorationLoot: [
        { itemId: 'coal', chance: 0.60, quantity: [2, 6] },
        { itemId: 'fire_crystal', chance: 0.35, quantity: [1, 2] },
        { itemId: 'obsidian', chance: 0.20, quantity: [1, 1] }
      ],
      enemies: ['lava_slinger', 'obsidian_elemental']
    },
    citadel: {
      id: 'citadel',
      name: 'Eclipse Citadel',
      description: 'A dark fortress floating in a perpetual twilight sky. The ultimate challenge.',
      requiredLevel: 20,
      recommendedLevel: 22,
      energyCost: 10,
      discoveries: [
        { id: 'throne_room', name: 'Grand Eclipse Throne', chance: 0.05, description: 'You stand before the throne of twilight, feeling a great presence.' }
      ],
      explorationLoot: [
        { itemId: 'fire_crystal', chance: 0.40, quantity: [1, 3] },
        { itemId: 'obsidian', chance: 0.30, quantity: [1, 2] },
        { itemId: 'star_dust', chance: 0.25, quantity: [1, 2] },
        { itemId: 'eclipse_shard', chance: 0.05, quantity: [1, 1] }
      ],
      enemies: ['eclipse_sentinel']
    }
  } as Record<string, RegionDefinition>,

  quests: [
    {
      id: 'lost_merchant',
      name: 'The Lost Merchant',
      description: 'A village merchant asks you to find his lost shipping ledger in the Whispering Forest.',
      requiredLevel: 3,
      steps: [
        { stepIndex: 0, description: 'Explore the Whispering Forest and search for the Overturned Caravan.', type: 'EXPLORE', targetId: 'forest' },
        {
          stepIndex: 1,
          description: 'A shadowy figure guards the ledger. Make a choice:',
          type: 'DELIVER', // custom branch
          textChoiceBranching: {
            choices: [
              { text: 'Pay 100 gold to buy it back', branchToStep: 2, dialog: 'You hand over 100 gold. The thief grins and tosses you the ledger.' },
              { text: 'Fight the thief (Defeat Forest Wolf)', branchToStep: 3, dialog: 'You draw your weapon. The thief whistles, summoning a whispering wolf!' }
            ]
          }
        },
        { stepIndex: 2, description: 'Return the ledger to the village merchant.', type: 'DELIVER', targetId: 'merchant_ledger' },
        { stepIndex: 3, description: 'Defeat the wolf and recover the ledger.', type: 'COMBAT', targetId: 'forest_wolf' },
        { stepIndex: 4, description: 'Return the ledger to the merchant.', type: 'DELIVER', targetId: 'merchant_ledger' }
      ],
      rewards: { gold: 300, xp: 150, reputation: 15, items: [{ itemId: 'health_potion', quantity: 2 }] }
    },
    {
      id: 'forge_request',
      name: 'Forging a Legacy',
      description: 'The blacksmith needs copper bars and iron ore to construct weapons for the village guard.',
      requiredLevel: 5,
      requiredQuestId: 'lost_merchant',
      steps: [
        { stepIndex: 0, description: 'Gather 3 Copper Bars and 5 Iron Ores.', type: 'GATHER', targetId: 'copper_bar', targetCount: 3 },
        { stepIndex: 1, description: 'Deliver the materials to the forge.', type: 'DELIVER', targetId: 'iron_ore', targetCount: 5 }
      ],
      rewards: { gold: 800, xp: 400, reputation: 25, items: [{ itemId: 'iron_sword', quantity: 1 }] }
    }
  ] as QuestDefinition[],

  achievements: [
    { id: 'first_fortune', name: 'First Fortune', description: 'Earn 10,000 Gold.', category: 'WEALTH', targetValue: 10000, rewardGold: 500, rewardTitle: 'Fledgling' },
    { id: 'millionaire', name: 'Millionaire', description: 'Earn 1,000,000 Gold.', category: 'WEALTH', targetValue: 1000000, rewardGold: 25000, rewardTitle: 'Tycoon' },
    { id: 'deep_explorer', name: 'Deep Explorer', description: 'Discover 3 unique locations.', category: 'EXPLORATION', targetValue: 3, rewardGold: 1000, rewardTitle: 'Cartographer' },
    { id: 'world_traveler', name: 'World Traveler', description: 'Discover 6 unique locations.', category: 'EXPLORATION', targetValue: 6, rewardGold: 5000, rewardTitle: 'Pathfinder' },
    { id: 'quest_helper', name: 'Village Helper', description: 'Complete 2 quests.', category: 'QUESTS', targetValue: 2, rewardGold: 1000, rewardTitle: 'Heroic' }
  ] as AchievementDefinition[],

  events: [
    { id: 'strange_rain', name: '🌧️ Strange Rain', description: '+20% gathering rewards.', durationMinutes: 60, modifiers: { explorationRewardMult: 1.2 } },
    { id: 'merchant_festival', name: '💰 Merchant Festival', description: 'Marketplace listing fees are halved.', durationMinutes: 45, modifiers: { marketFeeMult: 0.5 } },
    { id: 'eclipse', name: '🌑 Solar Eclipse', description: 'Dark power rises. Combat rewards increased by 50%.', durationMinutes: 30, modifiers: { combatXpMult: 1.5, combatGoldMult: 1.5 } }
  ]
};
