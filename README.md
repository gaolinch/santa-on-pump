# 🎅 Santa - The On-Chain Advent Calendar

A Solana-based token with automated daily gift distributions during the advent season.

## 📦 Monorepo Structure

This is a Turborepo monorepo containing:

- **`apps/santa-web`** - Next.js frontend application
- **`apps/santa-block`** - Node.js backend relayer service
- **`packages/shared`** - Shared types and utilities

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- npm 9+
- PostgreSQL 14+ (for backend)

### Installation

```bash
# Install all dependencies
npm install

# Start all apps in development mode
npm run dev

# Or start specific apps
npm run dev --filter=santa-web
npm run dev --filter=santa-block
```

### Build

```bash
# Build all apps
npm run build

# Build specific app
npm run build --filter=santa-web
```

## 📁 Project Structure

```
santa/
├── apps/
│   ├── santa-web/          # Next.js frontend
│   └── santa-block/        # Node.js backend
├── packages/
│   └── shared/            # Shared types & utilities
├── turbo.json             # Turborepo configuration
├── package.json           # Root workspace config
└── README.md             # This file
```

## 🛠️ Development

### Frontend (santa-web)

```bash
cd apps/santa-web
npm run dev
# Runs on http://localhost:3000
```

### Backend (santa-block)

```bash
cd apps/santa-block
npm run dev
# Runs on http://localhost:3001
```

### Shared Package

The `packages/shared` package contains:
- TypeScript types for API contracts
- Gift type definitions
- Shared utilities
- Constants

Import in your apps:
```typescript
import { GiftSpec, Winner } from '@santa/shared';
```

## 📚 Documentation

**[📖 Complete Documentation Index](./docs/README.md)** - All docs in one place!

### Quick Links
- **Setup**: [Monorepo Setup](./docs/setup/MONOREPO_SETUP.md) • [Migration](./docs/setup/MIGRATION.md) • [Yarn](./docs/setup/YARN_SETUP.md)
- **Architecture**: [System Design](./docs/architecture/santa-architecture-v1.md) • [Whitepaper](./docs/architecture/santa-whitepaper-v0.2.md)
- **Backend**: [Quick Start](./docs/backend/QUICKSTART.md) • [API Examples](./docs/backend/EXAMPLES.md)
- **Frontend**: [App README](./apps/santa-web/README.md)

## 🔧 Available Scripts

- `npm run dev` - Start all apps in development mode
- `npm run build` - Build all apps
- `npm run lint` - Lint all apps
- `npm run test` - Run tests across all apps
- `npm run clean` - Clean all build artifacts
- `npm run type-check` - Type check all TypeScript projects

## 🏗️ Turborepo Features

- **Build Caching** - Turbo caches build outputs for faster rebuilds
- **Task Orchestration** - Runs tasks in parallel when possible
- **Incremental Builds** - Only rebuilds what changed
- **Remote Caching** - Share cache across team (optional)

## 🚢 Deployment

### Frontend (Vercel)

```bash
# Deploy from root
vercel --cwd apps/santa-web
```

### Backend (Docker)

```bash
cd apps/santa-block
docker build -t santa-block .
docker run -p 3001:3001 santa-block
```

## 📝 Contributing

1. Create a feature branch
2. Make your changes
3. Run `npm run lint` and `npm run type-check`
4. Submit a pull request

## 📄 License

MIT

---

**Built with ❤️ by the Santa Core Team**


