export type IntentCategory =
  | 'open_chrome'
  | 'open_notepad'
  | 'open_calculator'
  | 'open_paint'
  | 'open_cmd'
  | 'open_explorer'
  | 'take_screenshot'
  | 'create_file'
  | 'volume_up'
  | 'volume_down'
  | 'pc_shutdown'
  | 'pc_restart'
  | 'open_google'
  | 'open_youtube'
  | 'open_gmail'
  | 'open_chatgpt'
  | 'google_search'
  | 'set_name'
  | 'get_name'
  | 'system_diagnostic'
  | 'check_project'
  | 'create_social_post'
  | 'find_document'
  | 'schedule_morning_report'
  | 'morning_briefing'
  | 'mobile_personal_status'
  | 'generate_quotation'
  | 'cloud_telemetry'
  | 'security_audit'
  | 'chat';

export interface ActionDetail {
  type: IntentCategory;
  title: string;
  target?: string;
  payload?: any;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'jarvis' | 'system';
  content: string;
  timestamp: string;
  intent?: IntentCategory;
  actionExecuted?: boolean;
  actionDetail?: ActionDetail;
}

export interface MemoryStore {
  name?: string;
  userProfile?: {
    location?: string;
    occupation?: string;
    interests?: string[];
  };
  notes: {
    id: string;
    title: string;
    content: string;
    createdAt: string;
  }[];
  customKeyValues: Record<string, string>;
  stats: {
    totalCommands: number;
    actionsExecuted: number;
    lastActive: string;
  };
  projects?: {
    id: string;
    name: string;
    description: string;
    status: 'active' | 'completed' | 'on_hold';
    repoUrl?: string;
  }[];
}

export interface VoiceSettings {
  autoSpeak: boolean;
  rate: number;
  pitch: number;
  volume: number;
  voiceURI: string;
  language: 'en-US' | 'hi-IN' | string;
  wakeWordEnabled: boolean;
  wakeWord: string;
}

export type ActiveAppWindow =
  | null
  | 'notepad'
  | 'calculator'
  | 'paint'
  | 'browser'
  | 'screenshots'
  | 'memory'
  | 'terminal'
  | 'blueprint'
  | 'telegram'
  | 'oracle'
  | 'freelance'
  | 'social'
  | 'routines'
  | 'security'
  | 'autonomous_tools'
  | 'permission_gateway'
  | 'mobile_remote'
  | 'mobile_personal_status';

export type MainNavigationTab =
  | 'voice_core'
  | 'blueprint'
  | 'telegram_mobile'
  | 'freelance_pipeline'
  | 'social_engine'
  | 'proactive_reports'
  | 'oracle_cloud'
  | 'security_matrix'
  | 'mobile_status';

// -------------------------------------------------------------
// MOBILE PERSONAL STATUS & HINDI MORNING BRIEFING
// -------------------------------------------------------------

export type MobilePermissionCategory =
  | 'BATTERY_STATUS'
  | 'WEATHER_LOCATION'
  | 'NOTIFICATIONS'
  | 'CALENDAR_EVENTS'
  | 'EMAIL_INBOX'
  | 'DEVICE_HEALTH';

export interface MobileCategoryPermissionItem {
  category: MobilePermissionCategory;
  nameEn: string;
  nameHi: string;
  descriptionEn: string;
  descriptionHi: string;
  granted: boolean;
  securityLevel: 'LEVEL 1 READ-ONLY' | 'LEVEL 2 CACHED' | 'LEVEL 4 HUMAN CONSENT';
  level: 1 | 2 | 3 | 4;
  icon: string;
  dataCountSummary?: string;
}

export interface MobileNotificationItem {
  id: string;
  app: 'WhatsApp' | 'SMS' | 'Gmail' | 'Telegram' | 'System' | string;
  sender: string;
  summary: string;
  timestamp: string;
  priority: 'high' | 'normal' | 'low';
}

export interface MobileCalendarEventItem {
  id: string;
  title: string;
  titleHi?: string;
  time: string;
  location?: string;
  priority: 'high' | 'normal';
  category: 'meeting' | 'task' | 'reminder' | 'deadline';
}

export interface MobileEmailSummaryItem {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  time: string;
  isImportant: boolean;
}

