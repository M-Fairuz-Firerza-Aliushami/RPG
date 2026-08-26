import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding ECLIPSE database...');

  // 1. Create a default active world event (VOLCANIC_SEASON)
  const existingEvent = await prisma.worldEvent.findFirst({
    where: { status: 'ACTIVE' }
  });

  if (!existingEvent) {
    await prisma.worldEvent.create({
      data: {
        type: 'VOLCANIC_SEASON',
        status: 'ACTIVE',
        progress: 1450,
        objective: 10000
      }
    });
    console.log('Created default active world event: VOLCANIC_SEASON');
  }

  // 2. Create some sample guilds if needed
  const existingGuild = await prisma.guild.findUnique({
    where: { name: 'Sol Vanguard' }
  });

  if (!existingGuild) {
    const guild = await prisma.guild.create({
      data: {
        name: 'Sol Vanguard',
        tag: 'SOL',
        description: 'The frontline guardians of the eclipse.',
        treasury: 15000,
        level: 2,
        xp: 1200
      }
    });

    // Create upgrades for the seed guild
    const upgradeTypes = ['storage', 'merchant', 'forge', 'expedition', 'treasury'];
    for (const type of upgradeTypes) {
      await prisma.guildUpgrade.create({
        data: {
          guildId: guild.id,
          type,
          level: type === 'storage' || type === 'treasury' ? 1 : 0
        }
      });
    }
    console.log('Created seed guild: Sol Vanguard [SOL]');
  }

  // 3. Create a developer showcase character
  const devChar = await prisma.character.findUnique({
    where: { id: 'dev_showcase_user' }
  });

  if (!devChar) {
    const char = await prisma.character.create({
      data: {
        id: 'dev_showcase_user',
        name: 'RaiZhu',
        class: 'adventurer',
        level: 27,
        xp: 1840,
        gold: 128540,
        energy: 74,
        hp: 100,
        maxHp: 100,
        strength: 32,
        defense: 32,
        agility: 31,
        intelligence: 31,
        luck: 31,
        currentRegion: 'volcanic'
      }
    });

    // Give them items
    await prisma.inventoryItem.createMany({
      data: [
        { characterId: char.id, itemId: 'volcano_blade', quantity: 1, equipped: true },
        { characterId: char.id, itemId: 'leather_tunic', quantity: 1, equipped: true },
        { characterId: char.id, itemId: 'health_potion', quantity: 5, equipped: false },
        { characterId: char.id, itemId: 'energy_elixir', quantity: 2, equipped: false },
        { characterId: char.id, itemId: 'fire_crystal', quantity: 18, equipped: false },
        { characterId: char.id, itemId: 'coal', quantity: 30, equipped: false }
      ]
    });

    // Discoveries
    await prisma.playerDiscovery.createMany({
      data: [
        { characterId: char.id, regionId: 'village', locationId: 'village_well' },
        { characterId: char.id, regionId: 'village', locationId: 'blacksmith_forge' },
        { characterId: char.id, regionId: 'forest', locationId: 'lost_caravan' }
      ]
    });

    // Quests
    await prisma.playerQuest.create({
      data: {
        characterId: char.id,
        questId: 'lost_merchant',
        status: 'COMPLETED',
        currentStep: 5
      }
    });

    console.log('Created dev showcase character: RaiZhu (Level 27 Adventurer)');
  }

  console.log('Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
