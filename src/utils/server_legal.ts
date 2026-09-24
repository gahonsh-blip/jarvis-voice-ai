/**
 * Legal Pages Generator for HERMES JARVIS
 * Generates standalone, accessible, zero-JS-dependent, Google OAuth-compliant
 * Privacy Policy and Terms of Service web pages.
 */

export function renderPrivacyPolicyHtml(baseUrl: string = ''): string {
  const contactEmail = 'gahonsh@gmail.com';
  const effectiveDate = 'September 1, 2026';
  const lastUpdated = 'September 1, 2026';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Privacy Policy — HERMES JARVIS</title>
  <meta name="description" content="Privacy Policy for HERMES JARVIS: Learn how we protect user data, handle Google/YouTube OAuth tokens with AES-256-GCM encryption, and enforce Level-4 human authorization.">
  <meta property="og:title" content="Privacy Policy — HERMES JARVIS">
  <meta property="og:description" content="Official Privacy Policy for HERMES JARVIS autonomous AI assistant and automation system.">
  <meta property="og:type" content="website">
  <style>
    :root {
      --bg: #030712;
      --card-bg: #0f172a;
      --card-border: #1e293b;
      --accent: #06b6d4;
      --accent-glow: rgba(6, 182, 212, 0.15);
      --text: #f1f5f9;
      --text-muted: #94a3b8;
      --text-dim: #64748b;
      --success: #10b981;
      --warning: #f59e0b;
      --font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg);
      color: var(--text);
      font-family: var(--font);
      line-height: 1.7;
      padding: 0;
      margin: 0;
    }
    header {
      background: linear-gradient(180deg, #0f172a 0%, #030712 100%);
      border-bottom: 1px solid var(--card-border);
      padding: 2.5rem 1.5rem 2rem;
      text-align: center;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      background: rgba(6, 182, 212, 0.1);
      border: 1px solid rgba(6, 182, 212, 0.3);
      color: var(--accent);
      font-size: 0.8rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      margin-bottom: 1rem;
    }
    h1 {
      font-size: 2.25rem;
      font-weight: 800;
      letter-spacing: -0.025em;
      margin-bottom: 0.5rem;
      color: #ffffff;
    }
    .subtitle {
      color: var(--text-muted);
      font-size: 1.05rem;
      max-width: 680px;
      margin: 0 auto;
    }
    .meta-bar {
      margin-top: 1.25rem;
      font-size: 0.85rem;
      color: var(--text-dim);
    }
    main {
      max-width: 860px;
      margin: 2rem auto 4rem;
      padding: 0 1.5rem;
    }
    .nav-links {
      display: flex;
      gap: 1rem;
      justify-content: center;
      margin-bottom: 2rem;
      flex-wrap: wrap;
    }
    .nav-links a {
      color: var(--accent);
      text-decoration: none;
      font-size: 0.9rem;
      font-weight: 500;
      padding: 0.4rem 0.9rem;
      border-radius: 8px;
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      transition: all 0.2s ease;
    }
    .nav-links a:hover {
      background: #1e293b;
      border-color: var(--accent);
    }
    .section-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 2rem;
      margin-bottom: 1.75rem;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2);
    }
    h2 {
      font-size: 1.35rem;
      font-weight: 700;
      color: #ffffff;
      margin-bottom: 1rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      border-bottom: 1px solid rgba(255,255,255,0.06);
      padding-bottom: 0.5rem;
    }
    h3 {
      font-size: 1.1rem;
      font-weight: 600;
      color: var(--accent);
      margin: 1.25rem 0 0.5rem;
    }
    p { margin-bottom: 1rem; color: var(--text); }
    ul {
      margin-left: 1.5rem;
      margin-bottom: 1rem;
      color: var(--text-muted);
    }
    li { margin-bottom: 0.5rem; }
    li strong { color: var(--text); }
    .highlight-box {
      background: rgba(6, 182, 212, 0.05);
      border-left: 4px solid var(--accent);
      padding: 1.25rem;
      border-radius: 0 8px 8px 0;
      margin: 1.25rem 0;
      font-size: 0.95rem;
    }
    .highlight-box-warning {
      background: rgba(245, 158, 11, 0.05);
      border-left: 4px solid var(--warning);
      padding: 1.25rem;
      border-radius: 0 8px 8px 0;
      margin: 1.25rem 0;
      font-size: 0.95rem;
    }
    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.85em;
      background: rgba(0, 0, 0, 0.4);
      padding: 0.15rem 0.4rem;
      border-radius: 4px;
      color: #38bdf8;
    }
    footer {
      border-top: 1px solid var(--card-border);
      padding: 2.5rem 1.5rem;
      text-align: center;
      color: var(--text-dim);
      font-size: 0.875rem;
      background: #020617;
    }
    footer a { color: var(--accent); text-decoration: none; }
    footer a:hover { text-decoration: underline; }
    @media (max-width: 640px) {
      h1 { font-size: 1.75rem; }
      .section-card { padding: 1.25rem; }
    }
  </style>
