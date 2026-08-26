# 🌌 ECLIPSE — Discord Economy RPG Bot

ECLIPSE is a production-ready, highly interactive text-based MMORPG living inside Discord. It is built using **Node.js**, **TypeScript**, **discord.js v14**, **MongoDB**, and **Prisma ORM**.

Unlike generic economy bots that rely on boring commands like `/daily` or `/work`, ECLIPSE features an integrated progression loop where exploration, crafting, questing, guilds, and combat directly affect each other and shape the server's economy.

---

## 🚀 Key Features Implemented

*   **Persistent Character Progression**: Persistent character stats, level calculations, lazy energy recovery, classes (Adventurer, Merchant, Explorer, Blacksmith, Alchemist), and dynamic stats resolved with equipped gear modifiers.
*   **Weighted Exploration Engine**: Spends energy to explore regions. Yields material items, random gold bags, location discoveries, combat encounters, or quest progress.
*   **Turn-Based Combat System**: Extensible combat engine with Basic Attack, raises guards (Defend), executes special moves (Skills), consumes potions (Items), or Luck/Agility-based flees.
*   **Database Transaction Protection**: All currency movements, item escrows, crafting conversions, and marketplace transactions are locked using database transactions (`prisma.$transaction`) to prevent duplication exploits, race conditions, and negative balances.
*   **Quest Engine**: Multi-step quests supporting gather requirements, explore destinations, combat objectives, and choices that branch progression.
*   **Marketplace & NPC Shop**: Player-to-player trading with escrow protection, listing fees (with Merchant specialization discounts), and NPC shops for buying consumables and selling resources.
*   **Guild System**: Creating guilds, shared treasuries, roles, and asset upgrades (Storage Vault, Guild Merchant, Forge, Expedition Center).
*   **World Event Modifiers**: Global server-wide event states (e.g. Volcanic Season, solar eclipses) that adjust drop rates, marketplace fees, and combat multipliers.
*   **Milestone Achievements**: Automatically scans progress metrics to unlock badges, gold rewards, and special titles.

---

## 📁 Project Structure

```text
src/
├── commands/            # Slash command registries and handlers
├── events/             # Discord client listeners (interactionCreate, ready)
├── game/               # Core RPG logic (Framework-agnostic)
│   ├── character/      # CharacterService (level-up, lazy energy)
│   ├── economy/        # EconomyService (transaction audits, transfers)
│   ├── exploration/    # ExplorationService (weighted drop resolution)
│   ├── combat/         # CombatService (turn-based loops)
│   ├── quests/         # QuestService (branches, completion, hooks)
│   ├── inventory/      # InventoryService (stack limits, gear triggers)
│   ├── crafting/       # CraftingService (recipes, stat success boosts)
│   ├── marketplace/    # MarketplaceService (locked buyer transitions)
│   ├── guild/          # GuildService (treasuries, level upgrades)
│   ├── achievements/   # AchievementService (trophy room triggers)
│   └── world/          # WorldEventService (global modifiers)
├── database/           # Prisma client provider and seeder
├── config/             # Balanced item, enemy, region, quest, class lists
├── utils/              # Discord embed layout helpers, winston logger
└── index.ts            # Entrypoint & InteractionRouter
```

---

## 🛠️ Installation & Setup

### 1. Prerequisites
*   [Node.js](https://nodejs.org/) v18.0.0 or higher.
*   A running instance of [MongoDB](https://www.mongodb.com/).

### 2. Install Dependencies
Clone the repository and run:
```bash
npm install
```

### 3. Database Configurations
Copy the `.env.example` file to `.env`:
```bash
cp .env.example .env
```
Open `.env` and fill in your connection string:
```env
DATABASE_URL="mongodb+srv://<username>:<password>@<cluster>.mongodb.net/<db_name>?retryWrites=true&w=majority"
```

Push the database schema to your MongoDB instance:
```bash
npm run db:push
```

Seed the database with default server parameters, sample guilds, and a showcase character (`RaiZhu`):
```bash
npm run db:seed
```

### 4. Register Discord Bot & Slash Commands
1.  Go to the [Discord Developer Portal](https://discord.com/developers/applications).
2.  Create a new Application and add a Bot.
3.  Copy the **Token** and **Client ID** and paste them into your `.env`:
    ```env
    DISCORD_TOKEN=your_bot_token
    CLIENT_ID=your_client_id
    GUILD_ID=your_test_guild_id (for instant developer guild sync, optional)
    ```
4.  Deploy application commands:
    ```bash
    npm run deploy:commands
    ```

---

## ⚙️ Development & Testing

### Run Unit Tests (Vitest)
Verify core mechanics (progression, economy isolation, inventory stacks, combat multipliers, crafting probabilities, and marketplace escrows):
```bash
npm run test
```

### Run in Development Mode
Starts node compiler in watch-mode using nodemon:
```bash
npm run dev
```

### Build for Production
Compiles TypeScript files into native JS output in the `/dist` directory:
```bash
npm run build
```
npm run start
```

---

## 🔮 What to Build Next

1.  **Party Dungeon Encounters**: Extend `/explore` to allow groups of players to join a lobby and fight high-level raid bosses in turn-based combat together.
2.  **Housing & Farms**: Introduce buying housing plots, expanding farm cells, and passive gathering of cooking ingredients.
3.  **PvP Duel Arena**: Enable players to challenge each other in balanced arenas, putting up gold wagers.
4.  **Seasons & Global Leaderboards**: Track seasonal progression and issue custom cosmetic titles/badges to the top players at the end of each season cycle.
