# 🎵 Deezer ARL Manager

A simple web dashboard for managing Deezer accounts and ARL tokens with automatic health checks and refresh.

## Installation

### 1. Install Dependencies

```bash
cd deezer-arl
npm install
```

### 2. Configure Environment

Create a `.env` file:

```env
# Port for local / VPS execution
PORT=8787

# Admin Panel Password
ADMIN_PASSWORD=your_password

# Auto Health Check Interval in Minutes
CHECK_INTERVAL_MINUTES=60

# Optional: Browser path for Pterodactyl
# BROWSER_PATH=/home/container/chrome-linux/chrome
```

### 3. Start Development Server

```bash
npm run dev
```

### 4. Build & Start Production

```bash
npm run build
npm run start
```

The dashboard will be available at:

`http://localhost:8787`

---

## Admin Panel

Open:

`http://localhost:8787/admin`

Use the `ADMIN_PASSWORD` configured in `.env` to access the admin panel.

From the admin panel, you can manage Deezer accounts, check account status, refresh accounts, and manage the ARL pool.

---

## REST API

### Get Active ARL

```http
GET /api/arl
```

Returns the currently active ARL.

### Get Raw ARL

```http
GET /api/arl?format=text
```

Returns only the ARL token as plain text.

### Rotate ARL

```http
GET /api/arl?rotate=true
```

Rotates to another available account in the pool.

### List Accounts

```http
GET /api/accounts
```

Returns the configured accounts.

### Add Account

```http
POST /api/accounts
Content-Type: application/json
```

```json
{
  "label": "Account 1",
  "email": "user@example.com",
  "password": "your_password",
  "initialArl": ""
}
```

`initialArl` is optional.

### Refresh Account

```http
POST /api/accounts/:id/refresh
```

Refreshes a specific account.

### Refresh All Accounts

```http
POST /api/accounts/refresh-all
```

Checks and refreshes all accounts.

### Delete Account

```http
DELETE /api/accounts/:id
```

Removes an account.

### Pool Statistics

```http
GET /api/stats
```

Returns account pool health and statistics.

---

## Configuration

| Variable                 | Description                                      |
| ------------------------ | ------------------------------------------------ |
| `PORT`                   | Port used by the application                     |
| `ADMIN_PASSWORD`         | Password for the admin panel                     |
| `CHECK_INTERVAL_MINUTES` | Automatic account health check interval          |
| `BROWSER_PATH`           | Optional browser executable path for Pterodactyl |

---