export interface MobileStatusData {
  battery: {
    level: number;
    charging: boolean;
    chargingTimeSeconds?: number;
    dischargingTimeSeconds?: number;
    temperatureC: number;
    powerMode: 'Normal' | 'Power Saving' | 'Performance';
    statusText: string;
    available: boolean;
  };
  weather: {
    location: string;
    temperatureC: number;
    condition: string;
    conditionHi: string;
    humidity: number;
    windKmh: number;
    feelsLikeC: number;
    available: boolean;
  };
  notifications: {
    totalCount: number;
    criticalCount: number;
    items: MobileNotificationItem[];
    available: boolean;
  };
  calendar: {
    todayEventsCount: number;
    events: MobileCalendarEventItem[];
    available: boolean;
  };
  email: {
    unreadCount: number;
    importantCount: number;
    summaries: MobileEmailSummaryItem[];
    available: boolean;
  };
  deviceHealth: {
    ramUsageMb: number;
    ramTotalMb: number;
    storageFreeGb: number;
    storageTotalGb: number;
    deviceModel: string;
    osVersion: string;
    networkType: 'WiFi' | '5G' | '4G' | 'Offline';
    available: boolean;
  };
  lastUpdated: string;
  permissions: Record<MobilePermissionCategory, boolean>;
}

export interface MorningBriefingPayload {
  titleHi: string;
  titleEn: string;
  greetingHi: string;
  greetingEn: string;
  currentTimeStr: string;
  spokenTextHi: string;
  spokenTextEn: string;
  generatedAt: string;
  dataSnapshot: MobileStatusData;
  keyHighlights: string[];
  speechDurationEstimateSeconds: number;
}

// -------------------------------------------------------------
// MASTER BLUEPRINT & HERMES ARCHITECTURE
// -------------------------------------------------------------

export interface BlueprintPhase {
  id: number;
  code: string;
  titleEn: string;
  titleHi: string;
  status: 'completed' | 'in_progress' | 'pending';
  icon: string;
  description: string;
  deliverables: { text: string; done: boolean }[];
  commandSample: string;
  cost: string;
}

export interface OracleVMStatus {
  provider: 'Oracle Cloud Always Free';
  tier: 'Always Free (₹0 / month)';
  instanceType: 'Ampere A1 Compute (ARM64)';
  shape: 'VM.Standard.A1.Flex';
  ocpu: number;
  ramGb: number;
  bootVolumeGb: number;
  os: 'Ubuntu 24.04 LTS (Minimal ARM)';
  publicIp: string;
  sshPort: number;
  status: 'RUNNING' | 'PROVISIONING' | 'STOPPED';
  uptimeHours: number;
  metrics: {
    cpuUsage: number;
    ramUsage: number;
    diskUsage: number;
    bandwidthUsedMb: number;
    tempCelsius: number;
  };
  firewallRules: { port: number; proto: 'tcp' | 'udp'; label: string; active: boolean }[];
}

export interface TelegramBotMessage {
  id: string;
  sender: 'user' | 'jarvis_bot';
  text: string;
  timestamp: string;
  type?: 'text' | 'voice_command' | 'action_card' | 'report';
  actionData?: any;
}

export type TelegramMessage = TelegramBotMessage;

export interface TelegramBotConfig {
  botName: string;
  botUsername: string;
  botTokenMasked: string;
  isLiveTokenConfigured: boolean;
  isLiveConnected: boolean;
  mode: 'live_polling' | 'live_webhook' | 'simulator';
  webhookStatus: 'connected' | 'polling' | 'disconnected' | 'waiting_token';
  telegramLink?: string;
  allowedUserIds: string[];
  humanApprovalRequired: boolean;
  notificationsEnabled: boolean;
  adminChatIdConfigured?: boolean;
  totalMessagesReceived?: number;
  lastActivity?: string;
  errorMessage?: string;
}

export type SecurityLevel = 1 | 2 | 3 | 4;

export interface SecurityMatrixState {
  currentLevel: SecurityLevel;
  humanApprovalForExternal: boolean;
  maskSensitiveData: boolean;
  credentialLeakProtection: boolean;
  levels: {
    level: SecurityLevel;
    title: string;
    titleHi: string;
    description: string;
    allowedActions: string[];
    risk: 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH';
  }[];
  auditLogs: {
    id: string;
    timestamp: string;
    action: string;
    levelRequired: SecurityLevel;
    approvedBy: 'AUTO_RULE' | 'HUMAN_CONFIRMATION' | 'SYSTEM_POLICY' | string;
    status: 'EXECUTED' | 'BLOCKED' | 'PENDING' | 'VERIFIED' | 'FAILED' | 'NOT_PUBLISHED' | string;
    targetPlatform?: string;
    verificationStatus?: 'VERIFIED' | 'UNVERIFIED' | 'MISSING_CREDENTIALS' | 'PROVIDER_ERROR' | 'STANDBY';
    errorReason?: string;
    providerUrn?: string;
    finalTruthState?: 'VERIFIED' | 'FAILED' | 'DRAFT' | 'REJECTED' | 'NOT_PUBLISHED' | string;
  }[];
}