</head>
<body>
  <header>
    <div class="badge">🔒 Security &amp; Privacy Verification</div>
    <h1>Privacy Policy</h1>
    <p class="subtitle">HERMES JARVIS Autonomous AI Assistant &amp; Orchestration System</p>
    <div class="meta-bar">
      Effective Date: <strong>${effectiveDate}</strong> • Last Updated: <strong>${lastUpdated}</strong>
    </div>
  </header>

  <main>
    <div class="nav-links">
      <a href="${baseUrl}/">← Return to Application Homepage</a>
      <a href="${baseUrl}/terms">Terms of Service</a>
      <a href="mailto:${contactEmail}">Contact Developer</a>
    </div>

    <!-- 1. Introduction & Application Identity -->
    <div class="section-card">
      <h2>1. Application Identity &amp; Purpose</h2>
      <p>
        <strong>HERMES JARVIS</strong> is a privacy-first personal AI assistant, remote orchestration daemon, and productivity automation system developed by <strong>Gahonsh</strong> (<a href="mailto:${contactEmail}" style="color:var(--accent);">${contactEmail}</a>).
      </p>
      <p>
        HERMES JARVIS provides task scheduling, voice command processing, local workspace tools, mobile briefing telemetry, and user-initiated social media integration (including YouTube video uploads and LinkedIn posting) with strict human oversight via a four-tier security permission gateway.
      </p>
      <p>
        We respect your privacy and are committed to protecting your personal information. This Privacy Policy outlines what data we collect, how it is processed and encrypted, and how you retain full control over all external integrations.
      </p>
    </div>

    <!-- 2. Google API & YouTube Data Access -->
    <div class="section-card">
      <h2>2. Google &amp; YouTube Data Access &amp; Scopes</h2>
      <p>
        When you explicitly choose to connect your YouTube account via Google OAuth 2.0, HERMES JARVIS requests access exclusively to the following Google OAuth scopes:
      </p>
      <ul>
        <li><code>https://www.googleapis.com/auth/youtube.readonly</code>: Used solely to read your authorized YouTube channel identity, channel ID, title, and subscriber statistics to display live connection status in the JARVIS HUD.</li>
        <li><code>https://www.googleapis.com/auth/youtube.upload</code>: Used solely to upload and stage user-authorized video files, titles, descriptions, and tags directly to your connected YouTube channel upon your explicit command.</li>
      </ul>
      <p>
        We do <strong>not</strong> request or access your Gmail inbox, Google Drive files, Google Contacts, location history, or any other unlisted Google services.
      </p>

      <div class="highlight-box">
        <strong>Google API Limited Use Disclosure:</strong><br>
        HERMES JARVIS's use and transfer to any other app of information received from Google APIs will adhere to the <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer" style="color:var(--accent);">Google API Services User Data Policy</a>, including the Limited Use requirements.
      </div>
    </div>

    <!-- 3. Information We Collect & Process -->
    <div class="section-card">
      <h2>3. Information We Process</h2>
      <p>HERMES JARVIS processes only the data required to deliver user-requested features:</p>
      <ul>
        <li><strong>OAuth Authentication Credentials:</strong> Temporary OAuth 2.0 access tokens and refresh tokens granted by Google, LinkedIn, or Telegram.</li>
        <li><strong>YouTube Metadata:</strong> Channel title, custom URL, channel ID, and avatar image URL retrieved via authorized API endpoints.</li>
        <li><strong>User-Authored Content:</strong> Video files, scripts, social media post drafts, and notes that you explicitly create or upload for processing.</li>
        <li><strong>Mobile Telemetry (Optional &amp; User-Permitted):</strong> Battery percentage, weather data, and notification counts accessed only when granted in the Level 4 Permission Matrix.</li>
        <li><strong>Audit Logs:</strong> Operational timestamps and permission audit records stored locally to maintain full transparency of automated actions.</li>
      </ul>
    </div>

    <!-- 4. How We Use Data -->
    <div class="section-card">
      <h2>4. Purpose of Data Processing</h2>
      <p>Your data is processed strictly for the following functional purposes:</p>
      <ul>
        <li>Authenticating your YouTube channel and verifying active API connection status.</li>
        <li>Staging, formatting, and uploading video content that you explicitly direct JARVIS to publish.</li>
        <li>Generating daily personal briefings (weather, schedule, battery) based on your granted preferences.</li>
        <li>Maintaining offline-first encrypted memory and preferences for your convenience.</li>
      </ul>
      <p>
        <strong>No Advertising or Profiling:</strong> We do <strong>not</strong> use your Google user data, channel metadata, or personal content for advertising, marketing campaigns, behavioral tracking, or data brokerage. We do <strong>not</strong> sell your data to any third party.
      </p>
    </div>

    <!-- 5. Security & Encryption -->
    <div class="section-card">
      <h2>5. Security &amp; Encrypted Token Storage</h2>
      <p>We implement rigorous cryptographic and architectural safeguards:</p>
      <ul>
        <li><strong>AES-256-GCM Encryption:</strong> All sensitive OAuth access tokens and refresh tokens are encrypted at rest using industry-standard AES-256-GCM encryption with unique initialization vectors (IVs) and authentication tags before persistence.</li>
        <li><strong>Level-4 Human Authorization Gateway:</strong> No external publishing action (such as a YouTube video upload or social media post) is ever executed autonomously. Every upload must be reviewed and explicitly authorized by you with a manual <em>YES / APPROVE</em> confirmation.</li>
        <li><strong>Global Kill Switch:</strong> A one-click emergency kill switch immediately terminates all background daemons, purges pending queues, and suspends network activity.</li>
        <li><strong>TLS/HTTPS:</strong> All communications between your client browser and the server, as well as outbound calls to Google APIs, are encrypted in transit via TLS 1.3 / HTTPS.</li>
      </ul>
    </div>

    <!-- 6. Data Sharing & Third Parties -->
    <div class="section-card">
      <h2>6. Data Sharing &amp; Third-Party Services</h2>
      <p>
        HERMES JARVIS communicates directly with official third-party APIs solely to execute user-requested integrations:
      </p>
      <ul>
        <li><strong>Google LLC / YouTube:</strong> Video uploads and metadata are transmitted securely to Google's official API endpoints (<code>www.googleapis.com</code>). Subject to the <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" style="color:var(--accent);">Google Privacy Policy</a> and <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer" style="color:var(--accent);">YouTube Terms of Service</a>.</li>
        <li><strong>Telegram FZ-LLC (Optional):</strong> Remote commands and approval notices are routed through your configured private Telegram Bot token.</li>
      </ul>
      <p>
        We do <strong>not</strong> share, disclose, or transfer your data to any other third parties, advertisers, or analytic brokers.
      </p>
    </div>

    <!-- 7. Data Retention & Deletion -->
    <div class="section-card">
      <h2>7. Data Retention &amp; User Deletion Controls</h2>
      <p>
        You have complete control over your stored credentials and data:
      </p>
      <ul>
        <li><strong>In-App Disconnect:</strong> You can disconnect your YouTube or social accounts at any time from the Social Media Hub or Settings in the JARVIS HUD. Disconnecting immediately deletes all stored access tokens, refresh tokens, and channel identifiers from the server.</li>
        <li><strong>Google Account Permissions Revocation:</strong> You can revoke HERMES JARVIS's access at any time through Google's Security Settings at <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer" style="color:var(--accent);">https://myaccount.google.com/permissions</a>.</li>
        <li><strong>Local Cache Clearing:</strong> Chat history and local memory can be wiped instantly using the "Clear Memory" button inside the JARVIS HUD.</li>
      </ul>
    </div>

    <!-- 8. Children's Privacy -->
    <div class="section-card">
      <h2>8. Children's Privacy</h2>
      <p>
        HERMES JARVIS is not directed to individuals under the age of 13 (or the applicable legal age in your jurisdiction). We do not knowingly collect personal information from children.
      </p>
    </div>

    <!-- 9. Contact Us -->
    <div class="section-card">
      <h2>9. Contact &amp; Support</h2>
      <p>
        If you have any questions, concerns, or requests regarding this Privacy Policy or your data, please contact the developer directly:
      </p>
      <p>
        <strong>Developer:</strong> Gahonsh<br>
        <strong>Email:</strong> <a href="mailto:${contactEmail}" style="color:var(--accent); font-weight:600;">${contactEmail}</a><br>
        <strong>Application:</strong> HERMES JARVIS Autonomous AI Assistant
      </p>
    </div>
  </main>

  <footer>
    <p>© 2026 HERMES JARVIS. All rights reserved.</p>
    <p style="margin-top:0.5rem;">
      <a href="${baseUrl}/">Homepage</a> • 
      <a href="${baseUrl}/privacy">Privacy Policy</a> • 
      <a href="${baseUrl}/terms">Terms of Service</a> • 
      <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">Google User Data Policy</a>
    </p>
  </footer>
