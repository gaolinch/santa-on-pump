#!/bin/bash

# Build script for Santa Block backend Docker image
# This script must be run from the monorepo root

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Santa Block Docker Build Script${NC}"
echo "=================================="
echo ""

# Check if we're in the monorepo root
if [ ! -f "package.json" ] || [ ! -f "turbo.json" ]; then
    echo -e "${RED}Error: This script must be run from the monorepo root directory${NC}"
    echo "Current directory: $(pwd)"
    echo ""
    echo "Please run:"
    echo "  cd /path/to/santa"
    echo "  ./apps/santa-block/BUILD.sh"
    exit 1
fi

echo -e "${YELLOW}Building from monorepo root: $(pwd)${NC}"
echo ""

# Build the Docker image
echo -e "${GREEN}Building Docker image...${NC}"
docker build -f apps/santa-block/Dockerfile -t santa-block:latest .

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✓ Build successful!${NC}"
    echo ""
    echo "To run the container:"
    echo "  docker run -p 3001:3001 --env-file apps/santa-block/.env santa-block:latest"
    echo ""
    echo "Or use Docker Compose:"
    echo "  cd apps/santa-block"
    echo "  docker-compose up"
else
    echo ""
    echo -e "${RED}✗ Build failed${NC}"
    exit 1
fi


