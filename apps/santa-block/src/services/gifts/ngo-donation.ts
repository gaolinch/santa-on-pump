/**
 * NGO Donation Gift
 * 
 * Donates 100% (or specified percentage) to a single NGO
 */

import { logger } from '../../utils/logger';
import { giftLogger } from '../gift-logger';
import { IGiftHandler, GiftExecutionContext, GiftResult } from './base-gift';

export class NGODonationGift implements IGiftHandler {
  getType(): string {
    return 'full_donation_to_ngo';
  }

  async execute(context: GiftExecutionContext): Promise<GiftResult> {
    const { spec, treasuryBalance } = context;
    const { ngo_wallet, percent = 100 } = spec.params;
    
    logger.info({
      day: spec.day,
      type: spec.type,
      ngoWallet: ngo_wallet,
      percent,
    }, '🏥 Step 1: Preparing NGO donation');

    await giftLogger.logStep(
      spec.day,
      spec.type,
      'prepare_ngo_donation',
      'Preparing donation to NGO',
      {
        ngoWallet: ngo_wallet,
        percent,
        treasuryBalance: treasuryBalance.toString(),
      }
    );

    if (!ngo_wallet) {
      throw new Error('NGO wallet not specified in gift params');
    }

    const amount = (treasuryBalance * BigInt(percent)) / BigInt(100);

    logger.info({
      day: spec.day,
      ngoWallet: ngo_wallet,
      amount: amount.toString(),
      amountSOL: (Number(amount) / 1e9).toFixed(4),
      percent,
    }, `✅ Donation calculated: ${(Number(amount) / 1e9).toFixed(4)} SOL (${percent}%)`);

    await giftLogger.logStep(
      spec.day,
      spec.type,
      'donation_calculated',
      `Donation of ${(Number(amount) / 1e9).toFixed(4)} SOL to NGO`,
      {
        ngoWallet: ngo_wallet,
        amount: amount.toString(),
        amountSOL: (Number(amount) / 1e9).toFixed(4),
        percent,
      }
    );

    return {
      winners: [
        {
          wallet: ngo_wallet,
          amount,
          reason: 'full_donation',
        },
      ],
      totalDistributed: amount,
      metadata: {
        ngo_wallet,
        percent,
      },
    };
  }
}

