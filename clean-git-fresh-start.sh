#!/bin/bash

# Script to completely clean git history and start fresh with a single commit
# SAFE VERSION: Keeps local files, only removes git history
# WARNING: This will DELETE all git history and create a new repository

set -e

echo "⚠️  WARNING: This script will:"
echo "   1. Delete ALL git history"
echo "   2. Remove the current .git directory"
echo "   3. Initialize a fresh git repository"
echo "   4. Stage all files (respecting .gitignore)"
echo "   5. Create a single initial commit"
echo ""
echo "ℹ️  NOTE: Local files will be preserved (only git history is removed)"
echo ""
read -p "Are you sure you want to proceed? (type 'yes' to continue): " confirm

if [ "$confirm" != "yes" ]; then
    echo "❌ Aborted. No changes made."
    exit 1
fi

echo ""
echo "🧹 Cleaning repository..."

# Step 1: Verify .gitignore is in place
echo "📋 Verifying .gitignore..."
if [ ! -f .gitignore ]; then
    echo "❌ Error: .gitignore not found!"
    exit 1
fi
echo "✅ .gitignore found"

# Step 2: Show what sensitive files exist (but won't be committed)
echo ""
echo "🔍 Checking for sensitive files (these will be excluded):"
[ -f apps/santa-block/data/reveals/day-01.json ] && echo "  ⚠️  Reveal files found (will be excluded)" || echo "  ✅ No reveal files"
[ -f apps/santa-block/data/private-merkle-data.json ] && echo "  ⚠️  Private merkle data found (will be excluded)" || echo "  ✅ No private merkle data"
[ -f apps/santa-block/data/test-wallets.json ] && echo "  ⚠️  Test wallets found (will be excluded)" || echo "  ✅ No test wallets"
[ -f apps/santa-block/.env.backup ] && echo "  ⚠️  .env.backup found (will be excluded)" || echo "  ✅ No .env.backup"

# Step 3: Remove .git directory (deletes all history)
echo ""
echo "🗑️  Removing git history..."
if [ -d .git ]; then
    rm -rf .git
    echo "✅ Git history removed"
else
    echo "⚠️  No .git directory found (already clean?)"
fi

# Step 4: Initialize fresh git repository
echo ""
echo "🆕 Initializing fresh git repository..."
git init

# Step 5: Add all files (respecting .gitignore)
echo ""
echo "📦 Staging all files (respecting .gitignore)..."
git add .

# Step 6: Show what will be committed
echo ""
echo "📋 Files staged for commit:"
git status --short | head -30
TOTAL_FILES=$(git ls-files | wc -l | tr -d ' ')
echo ""
echo "📊 Total files to be committed: $TOTAL_FILES"
echo ""

# Step 7: Verify sensitive files are NOT tracked
echo "🔒 Security check - verifying sensitive files are excluded:"
SENSITIVE_FOUND=$(git ls-files | grep -E "(reveals|private-merkle|test-wallets|\.env\.backup)" || true)
if [ -z "$SENSITIVE_FOUND" ]; then
    echo "✅ No sensitive files found in staging area"
else
    echo "❌ WARNING: Sensitive files found in staging!"
    echo "$SENSITIVE_FOUND"
    echo ""
    read -p "Continue anyway? (type 'yes' to continue): " continue_anyway
    if [ "$continue_anyway" != "yes" ]; then
        echo "❌ Aborted. Fix .gitignore and try again."
        exit 1
    fi
fi

# Step 8: Create initial commit
echo ""
echo "💾 Creating initial commit..."
git commit -m "Initial commit: Santa v1.0 - Complete codebase

- Backend: Solana transaction monitoring and gift distribution system
- Frontend: Next.js website with gift reveal interface  
- Features: Commit-reveal scheme, Merkle tree verification, daily gift distribution
- Security: All sensitive data excluded via .gitignore

This is a clean repository with all previous history removed."

echo ""
echo "✅ Done! Repository cleaned and fresh commit created."
echo ""
echo "📊 Repository status:"
git log --oneline
echo ""
echo "🔍 Final verification - sensitive files should NOT be tracked:"
git ls-files | grep -E "(reveals|private-merkle|test-wallets|\.env\.backup)" || echo "✅ No sensitive files found - all good!"
echo ""
echo "📝 Next steps:"
echo "   1. Review the commit: git show"
echo "   2. Review what's tracked: git ls-files | head -20"
echo "   3. If everything looks good, add your remote:"
echo "      git remote add origin <your-repo-url>"
echo "   4. Push to remote (force push required for new history):"
echo "      git push -u origin main --force"
echo ""
echo "⚠️  Remember: If you had a remote before, you'll need to force push"
echo "   because you're rewriting history. Make sure you coordinate with"
echo "   any collaborators first!"
echo ""


