/**
 * Twitter/X Service
 * 
 * Handles posting to Twitter/X when gift executions complete
 */

import { logger } from '../utils/logger';
import { config } from '../config';
import crypto from 'crypto';

interface TweetOptions {
  day: number;
  giftType: string;
  winnerCount: number;
  totalDistributedSOL: string;
  pageUrl: string;
  txHashes?: string[];
}

export class TwitterService {
  private baseUrl = 'https://api.twitter.com/2';
  private oauthUrl = 'https://api.twitter.com/oauth';

  /**
   * Generate OAuth 1.0a signature
   */
  private generateOAuthSignature(
    method: string,
    url: string,
    params: Record<string, string>,
    consumerSecret: string,
    tokenSecret: string
  ): string {
    // Normalize URL (remove query string and fragment, ensure https)
    const urlObj = new URL(url);
    const normalizedUrl = `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;

    // Create parameter string (all params must be encoded)
    const paramString = Object.keys(params)
      .sort()
      .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
      .join('&');

    // Create signature base string
    const signatureBaseString = [
      method.toUpperCase(),
      encodeURIComponent(normalizedUrl),
      encodeURIComponent(paramString),
    ].join('&');

    // Create signing key (consumer secret + token secret, both URL encoded)
    const signingKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(tokenSecret || '')}`;

    // Generate signature
    const signature = crypto
      .createHmac('sha1', signingKey)
      .update(signatureBaseString)
      .digest('base64');

    return signature;
  }

  /**
   * Generate OAuth 1.0a header
   */
  private generateOAuthHeader(
    method: string,
    url: string,
    params: Record<string, string> = {}
  ): string {
    const consumerKey = config.twitter.apiKey;
    const consumerSecret = config.twitter.apiSecret;
    const accessToken = config.twitter.accessToken;
    const accessSecret = config.twitter.accessSecret;

    if (!consumerKey || !consumerSecret || !accessToken || !accessSecret) {
      throw new Error('Twitter credentials not configured');
    }

    const oauthParams: Record<string, string> = {
      oauth_consumer_key: consumerKey,
      oauth_token: accessToken,
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
      oauth_nonce: crypto.randomBytes(16).toString('hex'),
      oauth_version: '1.0',
    };

    // Combine all parameters for signature (OAuth params + any additional params)
    const allParams: Record<string, string> = { ...oauthParams };
    Object.keys(params).forEach(key => {
      if (key && params[key]) {
        allParams[key] = params[key];
      }
    });

    // Generate signature with all parameters
    oauthParams.oauth_signature = this.generateOAuthSignature(
      method,
      url,
      allParams,
      consumerSecret,
      accessSecret
    );

    // Build header string (OAuth params only, sorted)
    const headerParams = Object.keys(oauthParams)
      .sort()
      .map(key => `${encodeURIComponent(key)}="${encodeURIComponent(oauthParams[key])}"`)
      .join(', ');

    return `OAuth ${headerParams}`;
  }

  /**
   * Post a tweet using Twitter API v2
   * Uses OAuth 1.0a for user context authentication
   */
  async postTweet(text: string): Promise<string | null> {
    if (!config.twitter.apiKey || !config.twitter.apiSecret || 
        !config.twitter.accessToken || !config.twitter.accessSecret) {
      logger.warn('Twitter credentials not configured, skipping tweet');
      return null;
    }

    try {
      const url = `${this.baseUrl}/tweets`;
      
      // Prepare body
      const body = JSON.stringify({ text });
      
      // Generate OAuth 1.0a header
      // Twitter API v2 doesn't require oauth_body_hash for JSON bodies
      const oauthHeader = this.generateOAuthHeader('POST', url);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': oauthHeader,
          'Content-Type': 'application/json',
        },
        body,
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `Failed to post tweet (${response.status})`;
        
        try {
          const errorData = JSON.parse(errorText);
          if (errorData.detail) {
            errorMessage = errorData.detail;
          }
          
          // Provide helpful guidance for common errors
          if (response.status === 403 && errorData.detail?.includes('oauth1-permissions')) {
            errorMessage += '\n\n⚠️  Your Twitter app needs to be configured with OAuth 1.0a and "Read and Write" permissions.\n';
            errorMessage += '   Go to: https://developer.twitter.com/en/portal/dashboard\n';
            errorMessage += '   - Set App permissions to "Read and Write"\n';
            errorMessage += '   - Regenerate your Access Token and Secret after changing permissions';
          }
        } catch (e) {
          // If error text is not JSON, use it as-is
          errorMessage = errorText || errorMessage;
        }
        
        logger.error({ 
          status: response.status, 
          statusText: response.statusText,
          error: errorText 
        }, errorMessage);
        return null;
      }

      const data = await response.json() as { data?: { id?: string } };
      const tweetId = data.data?.id;
      
      logger.info({ tweetId }, '✅ Tweet posted successfully');
      return tweetId || null;
    } catch (error) {
      logger.error({ error }, 'Error posting tweet');
      return null;
    }
  }

  /**
   * Generate a cool message for gift execution results
   */
  generateExecutionMessage(options: TweetOptions): string {
    const { day, giftType, winnerCount, totalDistributedSOL, pageUrl, txHashes } = options;
    
    // Format gift type name
    const giftTypeName = this.formatGiftTypeName(giftType);
    
    // Format SOL amount (remove trailing zeros)
    const solAmount = parseFloat(totalDistributedSOL).toFixed(4).replace(/\.?0+$/, '');
    
    // Build message with emojis and formatting
    let message = `🦌🦌🦌 Gift dropped - Day ${day} - Bang 🦌🦌🦌\n\n`;
    message += `✨ ${giftTypeName}\n`;
    message += `🎉 ${winnerCount} ${winnerCount === 1 ? 'holder' : 'holders'} rewarded\n`;
    message += `💰 ${solAmount} SOL distributed\n\n`;
    
    message += `📊 Full details & winners:\n${pageUrl}\n\n`;
    message += `#SantaOnPump #Solana #OnChainAdvent $SANTA`;
    
    // Twitter has a 280 character limit
    // URLs are counted as ~23 characters when shortened by Twitter
    // Let's be conservative and aim for ~250 characters
    if (message.length > 280) {
      // Truncate message but keep URL
      const urlPart = `\n\n📊 ${pageUrl}\n\n#SantaOnPump #Solana`;
      const maxMessageLength = 280 - urlPart.length - 20; // Leave buffer
      const truncated = message.substring(0, maxMessageLength);
      message = truncated + '...' + urlPart;
    }
    
    return message;
  }

  /**
   * Format gift type name for display
   */
  private formatGiftTypeName(giftType: string): string {
    const typeMap: Record<string, string> = {
      'proportional_holders': 'Proportional Holders',
      'deterministic_random': 'Random Selection',
      'top_buyers_airdrop': 'Top Buyers',
      'last_second_hour': 'Last Second Hour',
      'ngo_donation': 'NGO Donation',
    };
    
    return typeMap[giftType] || giftType;
  }

  /**
   * Post execution results to Twitter
   */
  async postExecutionResults(options: TweetOptions): Promise<string | null> {
    const message = this.generateExecutionMessage(options);
    logger.info({ day: options.day, message }, 'Posting execution results to Twitter');
    return await this.postTweet(message);
  }
}

export const twitterService = new TwitterService();

