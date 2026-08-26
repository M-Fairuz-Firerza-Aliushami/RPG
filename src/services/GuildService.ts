import { prisma } from '../database/client';
import { logger } from '../utils/logger';

export class GuildService {
  /**
   * Creates a new guild. Costs 5,000 Gold.
   */
  static async createGuild(
    leaderId: string,
    name: string,
    tag: string
  ): Promise<string> {
    const cleanTag = tag.toUpperCase();
    if (cleanTag.length < 2 || cleanTag.length > 5) {
      throw new Error('Guild tag must be between 2 and 5 characters.');
    }
    if (name.length < 3 || name.length > 25) {
      throw new Error('Guild name must be between 3 and 25 characters.');
    }

    return await prisma.$transaction(async (tx) => {
      // 1. Verify not in a guild
      const member = await tx.guildMember.findUnique({
        where: { characterId: leaderId }
      });
      if (member) {
        throw new Error('You are already in a guild! Leave your current guild first.');
      }

      // Check name uniqueness
      const existingName = await tx.guild.findUnique({ where: { name } });
      if (existingName) throw new Error(`Guild name "${name}" is already taken.`);

      const existingTag = await tx.guild.findUnique({ where: { tag: cleanTag } });
      if (existingTag) throw new Error(`Guild tag "${cleanTag}" is already taken.`);

      // 2. Charge 5,000 Gold
      const char = await tx.character.findUnique({ where: { id: leaderId } });
      if (!char || char.gold < 5000) {
        throw new Error(`Creating a guild costs 5,000 Gold. You only have ${char?.gold || 0} Gold.`);
      }

      await tx.character.update({
        where: { id: leaderId },
        data: { gold: { decrement: 5000 } }
      });

      await tx.transactionLog.create({
        data: {
          characterId: leaderId,
          type: 'GUILD_DONATE',
          goldDelta: -5000,
          details: `Created guild ${name} [${cleanTag}]`
        }
      });

      // 3. Create guild
      const guild = await tx.guild.create({
        data: {
          name,
          tag: cleanTag,
          treasury: 0
        }
      });

      // 4. Add leader as member
      await tx.guildMember.create({
        data: {
          guildId: guild.id,
          characterId: leaderId,
          role: 'LEADER'
        }
      });

      // Initialize default upgrades
      const upgradeTypes = ['storage', 'merchant', 'forge', 'expedition', 'treasury'];
      for (const type of upgradeTypes) {
        await tx.guildUpgrade.create({
          data: {
            guildId: guild.id,
            type,
            level: 0
          }
        });
      }

      logger.info(`Guild created: ${name} [${cleanTag}] by ${leaderId}`);
      return guild.id;
    });
  }

  /**
   * Adds a member to the guild.
   */
  static async joinGuild(characterId: string, guildId: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.guildMember.findUnique({ where: { characterId } });
      if (existing) throw new Error('You are already in a guild.');

      const guild = await tx.guild.findUnique({ where: { id: guildId } });
      if (!guild) throw new Error('Guild not found.');

      await tx.guildMember.create({
        data: {
          guildId,
          characterId,
          role: 'MEMBER'
        }
      });
      logger.info(`Character ${characterId} joined Guild ${guildId}`);
    });
  }

  /**
   * Leaves the guild. Disbands it if leader and sole member.
   */
  static async leaveGuild(characterId: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const member = await tx.guildMember.findUnique({
        where: { characterId },
        include: { guild: { include: { members: true } } }
      });

      if (!member) throw new Error('You are not in a guild.');

      const guild = member.guild;

      if (member.role === 'LEADER') {
        if (guild.members.length === 1) {
          // Disband guild
          await tx.guild.delete({ where: { id: guild.id } });
          logger.info(`Guild ${guild.name} disbanded by leader leaving.`);
          return;
        } else {
          // Find next member to make leader
          const nextLeader = guild.members.find((m) => m.characterId !== characterId);
          if (nextLeader) {
            await tx.guildMember.update({
              where: { id: nextLeader.id },
              data: { role: 'LEADER' }
            });
            logger.info(`Guild leadership of ${guild.name} transferred to ${nextLeader.characterId}`);
          }
        }
      }

      await tx.guildMember.delete({ where: { id: member.id } });
      logger.info(`Character ${characterId} left Guild ${guild.name}`);
    });
  }

  /**
   * Donate gold to the guild treasury.
   */
  static async donateGold(characterId: string, amount: number): Promise<number> {
    if (amount <= 0) throw new Error('Amount must be positive.');

    return await prisma.$transaction(async (tx) => {
      const member = await tx.guildMember.findUnique({
        where: { characterId }
      });

      if (!member) throw new Error('You are not in a guild.');

      const char = await tx.character.findUnique({ where: { id: characterId } });
      if (!char || char.gold < amount) throw new Error('Insufficient gold to donate.');

      await tx.character.update({
        where: { id: characterId },
        data: { gold: { decrement: amount } }
      });

      await tx.guild.update({
        where: { id: member.guildId },
        data: { treasury: { increment: amount } }
      });

      await tx.transactionLog.create({
        data: {
          characterId,
          type: 'GUILD_DONATE',
          goldDelta: -amount,
          details: `Donated to guild ${member.guildId}`
        }
      });

      logger.info(`Character ${characterId} donated ${amount} gold to guild ${member.guildId}`);

      const updatedGuild = await tx.guild.findUnique({
        where: { id: member.guildId },
        select: { treasury: true }
      });

      return updatedGuild?.treasury || 0;
    });
  }

  /**
   * Upgrades a guild asset. Costs: 2000 * (level + 1) from treasury.
   */
  static async upgradeAsset(characterId: string, upgradeType: string): Promise<number> {
    const cleanType = upgradeType.toLowerCase();

    return await prisma.$transaction(async (tx) => {
      const member = await tx.guildMember.findUnique({
        where: { characterId }
      });

      if (!member) throw new Error('You are not in a guild.');
      if (member.role !== 'LEADER' && member.role !== 'OFFICER') {
        throw new Error('Only the Guild Leader or Officers can upgrade assets.');
      }

      const guild = await tx.guild.findUnique({
        where: { id: member.guildId },
        include: { upgrades: true }
      });

      if (!guild) throw new Error('Guild not found.');

      const upgrade = guild.upgrades.find((up) => up.type === cleanType);
      if (!upgrade) throw new Error(`Invalid upgrade type: ${upgradeType}`);

      const cost = 2000 * (upgrade.level + 1);
      if (guild.treasury < cost) {
        throw new Error(`Upgrading ${cleanType} to level ${upgrade.level + 1} costs ${cost} Guild Gold. Treasury: ${guild.treasury} Gold.`);
      }

      // Deduct gold and upgrade level
      await tx.guild.update({
        where: { id: guild.id },
        data: { treasury: { decrement: cost } }
      });

      const updatedUpgrade = await tx.guildUpgrade.update({
        where: { id: upgrade.id },
        data: { level: { increment: 1 } },
        select: { level: true }
      });

      logger.info(`Guild ${guild.name} upgraded ${cleanType} to level ${updatedUpgrade.level}`);
      return updatedUpgrade.level;
    });
  }

  /**
   * Fetches guild profile details.
   */
  static async getGuildDetails(characterId: string) {
    const member = await prisma.guildMember.findUnique({
      where: { characterId }
    });

    if (!member) return null;

    return await prisma.guild.findUnique({
      where: { id: member.guildId },
      include: {
        members: {
          include: { character: true }
        },
        upgrades: true
      }
    });
  }
}
