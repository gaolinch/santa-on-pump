![Santa Logo](/santa-logo.png)

# Santa — The On-Chain Advent Calendar  
**Version 1.0 — November 2025**

---

## 1. Executive Summary

**Santa** is a Solana-based token designed as a **decentralised Advent Calendar**.  
The token launches on **December 1st**, and for 24 days (Dec 1 → Dec 24) the project reveals one *gift* each day.  
All gifts are **defined in advance** and cryptographically committed using a **Merkle tree** before the start of the event to guarantee fairness.  
Each day, a new gift is revealed on the website with its cryptographic proof and executed automatically on-chain according to the pre-defined rules — **no human intervention after launch** (almost, we might be a bit late sometimes 😅).

The collected fees from token activity are distributed daily as follows:

| Beneficiary | Share | Purpose |
|--------------|--------|---------|
| **Holders & Investors** | 70 % | Daily airdrops or rewards to active wallets |
| **Charities & NGOs** | 25 % | Direct on-chain donations to verified causes |
| **Founders & Operations** | 5 % | Sustaining the project, operations, audits |

Each gift may use a **different logic** — e.g. top buyers of the day, randomised winners, or all collected fees directed to a specific charity — but all are executed **automatically**, verifiably, and **without human intervention** after launch.

---

## 2. Vision & Mission

### Vision
Create a **community-driven and social on-chain Advent Calendar** that brings people together through the joy of giving. Using blockchain transparency, we make generosity fun, trusted, and accessible to everyone, everywhere — transforming the traditional advent calendar into a global celebration of sharing and impact.

### Mission
To merge the excitement of DeFi and the festive season by creating a **digital Advent Calendar** that:
- **Builds community** — brings token holders together through daily shared experiences
- **Rewards participation** — distributes gifts to active community members daily
- **Creates social impact** — funds real-world charitable actions transparently
- **Operates autonomously** — executes automatically without human intervention
- **Celebrates together** — makes December a month of collective giving and receiving

---

## 3. 🎅🔥 THE INSANE 24-DAY SANTA EVENT

All 24 gifts locked and committed via Merkle root. **No changes. No cheating. Pure chaos.**

- 🏆 **Whale Hunters** — Top buyers flex wallets, show dominance, get rewarded
- 😱 **Shame Gifts** — Bought at the top? Worst performer? We literally reward your pain
- 🎲 **RNG Carnival** — Pure randomness. Blockhash lottery, hourly airdrops, 24-100 winners
- 🐜 **Anti-Whale Protection** — Small wallets unite! Smallest buyers win. Reverse leaderboards. David beats Goliath
- 💎 **Loyalty Jackpots** — Diamond hands, streak buyers, OG badge holders, no-sell warriors get massive rewards
- 🎯 **Chaos Specials** — Most active trader, dip buyers, last buyer before midnight. Absolute madness
- ❤️ **Charity Chaos** — 5 full days where 100% of fees → verified NGOs. Feel good while degening
- 🎅 **The Grand Finale** — Day 24 superpool with $25k cap + 1M SANTA fallback

---

## 4. The Advent Calendar Mechanics

### 4.1 Daily Revelation Process

To maximize excitement and community engagement, each day follows a **two-stage reveal process**:

#### Stage 1: Midnight Teaser (00:00 UTC)
At the stroke of midnight, a **teaser hint** is revealed on the website:
- A cryptic clue about the day's gift type (e.g., "Today's gift favors the bold buyers" or "Fortune smiles on the lucky today")
- The gift category is hinted at but not fully disclosed
- Creates anticipation and speculation within the community
- Encourages active participation throughout the day

#### Stage 2: End of Day Full Reveal (00:00 UTC next day)
At midnight marking the end of the day, the **complete gift structure** is unveiled:
- **Full gift details** are published (type, parameters, eligibility criteria)
- **Cryptographic proof** is released (gift data, salt, and Merkle proof)
- **Public verification** becomes available: `verify(gift, salt, proof, merkle_root) → true/false`
- **Automatic execution** begins — the gift logic is executed on-chain
- **Winners/recipients** are announced with transaction proofs

### 4.2 Pre-Commitment & Transparency

**How can you trust that we won't change the gifts or cheat after seeing how the market performs?**

Before December 1st, we **lock in all 24 gifts** using a **Merkle tree** — a cryptographic commitment technology. Think of it like putting all the gifts in sealed envelopes with a public fingerprint — we can't change what's inside without everyone knowing.

#### How It Works (Simple Version Merkle tree):

1. **Before Launch** — We define all 24 gifts with their exact rules and parameters
2. **We Create a "Fingerprint"** — Using cryptographic hashing, we generate a unique code that represents all 24 gifts
3. **We Publish This Fingerprint** — This code is posted publicly on our website and social media **before December 1st**
4. **Daily Proof** — Each day when we reveal a gift, we also publish mathematical proof that this gift was part of the original commitment
5. **You Can Verify** — Anyone can check that today's gift matches the original fingerprint — no cheating possible

#### Why This Increases Transparency:

- **No Last-Minute Changes** — We can't see the market and decide to change tomorrow's gift
- **Publicly Verifiable** — Anyone can verify each gift was predetermined, not made up on the spot
- **Builds Trust** — You don't have to trust us — you can verify the math yourself
- **Industry Standard** — This same technology secures billions in crypto assets
- **One Gift at a Time** — We reveal gifts daily without exposing future ones (keeps the surprise!)

**Bottom Line:** All 24 gifts are decided and locked before we start. We're just as surprised as you are about which gift comes each day — but we can prove every single one was predetermined.

