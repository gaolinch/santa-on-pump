#!/bin/bash

# Airdrop SOL to test wallets using Solana CLI
# This works better than RPC airdrops

set -e

# Source zsh to get solana command
source ~/.zshrc

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WALLETS_FILE="$SCRIPT_DIR/../../data/test-wallets-addresses.txt"

if [ ! -f "$WALLETS_FILE" ]; then
    echo "❌ Test wallets file not found at $WALLETS_FILE"
    exit 1
fi

echo "🎅 Airdropping SOL to test wallets..."
echo ""

# Read wallets and airdrop
SUCCESS=0
TOTAL=0

while IFS=': ' read -r name address; do
    if [[ $name == wallet_* ]]; then
        TOTAL=$((TOTAL + 1))
        echo "[$TOTAL] $name: $address"
        
        if solana airdrop 0.5 "$address" 2>&1; then
            echo "  ✅ Airdropped 0.5 SOL"
            SUCCESS=$((SUCCESS + 1))
        else
            echo "  ⚠️  Airdrop failed (may need to wait)"
        fi
        
        echo ""
        
        # Wait between airdrops to avoid rate limits
        if [ $TOTAL -lt 10 ]; then
            echo "  ⏳ Waiting 3 seconds..."
            sleep 3
        fi
    fi
done < "$WALLETS_FILE"

echo ""
echo "✅ Airdrop complete: $SUCCESS/$TOTAL wallets funded"
echo ""
echo "Next step: Distribute SANTA tokens"
echo "  yarn workspace @santa/block fund-wallets tokens"


