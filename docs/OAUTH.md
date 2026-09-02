# 🔐 OAuth 2.0 & Social Media Integrations Guide

This guide provides the exact configuration requirements, Authorized Redirect URIs, environment variable specifications, and developer console steps for authenticating HERMES JARVIS with external platforms.

---

## 📌 1. Exact Authorized Redirect URIs

When configuring OAuth 2.0 client credentials in developer portals, you must specify the **Authorized Redirect URI**. HERMES JARVIS automatically computes the redirect URI dynamically from the incoming request's host/origin.

### 🎥 YouTube (Google Cloud Console)
- **Callback Path**: `/api/auth/youtube/callback`
- **Dynamic Calculation**:  
  `https://<YOUR-APP-DOMAIN-OR-HOST>/api/auth/youtube/callback`
- **Localhost Testing**:  
  `http://localhost:3000/api/auth/youtube/callback`
- **AI Studio Preview Example**:  
  `https://<your-container-id>.usercontent.goog/api/auth/youtube/callback`

> 💡 **How to copy in 1-Click**: Open the JARVIS Web Panel ➔ Click **Social Approval** (or **Social Media Hub**) ➔ Expand the **YouTube** card ➔ Click **Copy URL** under "Authorized Redirect URI (for Google Cloud Console)".

---

### 💼 LinkedIn (LinkedIn Developer Portal)
- **Callback Path**: `/api/auth/linkedin/callback`
- **Dynamic Calculation**:  
  `https://<YOUR-APP-DOMAIN-OR-HOST>/api/auth/linkedin/callback`
- **Localhost Testing**:  
  `http://localhost:3000/api/auth/linkedin/callback`

---

## 🚀 2. YouTube OAuth 2.0 Step-by-Step Setup

Follow these exact steps in Google Cloud Console to enable 1-Click YouTube channel connection:

### Step 1: Create a Project in Google Cloud Console
1. Navigate to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (e.g., `Hermes-Jarvis-Agent`).

### Step 2: Enable the YouTube Data API v3
1. In the left navigation, go to **APIs & Services ➔ Library**.
2. Search for `YouTube Data API v3` and click **Enable**.

### Step 3: Configure the OAuth Consent Screen
1. Go to **APIs & Services ➔ OAuth consent screen**.
2. Select User Type: **External** and click **Create**.
3. Fill in the **App name** (e.g., `HERMES JARVIS`), **User support email**, and **Developer contact email**.
4. In **Scopes**, add:
   - `https://www.googleapis.com/auth/youtube.readonly` (Inspect channel and subscriber stats)
   - `https://www.googleapis.com/auth/youtube.upload` (Upload video content)
   - `https://www.googleapis.com/auth/youtube.force-ssl` (Manage channel content and community posts)
5. In **Test users**, add your own Google email address (the owner of the YouTube channel you want to connect).

### Step 4: Create OAuth 2.0 Client Credentials
1. Go to **APIs & Services ➔ Credentials ➔ Create Credentials ➔ OAuth client ID**.
2. Select Application type: **Web application**.
3. Set Name: `HERMES JARVIS Web Client`.
4. Under **Authorized redirect URIs**, click **Add URI** and paste:
   ```
   https://<YOUR-APP-HOST>/api/auth/youtube/callback
   http://localhost:3000/api/auth/youtube/callback
   ```
5. Click **Create**. You will receive your `Client ID` and `Client Secret`.

### Step 5: Configure Environment Variables in JARVIS
Add the following variable names into your environment / AI Studio Settings (`⚙️`):
```env
YOUTUBE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
YOUTUBE_CLIENT_SECRET=your_google_client_secret
```

### Step 6: Connect via 1-Click Popup
1. In the JARVIS Dashboard, open the **Social Approval** modal.
2. Under **YouTube**, click **Connect YouTube**.
3. Authorize the application in the Google popup window.
4. Once authorized, the popup will close automatically, and your channel title, custom URL, avatar, and active OAuth token status will appear in the HUD!

---

## 💼 3. LinkedIn Developer Portal Step-by-Step Setup