export interface FreelanceLead {
  id: string;
  clientName: string;
  source: 'Website Form' | 'WhatsApp Inquiry' | 'Telegram AI Bot' | 'Direct Email' | string;
  projectType: 'Full-Stack Web App' | 'AI Integration' | 'Mobile App' | 'Automation Bot' | 'E-commerce' | string;
  rawRequirement: string;
  budgetEstimate: { currency: 'INR' | 'USD'; amount: number };
  status: 'New Inquiry' | 'AI Requirements Extracted' | 'Quotation Sent' | 'In Progress' | 'Delivered' | 'Delivered & Closed' | 'Followed Up' | string;
  createdAt: string;
  quotation?: {
    scopeSummary: string;
    timelineDays: number;
    totalPrice: number;
    milestones: { title: string; price: number; days: number }[];
  };
}

export type SocialPlatformKey = 'linkedin' | 'facebook' | 'instagram' | 'youtube' | 'twitter';

export type PlatformConnectionStatus =
  | 'NOT_CONFIGURED'
  | 'CONFIGURED'
  | 'AUTH_REQUIRED'
  | 'AUTHORIZATION_REQUIRED'
  | 'CONNECTED'
  | 'TOKEN_INVALID'
  | 'API_VERIFIED'
  | 'ERROR'
  | 'EXPIRED'
  | 'VERIFIED';

export type SocialPublishingState =
  | 'DRAFT'
  | 'APPROVAL_REQUIRED'
  | 'APPROVED'
  | 'EXECUTING'
  | 'API_CONFIRMED'
  | 'VERIFIED'
  | 'FAILED'
  | 'NOT_PUBLISHED'
  | 'REJECTED';

export interface LinkedInOAuthStatus {
  connected: boolean;
  authType?: 'OAUTH_2_0' | 'STATIC_ENV_TOKEN';
  memberSub?: string;
  authorUrn?: string;
  name?: string;
  email?: string;
  picture?: string;
  profileUrl?: string;
  connectedAt?: string;
  expiresAt?: string;
  scopes?: string[];
  hasClientId: boolean;
  hasClientSecret: boolean;
  redirectUri: string;
  message?: string;
}

export interface YouTubeOAuthStatus {
  connected: boolean;
  status?: 'NOT_CONFIGURED' | 'CONFIGURED' | 'AUTH_REQUIRED' | 'AUTHORIZATION_REQUIRED' | 'AUTHORIZED' | 'TOKEN_INVALID' | 'API_VERIFIED' | 'ERROR' | 'CONNECTED';
  authType?: 'OAUTH_2_0' | 'STATIC_ENV_TOKEN' | 'API_KEY';
  channelId?: string;
  channelTitle?: string;
  customUrl?: string;
  avatarUrl?: string;
  connectedAt?: string;
  expiresAt?: string;
  scopes?: string[];
  hasClientId: boolean;
  hasClientSecret: boolean;
  hasApiKey: boolean;
  redirectUri: string;
  message?: string;
  diagnosticError?: string;
  canPublish?: boolean;
  isGoogleTestingModeBlocked?: boolean;
}

export interface PlatformIntegrationInfo {
  id: SocialPlatformKey;
  name: string;
  category: 'Professional' | 'Social' | 'Visual' | 'Video' | 'Microblog';
  status: PlatformConnectionStatus;
  accountName?: string;
  accountIdentifier?: string;
  profileUrl?: string;
  avatarUrl?: string;
  lastVerifiedAt?: string;
  errorMessage?: string;
  authType?: 'OAUTH_2_0' | 'STATIC_TOKEN' | 'API_KEY';
  oauthStatus?: LinkedInOAuthStatus;
  youTubeOAuthStatus?: YouTubeOAuthStatus;
  requiredEnvVars: { key: string; label: string; configured: boolean; isSecret: boolean; placeholder: string }[];
  developerPortalUrl: string;
  setupInstructions: string[];
  capabilities: string[];
}

