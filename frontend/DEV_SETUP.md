# Lake Powell Water Data - Development Setup

## Prerequisites

- **Node.js 20.9.0 or higher** (required by Next.js 16)
- **nvm** (Node Version Manager) - recommended for managing Node versions

## Quick Start

### 1. Ensure correct Node.js version

```bash
# Check your Node version
node --version

# If using nvm and version is below 20.9.0:
nvm use 20
# or install if not available:
nvm install 20
```

### 2. Start the development server

```bash
cd frontend
npm run dev
```

The server will start at **http://localhost:3000**

## Troubleshooting

### "Node.js version >=20.9.0 is required" error

Your shell is using an older Node.js version. Fix with:

```bash
# Option 1: Use nvm (if installed)
nvm use 20

# Option 2: Set PATH directly (if nvm isn't loading automatically)
export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"
npm run dev
```

### nvm not loading in new terminals

Add this to your `~/.zshrc` or `~/.bashrc`:

```bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
```

Then restart your terminal or run `source ~/.zshrc`.

### Auto-switch Node version with .nvmrc

This project includes a `.nvmrc` file specifying Node 20. If you have nvm configured to auto-switch, it will automatically use the correct version when you `cd` into the frontend directory.

To enable auto-switching, add this to your `~/.zshrc`:

```bash
# Auto-switch node version based on .nvmrc
autoload -U add-zsh-hook
load-nvmrc() {
  if [[ -f .nvmrc && -r .nvmrc ]]; then
    nvm use
  fi
}
add-zsh-hook chpwd load-nvmrc
load-nvmrc
```

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server (http://localhost:3000) |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run test` | Run unit tests with Vitest |
| `npm run test:e2e` | Run end-to-end tests with Playwright |

## Environment Variables

Copy `.env.example` to `.env.local` and configure:

```
DATABASE_URL=postgresql://user:password@host:port/database
```

## Tech Stack

- **Next.js 16.1.1** - React framework with App Router
- **React 19** - UI library
- **Tailwind CSS 4** - Styling
- **Recharts** - Charts and data visualization
- **PostgreSQL** - Database (via pg driver)

