import { prisma } from '../database/client';
import { GAME_CONFIG } from '../config/gameConfig';
import { logger } from '../utils/logger';

export class MarketplaceService {
  /**
   * Lists an item on the marketplace. Escrows the item immediately.
   */
  static async listItem(
    sellerId: string,
    itemId: string,
    quantity: number,
    price: number
  ): Promise<string> {
    if (quantity <= 0) throw new Error('Quantity must be greater than 0');
    if (price <= 0) throw new Error('Price must be greater than 0');

    const itemDef = GAME_CONFIG.items[itemId];
    if (!itemDef) throw new Error(`Item ${itemId} does not exist`);
    if (!itemDef.tradeable) throw new Error('This item cannot be traded on the marketplace.');

    return await prisma.$transaction(async (tx) => {
      // 1. Verify seller has items in inventory
      // We search for unequipped items
      const items = await tx.inventoryItem.findMany({
        where: { characterId: sellerId, itemId, equipped: false }
      });

      const totalOwned = items.reduce((acc, item) => acc + item.quantity, 0);
      if (totalOwned < quantity) {
        throw new Error(`Insufficient items to list. Owned: ${totalOwned}, Required: ${quantity}`);
      }

      // 2. Remove items from seller inventory (Escrow)
      let remainingToRemove = quantity;
      for (const item of items) {
        if (remainingToRemove <= 0) break;

        if (item.quantity <= remainingToRemove) {
          remainingToRemove -= item.quantity;
          await tx.inventoryItem.delete({ where: { id: item.id } });
        } else {
          await tx.inventoryItem.update({
            where: { id: item.id },
            data: { quantity: { decrement: remainingToRemove } }
          });
          remainingToRemove = 0;
        }
      }

      // 3. Create listing
      const expirationDate = new Date();
      expirationDate.setDate(expirationDate.getDate() + 3); // Listings expire in 3 days

      const listing = await tx.marketplaceListing.create({
        data: {
          sellerId,
          itemId,
          quantity,
          price,
          expiresAt: expirationDate
        }
      });

      logger.info(`Marketplace listing created: ${listing.id} - ${quantity}x ${itemId} for ${price} gold by ${sellerId}`);
      return listing.id;
    });
  }

  /**
   * Cancels a marketplace listing and returns the escrowed items.
   */
  static async cancelListing(characterId: string, listingId: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const listing = await tx.marketplaceListing.findUnique({
        where: { id: listingId }
      });

      if (!listing) {
        throw new Error('Listing not found');
      }

      if (listing.sellerId !== characterId) {
        throw new Error('You do not own this listing');
      }

      // Return items to seller inventory
      // Check if there is already an unequipped stack
      const existingStack = await tx.inventoryItem.findFirst({
        where: { characterId, itemId: listing.itemId, equipped: false }
      });

      if (existingStack) {
        await tx.inventoryItem.update({
          where: { id: existingStack.id },
          data: { quantity: { increment: listing.quantity } }
        });
      } else {
        await tx.inventoryItem.create({
          data: {
            characterId,
            itemId: listing.itemId,
            quantity: listing.quantity,
            equipped: false
          }
        });
      }

      // Delete listing
      await tx.marketplaceListing.delete({ where: { id: listingId } });
      logger.info(`Marketplace listing cancelled: ${listingId}`);
    });
  }

  /**
   * Purchases a marketplace listing, transfers gold, transfers items, and applies fee.
   */
  static async buyListing(buyerId: string, listingId: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      // 1. Fetch listing and lock it (or rely on transaction serializability)
      const listing = await tx.marketplaceListing.findUnique({
        where: { id: listingId }
      });

      if (!listing) {
        throw new Error('Listing not found or already purchased.');
      }

      if (listing.sellerId === buyerId) {
        throw new Error('You cannot buy your own listing. Use cancel if you want it back.');
      }

      if (new Date() > listing.expiresAt) {
        throw new Error('This listing has expired.');
      }

      // 2. Fetch characters
      const buyer = await tx.character.findUnique({
        where: { id: buyerId }
      });
      const seller = await tx.character.findUnique({
        where: { id: listing.sellerId }
      });

      if (!buyer || !seller) {
        throw new Error('Buyer or seller character not found.');
      }

      if (buyer.gold < listing.price) {
        throw new Error(`Insufficient gold. Price: ${listing.price}, Balance: ${buyer.gold}`);
      }

      // 3. Deduct gold from buyer
      await tx.character.update({
        where: { id: buyerId },
        data: { gold: { decrement: listing.price } }
      });

      // 4. Calculate marketplace fee (Standard 10%, reduced by Merchant class bonus)
      const sellerClassDef = GAME_CONFIG.classes[seller.class];
      const feeReduction = sellerClassDef?.bonuses?.marketFeeReduction || 0.0;
      const baseFeeRate = 0.10; // 10%
      const actualFeeRate = baseFeeRate * (1 - feeReduction);
      const fee = Math.floor(listing.price * actualFeeRate);
      const payout = listing.price - fee;

      // 5. Pay seller
      await tx.character.update({
        where: { id: listing.sellerId },
        data: { gold: { increment: payout } }
      });

      // 6. Give items to buyer
      const existingStack = await tx.inventoryItem.findFirst({
        where: { characterId: buyerId, itemId: listing.itemId, equipped: false }
      });

      if (existingStack) {
        await tx.inventoryItem.update({
          where: { id: existingStack.id },
          data: { quantity: { increment: listing.quantity } }
        });
      } else {
        await tx.inventoryItem.create({
          data: {
            characterId: buyerId,
            itemId: listing.itemId,
            quantity: listing.quantity,
            equipped: false
          }
        });
      }

      // 7. Write transaction logs
      await tx.transactionLog.create({
        data: {
          characterId: buyerId,
          type: 'MARKET_BUY',
          goldDelta: -listing.price,
          details: `Bought ${listing.quantity}x ${listing.itemId} from ${listing.sellerId} (Listing: ${listingId})`
        }
      });

      await tx.transactionLog.create({
        data: {
          characterId: listing.sellerId,
          type: 'MARKET_SELL',
          goldDelta: payout,
          details: `Sold ${listing.quantity}x ${listing.itemId} to ${buyerId}. Fee: ${fee} (Listing: ${listingId})`
        }
      });

      // 8. Delete listing
      await tx.marketplaceListing.delete({ where: { id: listingId } });
      logger.info(`Marketplace transaction completed: ${listingId}. Buyer: ${buyerId}, Seller: ${listing.sellerId}`);
    });
  }

  /**
   * Fetches active, unexpired marketplace listings.
   */
  static async getListings(filters?: { itemId?: string; sellerId?: string }) {
    return await prisma.marketplaceListing.findMany({
      where: {
        expiresAt: { gt: new Date() },
        itemId: filters?.itemId,
        sellerId: filters?.sellerId
      },
      orderBy: { price: 'asc' }
    });
  }
}
