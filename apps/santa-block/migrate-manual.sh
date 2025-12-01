#!/bin/bash

# Manual migration script for production environments
# This script should be run manually or via CI/CD before deploying

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║        Santa Block - Manual Database Migration            ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if running in production
if [ "$NODE_ENV" = "production" ]; then
    echo -e "${RED}⚠️  WARNING: Running in PRODUCTION mode${NC}"
    echo ""
    echo "This will modify the production database."
    echo ""
    read -p "Are you sure you want to continue? (yes/no): " confirm
    
    if [ "$confirm" != "yes" ]; then
        echo -e "${YELLOW}Migration cancelled${NC}"
        exit 0
    fi
    echo ""
fi

# Function to run migrations
run_migrations() {
    echo -e "${BLUE}📊 Running database migrations...${NC}"
    echo ""
    
    # Using docker-compose
    if [ -f "docker-compose.yml" ]; then
        echo "Using docker-compose..."
        docker-compose run --rm santa-block node dist/scripts/migrate.js
    # Using docker directly
    elif command -v docker &> /dev/null; then
        echo "Using docker..."
        docker run --rm \
            --env-file .env \
            santa-block:latest \
            node dist/scripts/migrate.js
    # Using node directly (if running locally)
    elif [ -f "dist/scripts/migrate.js" ]; then
        echo "Using local node..."
        node dist/scripts/migrate.js
    else
        echo -e "${RED}❌ Error: Could not find a way to run migrations${NC}"
        echo "   Please ensure either:"
        echo "   - docker-compose is available"
        echo "   - docker is available with santa-block image built"
        echo "   - or run from the built application directory"
        exit 1
    fi
    
    if [ $? -eq 0 ]; then
        echo ""
        echo -e "${GREEN}✅ Migrations completed successfully${NC}"
    else
        echo ""
        echo -e "${RED}❌ Migration failed${NC}"
        exit 1
    fi
}

# Function to run seeding (optional)
run_seeding() {
    echo ""
    echo -e "${YELLOW}🌱 Database Seeding${NC}"
    echo ""
    echo "Seeding is optional and typically only needed for:"
    echo "  - Initial setup"
    echo "  - Development environments"
    echo "  - Testing environments"
    echo ""
    
    if [ "$NODE_ENV" = "production" ]; then
        echo -e "${RED}⚠️  Seeding is NOT recommended for production${NC}"
        echo ""
        read -p "Do you want to seed the database? (yes/no): " seed_confirm
    else
        read -p "Do you want to seed the database? (yes/no): " seed_confirm
    fi
    
    if [ "$seed_confirm" = "yes" ]; then
        echo ""
        echo -e "${BLUE}Running seed script...${NC}"
        
        # Using docker-compose
        if [ -f "docker-compose.yml" ]; then
            docker-compose run --rm santa-block node dist/scripts/seed.js
        # Using docker directly
        elif command -v docker &> /dev/null; then
            docker run --rm \
                --env-file .env \
                santa-block:latest \
                node dist/scripts/seed.js
        # Using node directly
        elif [ -f "dist/scripts/seed.js" ]; then
            node dist/scripts/seed.js
        fi
        
        if [ $? -eq 0 ]; then
            echo ""
            echo -e "${GREEN}✅ Seeding completed successfully${NC}"
        else
            echo ""
            echo -e "${YELLOW}⚠️  Seeding failed (continuing anyway)${NC}"
        fi
    else
        echo -e "${YELLOW}Skipping seeding${NC}"
    fi
}

# Function to verify database
verify_database() {
    echo ""
    echo -e "${BLUE}🔍 Verifying database setup...${NC}"
    echo ""
    
    # Check if we can connect and query
    if [ -f "docker-compose.yml" ]; then
        docker-compose exec -T postgres psql -U santa -d santa -c "\dt" > /dev/null 2>&1
        
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✅ Database connection successful${NC}"
            
            # Show table count
            TABLE_COUNT=$(docker-compose exec -T postgres psql -U santa -d santa -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" | tr -d ' ')
            echo "   Tables created: $TABLE_COUNT"
        else
            echo -e "${YELLOW}⚠️  Could not verify database (this is okay if DB is not running)${NC}"
        fi
    fi
}

# Main execution
main() {
    echo -e "${BLUE}Environment:${NC} ${NODE_ENV:-development}"
    echo -e "${BLUE}Date:${NC} $(date)"
    echo ""
    
    # Run migrations
    run_migrations
    
    # Optionally run seeding
    run_seeding
    
    # Verify
    verify_database
    
    echo ""
    echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║                  Migration Complete!                      ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Review the migration output above"
    echo "  2. Start your application: docker-compose up -d"
    echo "  3. Check logs: docker-compose logs -f santa-block"
    echo ""
}

# Run main function
main