Follow these steps to enable 1-Click personal profile posting on LinkedIn:

### Step 1: Create a LinkedIn Developer App
1. Go to the [LinkedIn Developer Portal](https://www.linkedin.com/developers/apps).
2. Click **Create App**.
3. Enter App Name (e.g., `HERMES JARVIS Autonomous Agent`) and link your LinkedIn Company Page.

### Step 2: Request Required Products
In the **Products** tab, request access to:
- **Share on LinkedIn** (Enables `w_member_social` scope)
- **Sign In with LinkedIn using OpenID Connect** (Enables `openid`, `profile`, `email` scopes)

### Step 3: Configure Authorized Redirect URL
1. Go to the **Auth** tab.
2. Under **OAuth 2.0 settings ➔ Authorized redirect URLs for your app**, add:
   ```
   https://<YOUR-APP-HOST>/api/auth/linkedin/callback
   http://localhost:3000/api/auth/linkedin/callback
   ```

### Step 4: Configure Environment Variables
```env
LINKEDIN_CLIENT_ID=your_linkedin_client_id
LINKEDIN_CLIENT_SECRET=your_linkedin_client_secret
```

### Step 5: Launch 1-Click Connect
1. In the JARVIS Dashboard, open **Social Approval**.
2. Click **Connect LinkedIn** to launch the OAuth window.
3. Once authorized, your name, profile photo, and Author URN will be locked in.

---

## 📊 4. Overview of All Social Integrations

| Platform | Authentication Mechanism | Supported Capabilities | Required Environment Variables |
| :--- | :--- | :--- | :--- |
| **LinkedIn** | OAuth 2.0 3-Legged Flow (`w_member_social`, `openid`, `profile`) | UGC text posts, articles, profile telemetry, live feed preview | `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` (or `LINKEDIN_ACCESS_TOKEN`, `LINKEDIN_AUTHOR_URN`) |
| **YouTube** | OAuth 2.0 3-Legged Flow (`youtube.readonly`, `youtube.upload`, `youtube.force-ssl`) | Channel analytics, video uploads, community posts, metadata inspection | `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET` (or `YOUTUBE_API_KEY`) |
| **Facebook** | Meta Graph API v19.0 (Page Access Token) | Page posts, photo publishing, engagement metrics | `FACEBOOK_PAGE_ACCESS_TOKEN`, `FACEBOOK_PAGE_ID` |
| **Instagram** | Meta Instagram Graph API (Business Discovery) | Carousel posts, captions, hashtag research | `INSTAGRAM_BUSINESS_ACCOUNT_ID`, `INSTAGRAM_ACCESS_TOKEN` |
| **X / Twitter** | Twitter API v2 (OAuth 1.0a User Context / Bearer) | Tweets, thread generation, tweet metric inspection | `TWITTER_API_KEY`, `TWITTER_API_SECRET`, `TWITTER_ACCESS_TOKEN`, `TWITTER_ACCESS_SECRET` |

---

## ⚠️ 5. Common OAuth Troubleshooting

### 1. `redirect_uri_mismatch` (Error 400 on Google OAuth)
- **Cause**: The redirect URI passed in the URL does not match the exact authorized URI listed in the Google Cloud Console.
- **Solution**: Open the Google Cloud Console ➔ **APIs & Services ➔ Credentials** ➔ Edit your OAuth 2.0 Client ID ➔ Ensure the URI matches your current deployment domain with `/api/auth/youtube/callback` at the end. Note that Google requires `https://` for external domains and does not allow trailing slashes.

### 2. Browser Blocked Popup Window
- **Cause**: Modern web browsers often block popups initiated asynchronously.
- **Solution**: Allow popups for your JARVIS domain in browser address bar settings.

### 3. Token Expiration & Automatic Refresh
- YouTube OAuth issues a `refresh_token` with `access_type=offline` and `prompt=consent`.
- The backend `ensureValidYouTubeToken()` utility automatically exchanges the `refresh_token` for a fresh `access_token` when the token is within 5 minutes of expiration without requiring operator re-authentication.
