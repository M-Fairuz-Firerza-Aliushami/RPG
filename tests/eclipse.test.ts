import { describe, test, expect, vi, beforeEach } from 'vitest';
import { GAME_CONFIG } from '../src/config/gameConfig';
import { CharacterService } from '../src/services/CharacterService';
import { EconomyService } from '../src/services/EconomyService';
import { InventoryService } from '../src/services/InventoryService';
import { CombatService } from '../src/services/CombatService';
import { CraftingService } from '../src/services/CraftingService';
import { MarketplaceService } from '../src/services/MarketplaceService';

// Mock the database client
vi.mock('../src/database/client', () => {
  const mockPrisma = {
    character: {
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn()
    },
    inventoryItem: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn()
    },
    transactionLog: {
      create: vi.fn()
    },
    playerQuest: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn()
    },
    playerAchievement: {
      findUnique: vi.fn(),
      create: vi.fn()
    },
    marketplaceListing: {
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      findMany: vi.fn()
    },
    $transaction: vi.fn((cb) => cb(mockPrisma))
  };
  return { prisma: mockPrisma };
});

import { prisma } from '../src/database/client';

describe('ECLIPSE Core Systems', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('XP and Level Formulas', () => {
    test('XP Curve matches expected growth', () => {
      // Level 1: 100 * 1^1.5 = 100
      expect(GAME_CONFIG.xpFormula(1)).toBe(100);
      // Level 2: 100 * 2^1.5 = 282
      expect(GAME_CONFIG.xpFormula(2)).toBe(282);
      // Level 10: 100 * 10^1.5 = 3162
      expect(GAME_CONFIG.xpFormula(10)).toBe(3162);
    });

    test('addXp correctly triggers level-ups and overflows remaining XP', async () => {
      const mockChar = { id: 'user1', xp: 50, level: 1, class: 'adventurer', hp: 100 };
      vi.mocked(prisma.character.findUnique).mockResolvedValue(mockChar as any);

      // We need 100 XP to level up. Adding 80 XP: 50 + 80 = 130.
      // 130 >= 100 -> level up to 2. Remaining XP: 130 - 100 = 30.
      const res = await CharacterService.addXp('user1', 80);

      expect(res.leveledUp).toBe(true);
      expect(res.newLevel).toBe(2);
      expect(res.currentXp).toBe(30);
    });
  });

  describe('Economy & Gold Operations', () => {
    test('addGold increments character balance', async () => {
      vi.mocked(prisma.character.findUnique).mockResolvedValue({ id: 'user1', gold: 100 } as any);
      vi.mocked(prisma.character.update).mockResolvedValue({ id: 'user1', gold: 150 } as any);

      const newGold = await EconomyService.addGold('user1', 50, 'QUEST_REWARD');

      expect(newGold).toBe(150);
      expect(prisma.character.update).toHaveBeenCalledWith(expect.objectContaining({
        data: { gold: { increment: 50 } }
      }));
    });

    test('removeGold throws error if balance would go below 0', async () => {
      vi.mocked(prisma.character.findUnique).mockResolvedValue({ id: 'user1', gold: 30 } as any);

      await expect(
        EconomyService.removeGold('user1', 50, 'SHOP_BUY')
      ).rejects.toThrow('Insufficient gold');
    });
  });

  describe('Inventory Stack Management', () => {
    test('addItem merges stack if unequipped stack exists', async () => {
      const existingStack = { id: 'inv1', itemId: 'wood', quantity: 5, equipped: false };
      vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue(existingStack as any);

      await InventoryService.addItem('user1', 'wood', 3);

      expect(prisma.inventoryItem.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'inv1' },
        data: { quantity: { increment: 3 } }
      }));
    });

    test('addItem creates new row if item is equipment or stack limit is 1', async () => {
      // Iron sword has stackLimit = 1
      vi.mocked(prisma.inventoryItem.findFirst).mockResolvedValue(null);

      await InventoryService.addItem('user1', 'iron_sword', 1);

      expect(prisma.inventoryItem.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          itemId: 'iron_sword',
          quantity: 1,
          equipped: false
        })
      }));
    });
  });

  describe('Combat Damage and Turn Logs', () => {
    test('startCombat registers combat state in memory', async () => {
      vi.mocked(prisma.character.findUnique).mockResolvedValue({ id: 'user1', name: 'TestHero', class: 'adventurer', level: 1, xp: 0, gold: 500, energy: 100, hp: 100, lastActiveAt: new Date(), inventory: [] } as any);

      const combat = await CombatService.startCombat('user1', 'slime');

      expect(combat.enemyId).toBe('slime');
      expect(combat.enemyHp).toBe(GAME_CONFIG.enemies.slime.hp);
      expect(combat.playerHp).toBe(100);
    });

    test('executeAction processes turn calculations and enemy counters', async () => {
      vi.mocked(prisma.character.findUnique).mockResolvedValue({
        id: 'user1',
        name: 'Hero',
        class: 'adventurer',
        level: 1,
        strength: 5,
        defense: 5,
        agility: 5,
        intelligence: 5,
        luck: 5,
        hp: 100,
        maxHp: 100,
        lastActiveAt: new Date(),
        inventory: []
      } as any);

      await CombatService.startCombat('user1', 'slime');
      const res = await CombatService.executeAction('user1', 'ATTACK');

      // Player strength is 5. Base strength atk = 5 * 2 = 10.
      // Slime def is 2. Damage = 10 - 2 = 8 (plus/minus variance).
      // Slime hp is 20. Slime should survive and counter attack.
      expect(res.victory).toBe(false);
      expect(res.playerActionLog).toContain('You strike the');
      expect(res.enemyActionLog).toContain('Bouncy Slime');
    });
  });

  describe('Crafting Operations', () => {
    test('craftItem consumes correct ingredients and respects success limits', async () => {
      // Recipe: Smelt Copper Bar needs 3 copper ore and 1 coal
      const mockIngredients = [
        { id: 'inv1', itemId: 'copper_ore', quantity: 10, equipped: false },
        { id: 'inv2', itemId: 'coal', quantity: 5, equipped: false }
      ];
      vi.mocked(prisma.inventoryItem.findMany).mockImplementation(async (args: any) => {
        const itemId = args?.where?.itemId;
        return mockIngredients.filter((item) => item.itemId === itemId) as any;
      });

      vi.mocked(prisma.character.findUnique).mockResolvedValue({
        id: 'user1',
        level: 5,
        intelligence: 10,
        class: 'blacksmith',
        xp: 0,
        hp: 100,
        inventory: []
      } as any);

      // Force Math.random to return 0 to guarantee crafting success
      const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.01);

      const res = await CraftingService.craftItem('user1', 'craft_copper_bar');

      expect(res.success).toBe(true);
      expect(res.resultItemId).toBe('copper_bar');
      expect(prisma.inventoryItem.delete).not.toHaveBeenCalled(); // qty 10 -> decrement, qty 5 -> decrement
      expect(prisma.inventoryItem.update).toHaveBeenCalledTimes(2); // 2 ingredients decremented
      expect(prisma.inventoryItem.create).toHaveBeenCalledTimes(1); // 1 result created

      randomSpy.mockRestore();
    });
  });

  describe('Marketplace Integrity', () => {
    test('listItem escrows item and deducts stack size', async () => {
      const mockItem = { id: 'inv1', itemId: 'iron_ore', quantity: 5, equipped: false };
      vi.mocked(prisma.inventoryItem.findMany).mockResolvedValue([mockItem] as any);
      vi.mocked(prisma.marketplaceListing.create).mockResolvedValue({ id: 'listing_123' } as any);

      const listingId = await MarketplaceService.listItem('user1', 'iron_ore', 3, 100);

      expect(listingId).toBeDefined();
      expect(prisma.inventoryItem.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'inv1' },
        data: { quantity: { decrement: 3 } }
      }));
    });
  });
});