### 4.3 Verification Example

```
Published Merkle Root (Nov 27, 2025):
b1d22ed5c20ad74da7bce68251264b9b055ab27d22f5e3b223614c80e56d5793

Day 1 Reveal (Dec 1):
- Gift: { type: "proportional_holders", params: {...} }
- Salt: [REDACTED - will be revealed on Dec 1]
- Proof: [hash1, hash2, hash3, hash4, hash5]

Verification:
1. Compute leaf = SHA256(gift + salt)
2. Use proof to compute path to root
3. Check if computed root matches published root ✓
```

---

## 5. Token Overview

**Santa** is launched on **Pump.fun**, the leading Solana token launchpad known for fair launches and community-driven tokens. Pump.fun provides instant liquidity, transparent trading, and a proven platform for successful token launches.

| Attribute | Detail |
|------------|---------|
| **Launcher** | Pump.fun |
| **Name** | Santa |
| **Symbol** | $SANTA |
| **Contract Address** | AjckotsSBsw19EG47nz2Kav9DwkVU1A22Vabm6wRpump |
| **Network** | Solana (SPL standard) |
| **Total Supply** | 1 000 000 000 SANTA |
| **Decimals** | 9 |
| **Launch Date** | 1 December 2025 |
| **Season Duration** | December 1-24 (24 days) |
| **Transaction Fee** | ≈ Pump.fun creator fees |
| **Allocation** | Holders 70 % / NGOs 25 % / Founders 5 % |
| **Airdrop Reserve** | 5% of market cap secured by founders for community airdrops |

**Founders' Commitment:** The founding team has secured **5% of the market cap** to distribute as airdrops throughout the 24-day event. These tokens are used for bonus rewards, hourly random drops, and special event airdrops — ensuring continuous community engagement and rewards beyond the daily fee distributions.

All token flows and daily distributions are verifiable on-chain.

---

## 6. Treasury & Automation

### Daily Treasury & Fee Cap
All transaction fees accumulate into the **Santa Treasury**, a program wallet `TX = XXXXXXXXXXXXXX`.

**Daily Fee Cap:** Each day (Days 1-23), distributions are capped at **$5,000 USD** worth of fees. Any fees collected beyond this cap are **automatically rolled over** into the **Grand Finale pool** for Day 24.

**Day 24 Grand Finale:** All accumulated excess fees from Days 1-23 are combined with Day 24's fees, creating a massive superpool for the final day's distribution. This ensures the event builds to an epic conclusion!

At the end of each UTC day, the treasury balance (up to the daily cap) is split and distributed per the gift of that day.

### Node / Relayer Service
A backend service (Node.js + Solana Web3.js) continuously listens to token transactions.  
At each day's closing time it:
- Retrieves all relevant transactions from Helius/QuickNode RPC
- Applies the pre-defined algorithm for the current gift (top N, time-window, random seed, etc.)
- Generates and submits distribution transactions to the network
- Publishes execution proofs (transaction hashes, winners list) publicly

### Security & Integrity

- **Pre-commitment** — All 24 gifts locked via Merkle root before launch (no changes possible)
- **Transparent Execution** — All proofs, inputs, selection results, and tx hashes published publicly
- **Deterministic Randomness** — When needed, uses on-chain entropy: `seed = HMAC_SHA256(blockhash_of_day, salt)`
- **Reproducible Results** — Anyone can verify the algorithm and outcomes independently
- **Verified Data Sources** — All transaction data from trusted RPC providers, archived for audit
- **Sybil Protection** — Minimum balance requirements prevent spam attacks

---

## 7. Technical Architecture (High Level)

| Component | Role |
|------------|------|
| **SANTA Token** | SPL token contract on Solana |
| **Santa Treasury** | Collects daily transaction fees |
| **Relayer Service** | Listens to blockchain, computes daily outputs, prepares transfers |
| **Website Dashboard** | Shows calendar, revealed gifts, Merkle proofs, verification tool |
| **Social Bot (X)** | Posts daily gift reveal + link to on-chain proof |
| **Merkle Verification** | Client-side tool for users to verify commitments |

**Infrastructure:** redundant RPC providers (QuickNode, Helius, own node), secure key storage (Vault/HSM), monitoring, daily logs.

---

## 8. Charitable Framework

Charity is at the heart of Santa's mission. We believe in giving back and creating real-world impact through blockchain technology. That's why **5 full days** during the 24-day event are dedicated entirely to charity — on these special days, **100% of daily fees** go directly to verified nonprofit organizations, ensuring maximum impact for meaningful causes.

- **Charity Selection** — Charities are selected from **The Giving Block** platform or directly via website links
- **5 Full Charity Days** — On 5 special days during the season, **100% of daily fees** go directly to verified nonprofit organizations
- **Transparent Wallets** — Each NGO wallet address is verified and listed on website with full details
- **Direct On-Chain Donations** — All donations occur directly on-chain with no intermediaries
- **Impact Reporting** — End-of-season impact report summarises total donations and outcomes

---

**Santa** isn't just another token.

**No rug pulls. No team dumps. No BS.**  
Just 24 days of rewards, chaos, charity, and community.

**I LOVE SANTA** 🎅🔥

**Follow us on X:** https://x.com/santaonpumpfun

---

**Merkle Root Commitment (Season 2025):**  
`b1d22ed5c20ad74da7bce68251264b9b055ab27d22f5e3b223614c80e56d5793`

**Published:** November 27, 2025  
**Verification:** https://santa-pump.fun/verify