</body>
</html>`;
}

export function renderTermsOfServiceHtml(baseUrl: string = ''): string {
  const contactEmail = 'gahonsh@gmail.com';
  const effectiveDate = 'September 1, 2026';
  const lastUpdated = 'September 1, 2026';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Terms of Service — HERMES JARVIS</title>
  <meta name="description" content="Terms of Service for HERMES JARVIS: Acceptable use, human-authorized automation guidelines, YouTube and social integration rules, and liability disclaimers.">
  <meta property="og:title" content="Terms of Service — HERMES JARVIS">
  <meta property="og:description" content="Official Terms of Service for HERMES JARVIS autonomous AI assistant and automation system.">
  <meta property="og:type" content="website">
  <style>
    :root {
      --bg: #030712;
      --card-bg: #0f172a;
      --card-border: #1e293b;
      --accent: #06b6d4;
      --text: #f1f5f9;
      --text-muted: #94a3b8;
      --text-dim: #64748b;
      --warning: #f59e0b;
      --danger: #ef4444;
      --font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg);
      color: var(--text);
      font-family: var(--font);
      line-height: 1.7;
      padding: 0;
      margin: 0;
    }
    header {
      background: linear-gradient(180deg, #0f172a 0%, #030712 100%);
      border-bottom: 1px solid var(--card-border);
      padding: 2.5rem 1.5rem 2rem;
      text-align: center;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      background: rgba(6, 182, 212, 0.1);
      border: 1px solid rgba(6, 182, 212, 0.3);
      color: var(--accent);
      font-size: 0.8rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      margin-bottom: 1rem;
    }
    h1 {
      font-size: 2.25rem;
      font-weight: 800;
      letter-spacing: -0.025em;
      margin-bottom: 0.5rem;
      color: #ffffff;
    }
    .subtitle {
      color: var(--text-muted);
      font-size: 1.05rem;
      max-width: 680px;
      margin: 0 auto;
    }
    .meta-bar {
      margin-top: 1.25rem;
      font-size: 0.85rem;
      color: var(--text-dim);
    }
    main {
      max-width: 860px;
      margin: 2rem auto 4rem;
      padding: 0 1.5rem;
    }
    .nav-links {
      display: flex;
      gap: 1rem;
      justify-content: center;
      margin-bottom: 2rem;
      flex-wrap: wrap;
    }
    .nav-links a {
      color: var(--accent);
      text-decoration: none;
      font-size: 0.9rem;
      font-weight: 500;
      padding: 0.4rem 0.9rem;
      border-radius: 8px;
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      transition: all 0.2s ease;
    }
    .nav-links a:hover {
      background: #1e293b;
      border-color: var(--accent);
    }
    .section-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 2rem;
      margin-bottom: 1.75rem;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2);
    }
    h2 {
      font-size: 1.35rem;
      font-weight: 700;
      color: #ffffff;
      margin-bottom: 1rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      border-bottom: 1px solid rgba(255,255,255,0.06);
      padding-bottom: 0.5rem;
    }
    p { margin-bottom: 1rem; color: var(--text); }
    ul {
      margin-left: 1.5rem;
      margin-bottom: 1rem;
      color: var(--text-muted);
    }
    li { margin-bottom: 0.5rem; }
    li strong { color: var(--text); }
    .warning-box {
      background: rgba(245, 158, 11, 0.05);
      border-left: 4px solid var(--warning);
      padding: 1.25rem;
      border-radius: 0 8px 8px 0;
      margin: 1.25rem 0;
      font-size: 0.95rem;
    }
    footer {
      border-top: 1px solid var(--card-border);
      padding: 2.5rem 1.5rem;
      text-align: center;
      color: var(--text-dim);
      font-size: 0.875rem;
      background: #020617;
    }
    footer a { color: var(--accent); text-decoration: none; }
    footer a:hover { text-decoration: underline; }
    @media (max-width: 640px) {
      h1 { font-size: 1.75rem; }
      .section-card { padding: 1.25rem; }
    }
  </style>
</head>
<body>
  <header>
    <div class="badge">⚖️ Terms &amp; Conditions</div>
    <h1>Terms of Service</h1>
    <p class="subtitle">HERMES JARVIS Autonomous AI Assistant &amp; Orchestration System</p>
    <div class="meta-bar">
      Effective Date: <strong>${effectiveDate}</strong> • Last Updated: <strong>${lastUpdated}</strong>
    </div>
  </header>

  <main>
    <div class="nav-links">
      <a href="${baseUrl}/">← Return to Application Homepage</a>
      <a href="${baseUrl}/privacy">Privacy Policy</a>
      <a href="mailto:${contactEmail}">Contact Developer</a>
    </div>

    <!-- 1. Acceptance of Terms -->
    <div class="section-card">
      <h2>1. Acceptance of Terms</h2>
      <p>
        By accessing or using <strong>HERMES JARVIS</strong> (the "Application"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, please do not use the Application.
      </p>
      <p>
        HERMES JARVIS is developed and maintained by <strong>Gahonsh</strong> (<a href="mailto:${contactEmail}" style="color:var(--accent);">${contactEmail}</a>).
      </p>
    </div>

    <!-- 2. Description of Service & Human Oversight -->
    <div class="section-card">
      <h2>2. Description of Service &amp; Human Authorization</h2>
      <p>
        HERMES JARVIS is a personal AI assistant, developer workspace assistant, and automation daemon offering voice interaction, project management, workflow automation, and social media staging (including YouTube and LinkedIn).
      </p>
      <div class="warning-box">
        <strong>Human-In-The-Loop Requirement (Level-4 Gate):</strong><br>
        The Application enforces a Level-4 Human Authorization Gateway. Sensitive external dispatches (such as uploading videos to YouTube or publishing social media updates) require explicit, affirmative human confirmation. The system does not guarantee error-free autonomous decisions and requires your supervision.
      </div>
    </div>

    <!-- 3. Acceptable Use -->
    <div class="section-card">
      <h2>3. Acceptable Use &amp; User Conduct</h2>
      <p>You agree to use HERMES JARVIS only for lawful purposes. You agree NOT to:</p>
      <ul>
        <li>Upload, publish, or broadcast content that violates copyright, trademark, privacy, or publicity rights of any third party.</li>
        <li>Distribute harmful, defamatory, harassing, obscene, fraudulent, or deceptive content.</li>
        <li>Attempt to circumvent the Level-4 Permission Gateway, disable security checks, or bypass the Global Kill Switch.</li>
        <li>Use the system for unauthorized mass spamming, phishing, or violation of third-party API terms.</li>
        <li>Attempt unauthorized access to underlying cloud infrastructure or third-party accounts.</li>
      </ul>
    </div>

    <!-- 4. Third-Party Integrations -->
    <div class="section-card">
      <h2>4. Third-Party Services &amp; YouTube Terms</h2>
      <p>
        HERMES JARVIS integrates with third-party platforms. When using these features, you agree to comply with the respective third-party terms:
      </p>
      <ul>
        <li><strong>YouTube:</strong> By using YouTube integration features, you agree to be bound by the <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer" style="color:var(--accent);">YouTube Terms of Service</a> and acknowledge Google's <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" style="color:var(--accent);">Privacy Policy</a>.</li>
        <li><strong>Telegram:</strong> Use of the Telegram bot gateway is subject to Telegram's Terms of Service.</li>
        <li><strong>LinkedIn:</strong> Use of LinkedIn posting tools is subject to LinkedIn's User Agreement.</li>
      </ul>
      <p>
        We are not responsible for changes, rate limits, suspensions, or terminations enacted by third-party providers.
      </p>
    </div>

    <!-- 5. User Responsibility for Content -->
    <div class="section-card">
      <h2>5. User Responsibility for Published Content</h2>
      <p>
        You retain full ownership of and legal responsibility for all media files, videos, texts, and descriptions you stage, approve, and upload through the Application. HERMES JARVIS acts solely as an authorized tool executing your instructions.
      </p>
    </div>

    <!-- 6. AI Limitations & Disclaimers -->
    <div class="section-card">
      <h2>6. AI-Generated Content &amp; Automation Disclaimer</h2>
      <p>
        The Application utilizes large language models (such as Google Gemini) to generate text, draft code, and suggest responses. You acknowledge that:
      </p>
      <ul>
        <li>AI outputs may occasionally contain factual errors, hallucinations, or incomplete logic.</li>
        <li>You are responsible for reviewing and verifying all AI-generated drafts before publishing or executing code changes.</li>
        <li>The system does not provide legal, financial, tax, or medical advice. Permanent financial/banking blocks are enforced in code.</li>
      </ul>
    </div>

    <!-- 7. Global Kill Switch & Emergency Halt -->
    <div class="section-card">
      <h2>7. Emergency Protocols &amp; Global Kill Switch</h2>
      <p>
        The Application provides a Global Kill Switch accessible from the web interface and Telegram. In the event of unintended behavior, you may immediately engage the Kill Switch to terminate active daemons and clear task queues.
      </p>
    </div>

    <!-- 8. Disclaimer of Warranties -->
    <div class="section-card">
      <h2>8. Disclaimer of Warranties</h2>
      <p>
        HERMES JARVIS IS PROVIDED ON AN "AS IS" AND "AS AVAILABLE" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, OR NON-INFRINGEMENT.
      </p>
      <p>
        WE DO NOT WARRANT THAT THE APPLICATION WILL BE UNINTERRUPTED, ERROR-FREE, SECURE, OR FREE FROM HARMFUL COMPONENTS.
      </p>
    </div>

    <!-- 9. Limitation of Liability -->
    <div class="section-card">
      <h2>9. Limitation of Liability</h2>
      <p>
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, IN NO EVENT SHALL THE DEVELOPER (GAHONSH) OR AFFILIATES BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES (INCLUDING LOSS OF DATA, REVENUE, PROFIT, OR BUSINESS INTERRUPTION) ARISING OUT OF OR IN CONNECTION WITH YOUR USE OF OR INABILITY TO USE THE APPLICATION.
      </p>
    </div>

    <!-- 10. Modifications & Termination -->
    <div class="section-card">
      <h2>10. Modifications &amp; Termination</h2>
      <p>
        We reserve the right to modify these Terms or update the Application at any time. Your continued use constitutes acceptance of revised Terms. You may terminate your use at any time by disconnecting integrations and closing the Application.
      </p>
    </div>

    <!-- 11. Contact Information -->
    <div class="section-card">
      <h2>11. Contact Information</h2>
      <p>
        For questions or notices regarding these Terms of Service, please contact:
      </p>
      <p>
        <strong>Developer:</strong> Gahonsh<br>
        <strong>Email:</strong> <a href="mailto:${contactEmail}" style="color:var(--accent); font-weight:600;">${contactEmail}</a><br>
        <strong>Application:</strong> HERMES JARVIS Autonomous AI Assistant
      </p>
    </div>
  </main>

  <footer>
    <p>© 2026 HERMES JARVIS. All rights reserved.</p>
    <p style="margin-top:0.5rem;">
      <a href="${baseUrl}/">Homepage</a> • 
      <a href="${baseUrl}/privacy">Privacy Policy</a> • 
      <a href="${baseUrl}/terms">Terms of Service</a> • 
      <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer">YouTube Terms</a>
    </p>
  </footer>
</body>
</html>`;
}
