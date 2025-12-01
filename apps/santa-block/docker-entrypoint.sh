#!/bin/sh
# Docker entrypoint script for Santa Block backend
# This script runs migrations and optionally seeds the database before starting the app

set -e

echo "🎅 Santa Block Backend - Starting..."
echo "===================================="
echo ""

# Function to wait for database
wait_for_db() {
  echo "⏳ Waiting for database to be ready..."
  
  MAX_RETRIES=30
  RETRY_COUNT=0
  
  # Use DATABASE_URL if available, otherwise use individual variables
  if [ -n "$DATABASE_URL" ]; then
    echo "   Using DATABASE_URL for connection"
    until psql "$DATABASE_URL" -c '\q' 2>/dev/null; do
      RETRY_COUNT=$((RETRY_COUNT + 1))
      
      if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
        echo "❌ Database connection failed after $MAX_RETRIES attempts"
        exit 1
      fi
      
      echo "   Database is unavailable - attempt $RETRY_COUNT/$MAX_RETRIES"
      sleep 2
    done
  else
    # Fallback to individual variables
    DB_HOST=${DB_HOST:-postgres}
    DB_PORT=${DB_PORT:-5432}
    DB_NAME=${DB_NAME:-santa}
    DB_USER=${DB_USER:-santa}
    
    echo "   Using individual DB variables for connection"
    until PGPASSWORD=$DB_PASSWORD psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c '\q' 2>/dev/null; do
      RETRY_COUNT=$((RETRY_COUNT + 1))
      
      if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
        echo "❌ Database connection failed after $MAX_RETRIES attempts"
        exit 1
      fi
      
      echo "   Database is unavailable - attempt $RETRY_COUNT/$MAX_RETRIES"
      sleep 2
    done
  fi
  
  echo "✅ Database is ready!"
  echo ""
}

# Function to run migrations
run_migrations() {
  echo "📊 Running database migrations..."
  
  if [ -f "dist/scripts/migrate.js" ]; then
    node dist/scripts/migrate.js
    
    if [ $? -eq 0 ]; then
      echo "✅ Migrations completed successfully"
      echo ""
    else
      echo "❌ Migration failed"
      exit 1
    fi
  else
    echo "⚠️  Migration script not found at dist/scripts/migrate.js"
    echo "   Skipping migrations..."
    echo ""
  fi
}

# Function to run seeding
run_seeding() {
  echo "🌱 Seeding database..."
  
  if [ -f "dist/scripts/seed.js" ]; then
    node dist/scripts/seed.js
    
    if [ $? -eq 0 ]; then
      echo "✅ Seeding completed successfully"
      echo ""
    else
      echo "⚠️  Seeding failed (continuing anyway)"
      echo ""
    fi
  else
    echo "⚠️  Seed script not found at dist/scripts/seed.js"
    echo "   Skipping seeding..."
    echo ""
  fi
}

# Main execution
main() {
  # Wait for database
  wait_for_db
  
  # Always run migrations
  run_migrations
  
  # Run seeding only in development or if explicitly enabled
  if [ "$NODE_ENV" = "development" ] || [ "$AUTO_SEED" = "true" ]; then
    echo "🔧 Environment: $NODE_ENV (auto-seeding enabled)"
    run_seeding
  else
    echo "🔧 Environment: $NODE_ENV (auto-seeding disabled)"
    echo "   To enable seeding, set AUTO_SEED=true"
    echo ""
  fi
  
  echo "===================================="
  echo "🚀 Starting Santa Block application..."
  echo "===================================="
  echo ""
  
  # Execute the main command (passed as arguments to this script)
  exec "$@"
}

# Run main function
main "$@"

