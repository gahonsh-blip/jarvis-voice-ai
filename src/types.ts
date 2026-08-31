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
  | 'security';

export type MainNavigationTab =
  | 'voice_core'
  | 'blueprint'
  | 'telegram_mobile'
  | 'freelance_pipeline'
  | 'social_engine'
  | 'proactive_reports'
  | 'oracle_cloud'
  | 'security_matrix';

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
  webhookStatus: 'connected' | 'polling' | 'disconnected';
  allowedUserIds: string[];
  humanApprovalRequired: boolean;
  notificationsEnabled: boolean;
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
    status: 'EXECUTED' | 'BLOCKED' | 'PENDING' | string;
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

export interface SocialMediaPostDraft {
  id: string;
  platform: 'LinkedIn' | 'Twitter/X' | 'Instagram' | 'Telegram' | 'Telegram Channel' | string;
  topic: string;
  topicHi?: string;
  content: string;
  hashtags: string[];
  creativePrompt: string;
  status: 'draft' | 'pending_approval' | 'approved' | 'published' | string;
  scheduledTime?: string;
  likesSimulated?: number;
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