export interface SocialMediaPostDraft {
  id: string;
  platform: 'LinkedIn' | 'Facebook Page' | 'Instagram' | 'YouTube' | 'Twitter/X' | 'Telegram' | string;
  topic: string;
  topicHi?: string;
  content: string;
  hashtags: string[];
  creativePrompt: string;
  status: 'draft' | 'pending_approval' | 'approved' | 'published' | 'not_published' | 'failed' | string;
  scheduledTime?: string;
  likesSimulated?: number;
  executionStatus?: 'DRAFT' | 'APPROVAL_REQUIRED' | 'APPROVED' | 'EXECUTING' | 'API_CONFIRMED' | 'SUCCESS' | 'FAILED' | 'VERIFIED' | 'NOT_PUBLISHED';
  verificationStatus?: 'VERIFIED' | 'UNVERIFIED' | 'MISSING_CREDENTIALS' | 'PROVIDER_ERROR' | 'STANDBY';
  errorReason?: string;
  providerUrn?: string;
  verifiedAt?: string;
  finalTruthState?: 'DRAFT' | 'APPROVAL_REQUIRED' | 'APPROVED' | 'EXECUTING' | 'API_CONFIRMED' | 'VERIFIED' | 'FAILED' | 'NOT_PUBLISHED' | 'REJECTED';
  videoTitle?: string;
  videoDescription?: string;
  privacyStatus?: 'private' | 'unlisted' | 'public';
  targetChannel?: string;
  videoUrl?: string;
  isTestUpload?: boolean;
  videoFileName?: string;
  videoPayloadBase64?: string;
  scheduledPublishTime?: string;
}

export interface ProactiveReportItem {
  id: string;
  timeSlot: 'morning' | 'midday' | 'evening' | 'night';
  titleEn: string;
  titleHi: string;
  timestamp: string;
  contentEn: string;
  contentHi: string;
  keyInsights: string[];
  systemHealth: {
    serverStatus: 'Nominal' | 'Warning' | 'Critical';
    activeWebsitesMonitored: number;
    pendingTasksCount: number;
    socialPostsPublished: number;
  };
}

export interface PermissionActionRequest {
  id: string;
  exactAction: string;
  target: string;
  contentChanges: string;
  requiredPermission: 'LEVEL 4 EXTERNAL ACTION' | 'LEVEL 3 MODIFY';
  level: 3 | 4;
  requestedAt: string;
  source: 'web_terminal' | 'telegram_mobile' | 'voice_command' | 'scheduler_daemon' | string;
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'EXECUTED' | 'FAILED' | 'BLOCKED_EMERGENCY_STOP';
  platform?: string;
  actionPayload?: any;
  resultUrn?: string;
  errorReason?: string;
}

export interface ToolExecutionResponse {
  success: boolean;
  toolName: string;
  level: 1 | 2 | 3 | 4;
  status: 'EXECUTED' | 'BLOCKED' | 'PENDING_APPROVAL' | 'FAILED' | 'NOT_CONNECTED';
  result?: any;
  message: string;
  auditLogId?: string;
  pendingApproval?: PermissionActionRequest;
}

export interface IntegrationAuditItem {
  id: string;
  name: string;
  service: string;
  status: 'REAL_WORKING' | 'NOT_CONNECTED';
  reason?: string;
  requiredEnvVars: { key: string; label: string; configured: boolean; isSecret: boolean; placeholder: string }[];
  scopesOrPermissions: string[];
  capabilities: string[];
}

export interface EmergencyControlState {
  emergencyPaused: boolean;
  pausedAt?: string;
  pausedBy?: string;
  reason?: string;
}

export interface DaemonTelemetry {
  daemon: {
    status: 'ONLINE' | 'STANDBY' | 'DEGRADED';
    pid: number;
    uptimeSeconds: number;
    nodeVersion: string;
    memoryMb: number;
    platform: string;
    host: string;
    port: number;
    bootTimestamp: string;
    heartbeatTimestamp: string;
  };
  telegram: {
    configured: boolean;
    connected: boolean;
    mode: 'live_polling' | 'live_webhook' | 'simulator';
    botUsername: string;
    adminChatIdConfigured: boolean;
    activeChatId: string | number | null;
    totalMessagesReceived: number;
    processedUpdatesCount: number;
    lastHeartbeat: string;
    errorMessage?: string;
  };
  aiEngine: {
    provider: string;
    geminiConfigured: boolean;
    model: string;
    fallbackActive: boolean;
    bilingualSupport: boolean;
  };
  scheduler: {
    active: boolean;
    activeJobsCount: number;
    jobs: { id: string; name: string; cronOrTime: string; lastRun?: string; nextRun: string }[];
    lastRunLog: string[];
  };
  storage: {
    persistenceFile: string;
    existsOnDisk: boolean;
    notesCount: number;
    leadsCount: number;
    postsCount: number;
    auditLogsCount: number;
    lastPersisted: string;
  };
  integrations: {
    linkedin: {
      configured: boolean;
      authorUrnConfigured: boolean;
      status: 'CONFIGURED_LIVE' | 'STANDBY_MISSING_CREDENTIALS';
      lastVerification?: string;
    };
    telegram: {
      configured: boolean;
      status: 'CONNECTED' | 'STANDBY' | 'SIMULATOR';
    };
    oracleCloud: {
      tier: string;
      status: 'RUNNING' | 'STANDBY';
      cost: string;
    };
  };
  recentAuditLogs: any[];
}
