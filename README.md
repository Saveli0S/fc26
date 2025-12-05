# FC26 SBC Automation

Automated Squad Building Challenges for EA Sports FC Ultimate Team Web App.

## Features

-   **Browser Automation**: Playwright-based automation for EA FC Web App
-   **Task Configuration**: JSON-based task configuration with UI editor
-   **Squad Builder Rules**: Customizable rules for automatic squad building
-   **Live Status**: Real-time logs and task status via WebSocket
-   **2FA Support**: Handles 2FA prompts with manual completion

## Quick Start

### Prerequisites

-   Node.js 18+
-   npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Install Playwright browsers
cd backend && npx playwright install chromium
```

### Configuration

1. Edit `backend/.env` with your EA credentials:

```
EA_EMAIL=your@email.com
EA_PASSWORD=yourpassword
EA_WEB_APP_URL=https://www.ea.com/ru-ru/ea-sports-fc/ultimate-team/web-app/
```

2. Configure tasks in `tasks.config.json`

### Running

```bash
# Start both backend and frontend
npm run dev

# Or run separately:
npm run dev:backend  # Backend on http://localhost:3001
npm run dev:frontend # Frontend on http://localhost:5173
```

## Usage

1. Open http://localhost:5173 in your browser
2. Click "Initialize Browser" to launch Playwright
3. Click "Login to EA" and complete any 2FA prompts in the browser window
4. Enable/disable tasks as needed
5. Click "Run All Tasks" or run individual tasks

## Task Configuration

Edit `tasks.config.json` to configure tasks:

```json
{
    "dailyTasks": [
        {
            "id": "daily-bronze-upgrade",
            "category": "Upgrades",
            "cardTitle": "Daily Bronze Upgrade",
            "repeatCount": 1,
            "enabled": true
        }
    ],
    "squadBuilderRules": {
        "untradablesOnly": true,
        "excludeActiveSquad": true,
        "ignorePosition": true,
        "sortBy": "rating-low-to-high",
        "maxOVR": 85,
        "preferCommon": true
    }
}
```

## Squad Builder Rules

-   **untradablesOnly**: Only use untradeable players
-   **excludeActiveSquad**: Don't use players from active squad
-   **ignorePosition**: Ignore position requirements
-   **sortBy**: Sort players by rating (low-to-high or high-to-low)
-   **maxOVR**: Maximum overall rating to use
-   **preferCommon**: Use common cards unless rare required

## Project Structure

```
fc26/
├── backend/           # Node.js + Playwright automation
│   ├── src/
│   │   ├── automation/
│   │   │   ├── browser.ts      # Browser management
│   │   │   ├── auth.ts         # EA login flow
│   │   │   ├── sbc.ts          # SBC navigation
│   │   │   ├── squad-builder.ts # Squad builder rules
│   │   │   └── task-runner.ts  # Task execution
│   │   ├── config/
│   │   │   └── tasks.ts        # Config schema
│   │   └── server.ts           # Express + WebSocket server
│   └── .env                    # EA credentials
├── frontend/          # React UI
│   └── src/
│       ├── components/         # React components
│       └── hooks/              # Custom hooks
└── tasks.config.json  # Task configuration
```

## Notes

-   The browser runs in non-headless mode for visibility and 2FA handling
-   Session cookies are saved to `backend/storage/cookies.json` for reuse
-   Screenshots are saved to `backend/storage/screenshots/` for debugging
