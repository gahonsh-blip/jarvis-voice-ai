# ⚙️ HERMES JARVIS — Setup & Deployment Guide

This document outlines the step-by-step instructions for running HERMES JARVIS locally or deploying it as a 24/7 autonomous background daemon on Oracle Cloud Always Free (or any Linux VPS).

---

## 1. Local Machine Setup

### Requirements
- Node.js 20+ (Node.js 22 LTS recommended)
- npm or bun
- Git

### Installation
```bash
# 1. Clone repository
git clone https://github.com/your-username/mobile-controlled-hermes-jarvis.git
cd mobile-controlled-hermes-jarvis

# 2. Configure environment
cp .env.example .env

# 3. Install dependencies
npm install

# 4. Start local development server
npm run dev
```
Open your browser at `http://localhost:3000`.

---

## 2. Setting Up Telegram Bot (@HermesJarvisBot)

To control JARVIS from your Android phone without keeping a laptop on:

1. Open Telegram on your phone and search for `@BotFather`.
2. Send `/newbot` to create a new bot.
3. Choose a name (e.g. `Hermes Jarvis Controller`) and a unique username ending in `bot` (e.g. `MyHermesJarvisBot`).
4. BotFather will provide an HTTP API token (e.g., `123456789:ABCdefGHIjklMNO...`).
5. Open Telegram and search for `@userinfobot` or `@raw_data_bot` to find your personal Telegram user numeric ID (e.g., `987654321`).
6. Set the environment variables:
   ```env
   TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNO...
   TELEGRAM_ADMIN_CHAT_ID=987654321
   ```
7. Start or restart JARVIS. The backend will automatically initiate long-polling or webhook listening.
8. Send `/start` or `"JARVIS, project check करो"` to your bot in Telegram!

---

## 3. Production Deployment on Oracle Cloud Always Free (ARM64)

Oracle Cloud Infrastructure (OCI) offers an **Always Free** tier that provides **4 OCPUs and 24 GB RAM** on ARM Ampere A1 Compute instances with **₹0.00 / forever free** guarantee.

### Step 1: Provision the ARM Compute Instance
1. In the OCI Console, go to **Compute ➔ Instances ➔ Create Instance**.
2. Select Image: **Ubuntu 24.04 LTS (AArch64 / ARM Minimal)**.
3. Select Shape: **Ampere VM.Standard.A1.Flex** (Allocate 4 OCPUs and 24 GB RAM).
4. Paste your SSH Public Key and click **Create**.

### Step 2: Open Security List Firewall Ingress Rules
In OCI Virtual Cloud Network (VCN) ➔ Security Lists:
- Port `22` (SSH)
- Port `80` (HTTP)
- Port `443` (HTTPS)
- Port `3000` (Node.js Direct / Ingress)

### Step 3: Server Provisioning Commands (SSH)
Connect to your Oracle VM and run:
```bash
# Update OS and install essentials
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git nginx ufw certbot python3-certbot-nginx

# Install Node.js 22 LTS
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# Install PM2 Process Manager
sudo npm install -g pm2 tsx

# Clone Repository
git clone https://github.com/your-username/mobile-controlled-hermes-jarvis.git /home/ubuntu/jarvis
cd /home/ubuntu/jarvis
npm install
npm run build
```

### Step 4: Configure PM2 for 24/7 Autonomous Daemon
```bash
# Start background daemon via PM2
pm2 start npm --name "hermes-jarvis" -- run start

# Enable auto-start on server reboot
pm2 startup
pm2 save
```

### Step 5: Configure Nginx Reverse Proxy with Free SSL
Create `/etc/nginx/sites-available/jarvis`:
```nginx
server {
    server_name jarvis.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```
Enable site and acquire SSL:
```bash
sudo ln -s /etc/nginx/sites-available/jarvis /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Free Let's Encrypt SSL
sudo certbot --nginx -d jarvis.yourdomain.com
```

---

## 4. Environment Variables Reference Cheat Sheet

| Variable Name | Required? | Purpose |
| :--- | :--- | :--- |
| `GEMINI_API_KEY` | Optional | Google Gemini 2.5/3.7 Flash API key for complex tool calling & high-level reasoning. |
| `TELEGRAM_BOT_TOKEN` | Recommended | Telegram Bot API token for 24/7 mobile control and proactive morning/evening alerts. |
| `TELEGRAM_ADMIN_CHAT_ID` | Recommended | Your personal Telegram user ID to restrict access to authorized operator only. |
| `YOUTUBE_CLIENT_ID` | Optional | Google Cloud OAuth 2.0 Client ID for YouTube channel authentication. |
| `YOUTUBE_CLIENT_SECRET` | Optional | Google Cloud OAuth 2.0 Client Secret for YouTube channel authentication. |
| `LINKEDIN_CLIENT_ID` | Optional | LinkedIn Developer App Client ID for 1-Click member OAuth. |
| `LINKEDIN_CLIENT_SECRET` | Optional | LinkedIn Developer App Client Secret for 1-Click member OAuth. |
| `FACEBOOK_PAGE_ACCESS_TOKEN`| Optional | Meta Graph API Page token for automated Facebook publishing. |
| `FACEBOOK_PAGE_ID` | Optional | Meta Page ID for Facebook publishing. |
| `INSTAGRAM_BUSINESS_ACCOUNT_ID` | Optional | Meta Instagram Business Account ID. |
| `INSTAGRAM_ACCESS_TOKEN` | Optional | Meta Graph API Access token for Instagram business account. |
| `TWITTER_API_KEY` | Optional | Twitter Developer App consumer API key. |
| `TWITTER_API_SECRET` | Optional | Twitter Developer App consumer API secret. |
| `TWITTER_ACCESS_TOKEN` | Optional | Twitter Developer user access token. |
| `TWITTER_ACCESS_SECRET` | Optional | Twitter Developer user access secret. |
