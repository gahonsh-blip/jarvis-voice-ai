import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import { exec, execSync } from 'child_process';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import { detectLanguageSwitchCommand } from './src/utils/languages';
import { isTelephonyHubRequest, isCallHistoryRequest, isAnswerCallRequest, isHangupCallRequest, isRejectCallRequest, isTelephonyControlRequest } from './src/utils/telephonyIntentRouting';
import { judgeSetNameIntent } from './src/utils/identityTruth';
import { freelanceLeadsReply, buildNewLeadRecord, classifyNewLeadIntake } from './src/utils/freelanceLeadTruth';
import { renderPrivacyPolicyHtml, renderTermsOfServiceHtml } from './src/utils/server_legal';
import {
  AUDIT_LOG_SOURCE_RECORDED,
  auditTrailCounts,
  describeAuditTrail,
  deriveAuditFinalTruthState,
  deriveAuditVerificationStatus,
} from './src/utils/hardening/auditTrailTruth';
import { stagedDraftAuditEntry } from './src/utils/hardening/socialDraftAuditTruth';
import { resolveSocialGeneration } from './src/utils/hardening/socialGenerationTruth';
import { isEmergencyStopActive } from './src/utils/hardening/emergencyStop';
import { emergencyResumeVerdict, emergencyTogglePreAction, killSwitchVerdict } from './src/utils/emergencyTruth';
import { formatLiveActionItem, whisperTipForDisplay } from './src/utils/hardening/callSummaryTruth';
import { recordedChannelTitle, describeStagedChannel } from './src/utils/hardening/youtubeChannelTruth';
import { classifyYouTubeDraftUpdate } from './src/utils/hardening/youtubeDraftUpdateTruth';
import { observedAccountName, describeVerifiedAccount, disconnectAccountLabel } from './src/utils/hardening/socialAccountIdTruth';
import { securityMatrixPosture } from './src/utils/hardening/securityMatrixTruth';
import { privacyMatrixTruth, schedulerTruth, daemonSchedulerTruth, type RoutineSpec } from './src/utils/hardening/mobileTelemetryTruth';
import { schedulerRunLogLine, type SchedulerPushOutcome } from './src/utils/hardening/schedulerRunTruth';
import { youtubeVoiceStatusReply } from './src/utils/hardening/youtubeVoiceStatusTruth';
import { formatYouTubeSummaryNotice } from './src/utils/hardening/youtubeSummaryNoticeTruth';
import { classifyPhonePermissionUpdate } from './src/utils/hardening/phonePermissionUpdateTruth';
import {
  applyPhonePermissionUpdate,
  type PhonePermissionStore,
} from './src/utils/hardening/phonePermissionStoreTruth';
import { classifyTelephonySettingsUpdate, TELEPHONY_SETTING_KEYS } from './src/utils/hardening/telephonySettingsTruth';
import { classifyTelephonySuiteRun } from './src/utils/hardening/telephonySuiteTruth';
import { resolveRawNumber } from './src/utils/hardening/telephonyOwnNumberTruth';
import { classifyMemoryUpdate } from './src/utils/hardening/memoryUpdateTruth';
import { classifyMemorySync } from './src/utils/hardening/memorySyncTruth';
import { classifySecurityMatrixUpdate, applySecurityMatrixUpdate } from './src/utils/hardening/securityMatrixUpdateTruth';
import {
  applyBlueprintToggle,
  cloneBlueprintPhases,
  overlayPersistedPhases,
  type BlueprintPhase,
} from './src/utils/hardening/blueprintToggleTruth';
import { resolveRoutineTrigger, routineTriggerDelivery } from './src/utils/hardening/routineTriggerTruth';
import { classifyLeadStatusUpdate } from './src/utils/hardening/freelanceLeadStatusTruth';
import { classifyTelephonyCallDeletion } from './src/utils/hardening/telephonyCallDeleteTruth';
import { classifyTelephonyCallRecord } from './src/utils/hardening/telephonyCallRecordTruth';
import { classifyOutboundAuthorization } from './src/utils/hardening/outboundAuthorizationTruth';
import { classifyBridgeHeartbeat } from './src/utils/hardening/bridgeHeartbeatTruth';
import { classifyBridgeDisconnect } from './src/utils/hardening/bridgeDisconnectTruth';
import { classifyBridgeEvent } from './src/utils/hardening/bridgeEventTruth';
import {
  getEmergencyState,
  toggleEmergencyStop,
  activateEmergencyKillSwitch,
  resumeSystemOperation,
  isFinanceBlocked,
  getPendingApprovals,
  getAllActionRequests,
  createPendingActionRequest,
  updateActionRequestStatus,
  canTransitionActionStatus,
  realFsList,
  realFsRead,
  realFsSearch,
  realFsWrite,
  realFsDelete,
  realGitStatus,
  realGitLog,
  realGitDiff,
  realGithubStatus,
  realGithubRepos,
  realGithubCreateIssue,
  realWebFetch,
  realEmailStatus,
  getIntegrationsAuditReport,
  extractYouTubeVideoId,
  fetchYouTubeTranscriptData,
  buildYouTubeSummary,
  YouTubeSummaryResult,
  YouTubeVideoInfo,
  YouTubeTranscriptSegment,
  runFinanceGuardSelfCheck,
  persistedEmergencyState,
  hydrateEmergencyState,
  type EmergencyPersistedState,
  persistedActionRequests,
  hydrateActionRequests,
  type PermissionActionRequest,
} from './server_tools';
import {
  TelephonySessionManager,
} from './src/utils/telephonySessionManager';
import { bargeInApplied, silenceTimeoutApplied } from './src/utils/telephonyEndpointTruth';
import {
  TelephonyProviderRegistry,
} from './src/utils/telephonyAdapters';
import {
  telephonyEngineProviderId,
  telephonyEngineMode,
  telephonyEngineLabel,
  telephonySelectionApplied,
  telephonyEngineCanDial,
  telephonyDialRefusal,
  SIMULATION_PROVIDER_ID,
} from './src/utils/telephonyGatewayTruth';
import {
  runTelephonyTestSuite,
} from './src/utils/telephonyTestRunner';
import {
  telephonyDispatchVerdict,
  telephonyDispatchReply,
  TelephonyDispatchPhase,
} from './src/utils/telephonyDispatchTruth';
import {
  extractDialTarget,
  offlineCallMissingNumberVerdict,
} from './src/utils/computerOperator/offlineCallTruth';
import {
  launchVerdict,
  launchReply,
} from './src/utils/computerOperator/launchDispatchTruth';
import { screenshotVerdict, screenshotReply } from './src/utils/computerOperator/screenshotDispatchTruth';
import { volumeVerdict, volumeReply } from './src/utils/computerOperator/audioDispatchTruth';
import { powerVerdict, powerReply } from './src/utils/computerOperator/powerDispatchTruth';
import { browserOpenVerdict, browserOpenActionDetail, searchDispatch } from './src/utils/browserDispatchTruth';
import {
  fixProjectErrorReply,
  operatorTaskExecuted,
  screenInspectionExecuted,
  screenInspectionReply,
  cancelComputerTaskVerdict,
} from './src/utils/computerOperator/operatorReplyTruth';
import { observationPerformed } from './src/utils/computerOperator/observationTruth';
import { emergencyToggleVerdict } from './src/utils/computerOperator/offlineEmergencyTruth';
import {
  toolActionExecuted,
  toolActionResultReply,
  countedItems,
} from './src/utils/toolDispatchTruth';
import {
  loadPhonePermissions,
  savePhonePermissions,
  maskPhoneNumber,
  DEFAULT_CLINIC_CONFIG,
  evaluateClinicSafety,
  checkHumanHandoffIntent,
  DEFAULT_PHONE_PERMISSIONS,
  PHONE_PERMISSION_DEFINITIONS,
} from './src/utils/telephonyPermissions';
import {
  ComputerOperatorEngine,
  ScreenObserver,
  ScreenInterpreter,
  TaskTracker,
} from './src/utils/computerOperator';
import { AndroidBridgeGateway, type DeviceTelemetryInput } from './src/utils/androidBridgeGateway';
import { maskAndroidCallerNumber } from './src/utils/androidBridgePrivacy';
import { EXECUTION_OUTCOMES, type ExecutionOutcome } from './src/utils/executionTruth';
import { classifyApprovalOutcome, formatUnconfirmedMobileApprovalReply } from './src/utils/hardening/approvalResolution';
import { classifyApprovalCreate } from './src/utils/hardening/approvalCreateTruth';
import { classifyOutboundStage, classifyStagedDraft } from './src/utils/hardening/outboundStageTruth';
import { classifyApprovalDecision } from './src/utils/github/approvalQueue';
import {
  observeInstanceFromHost,
  describeRunState,
  describePublicIp,
} from './src/utils/hardening/ociInstanceTruth';
import { describeBillingCost, describeDeclaredCost, declaredCostCell } from './src/utils/hardening/billingEntitlementTruth';
import { processUptimeLabel } from './src/utils/hardening/processUptimeTruth';
import { assessedServerStatus, describeServerHealthClaim } from './src/utils/hardening/serverHealthTruth';
import {
  telegramHostClaim,
  telegramSeedMessages,
} from './src/utils/hardening/telegramHostClaim';
import { aiEngineProviderLabel, aiEngineModelName } from './src/utils/hardening/aiEngineTruth';
import {
  gatewaySendResult,
  telegramGatewayBubble,
  telegramGatewayNotice,
} from './src/utils/hardening/telegramSendTruth';
import {
  buildDeliveryReceipt,
  classifyTelegramError,
  interpretTelegramSend,
  type DeliveryInterpretation,
} from './src/utils/communication/telegramDelivery';
import { assembleAiContext } from './src/utils/memory/aiContext';
import { auditSecrets } from './src/utils/computerOperator/credentialRedactor';
import { mergeMemorySnapshots } from './src/utils/memory/memoryConflict';
import {
  evaluatePermission,
  isBlockedByKillSwitch,
  PERMISSION_MATRIX,
  UNKNOWN_ACTION_DECISION,
} from './src/utils/hardening/permissionMatrix';
import {
  grantedScopesFromTokenResponse,
  scopeGranted,
  publishScopeGranted,
  PLATFORM_PUBLISH_SCOPES,
} from './src/utils/socialPublishHonesty';
import {
  createBackup,
  restoreBackup,
  verifyBackup,
} from './src/utils/hardening/backupRestore';
import {
  runSecurityAudit,
  isAuditClean,
  summariseAudit,
} from './src/utils/hardening/securityAudit';
import {
  verifyDeployment,
  deploymentBlockers,
} from './src/utils/hardening/deploymentVerification';
import {
  sampleHostTelemetry,
  type HostTelemetry,
} from './src/utils/hardening/hostTelemetry';
import { AutonomousGoalRunner } from './src/utils/autonomous/goalRunner';
import type { StepDescriptor } from './src/utils/autonomous/stepLibrary';
import {
  dueGoals,
  nextScheduledOccurrence,
  type ScheduledGoal,
  type ScheduledGoalRecord,
} from './src/utils/autonomous/schedule';
import { publishWithRetry } from './src/utils/social/publishRetry';
import {
  captureScreenshot,
  getCaptureAvailability,
  resolveScreenshotRoot,
} from './src/utils/computerOperator/screenshotStore';
import { hostActionCapabilities, HostActionExecutor } from './src/utils/computerOperator/actionExecutorHost';
import { describeHost, describeHostScreen } from './src/utils/computerOperator/hostProbe';
import type { ComputerAction } from './src/types/computerOperator';
import {
  githubTokenStatus,
  listRepositories,
  scanRepository,
  scanAllRepositories,
} from './src/utils/github/repoScanner';
import { runHealthChecks, type CheckKind } from './src/utils/github/localHealth';
import { buildFixPlan } from './src/utils/github/fixPlanner';
import { assessFixPlanCoverage, reconcileFixPlanWithCoverage } from './src/utils/hardening/fixPlanCoverage';
import {
  runNightlyCheck,
  nightlyHistory,
  nextRunAt,
  DEFAULT_NIGHTLY_CONFIG,
  type NightlyRunRecord,
} from './src/utils/github/nightlyScheduler';
import { ApprovalQueue } from './src/utils/github/approvalQueue';
import { PROTECTED_BRANCH_NAMES } from './src/utils/github/automationWorkflow';

/** Real host action executor, used by the operator endpoints. */
const hostActionExecutor = new HostActionExecutor({ workspaceRoot: process.cwd() });

// Install the real executor and a real screen observer so the operator engine
// performs (and verifies) actions against the actual host instead of narrating
// them. Without this the engine would fall back to the browser-routing client.
ComputerOperatorEngine.setExecutor(hostActionExecutor);

// Point the screen observer at the real host desktop instead of its built-in
// illustrative view, so observations reflect the machine JARVIS is running on.
ScreenObserver.setSource((options) =>
  describeHostScreen(process.cwd(), { includeScreenshot: options.includeScreenshot })
);

// ==============================================================================
// 1. PROCESS SUPERVISION & GLOBAL SAFETY GUARDS (24/7 DAEMON RESILIENCE)
// ==============================================================================
const DAEMON_BOOT_TIME = new Date().toISOString();
const DAEMON_PID = process.pid;

process.on('uncaughtException', (err) => {
  console.warn('[Daemon Process Guard] Uncaught Exception caught safely:', err?.message || err);
});

process.on('unhandledRejection', (reason: any) => {
  console.warn('[Daemon Process Guard] Unhandled Rejection caught safely:', reason?.message || reason);
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('[Daemon] SIGTERM received. Persisting state and shutting down gracefully...');
  persistMemory();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[Daemon] SIGINT received. Persisting state and shutting down gracefully...');
  persistMemory();
  process.exit(0);
});

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '10mb' }));

// ==============================================================================
// 2. SECURE SERVER-SIDE TOKEN VAULT (AES-256-GCM ENCRYPTION)
// ==============================================================================
// The token vault key must come from the environment. A hardcoded fallback was
// committed here previously, which means anyone with the source could decrypt
// the vault. When no secret is configured we generate a random per-process key
// instead: tokens then cannot be decrypted after a restart, but they are never
// protected by a publicly-known key. Vault status is reported as NOT_CONFIGURED.
const VAULT_SECRET = process.env.APP_SECRET || process.env.SESSION_SECRET || '';
export const VAULT_CONFIGURED = VAULT_SECRET.length > 0;

if (!VAULT_CONFIGURED) {
  console.warn(
    '[Vault] Neither APP_SECRET nor SESSION_SECRET is set. The token vault is NOT_CONFIGURED ' +
      'and is using a random per-process key; stored tokens will not survive a restart.'
  );
}

const VAULT_KEY = VAULT_CONFIGURED
  ? crypto.scryptSync(VAULT_SECRET, 'hermes_salt_vault_2026', 32)
  : crypto.randomBytes(32);

// Number of bugs that block a production deployment. Kept as an explicit count
// rather than a bare `false` so that a newly discovered blocking bug has an
// obvious place to be recorded, and the deployment check reports it honestly.
// Update this whenever a blocking bug is found or fixed; see
// docs/COMPLETION_STATUS.md for the current list.
const KNOWN_BLOCKING_BUGS = Number(process.env.HERMES_KNOWN_BLOCKING_BUGS ?? '0');

interface EncryptedVaultData {
  iv: string;
  content: string;
  tag: string;
}

function encryptToken(text: string): EncryptedVaultData {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', VAULT_KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return {
    iv: iv.toString('hex'),
    content: encrypted,
    tag,
  };
}

function decryptToken(encrypted: EncryptedVaultData | string): string {
  if (typeof encrypted === 'string') {
    return encrypted;
  }
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', VAULT_KEY, Buffer.from(encrypted.iv, 'hex'));
    decipher.setAuthTag(Buffer.from(encrypted.tag, 'hex'));
    let decrypted = decipher.update(encrypted.content, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (e: any) {
    console.warn('[Vault] Token decryption error:', e.message);
    return '';
  }
}

// ==============================================================================
// 3. DURABLE PERSISTENT STATE ENGINE & MULTI-TIER MEMORY
// ==============================================================================
const MEMORY_FILE_PATH =
  process.env.JARVIS_MEMORY_FILE || path.join(process.cwd(), 'jarvis_memory.json');

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  action: string;
  levelRequired: 1 | 2 | 3 | 4;
  approvedBy: string;
  status: 'EXECUTED' | 'BLOCKED' | 'PENDING' | 'VERIFIED' | 'FAILED' | 'NOT_PUBLISHED' | string;
  targetPlatform?: string;
  verificationStatus?: 'VERIFIED' | 'UNVERIFIED' | 'MISSING_CREDENTIALS' | 'PROVIDER_ERROR' | 'STANDBY';
  errorReason?: string;
  providerUrn?: string;
  finalTruthState?: 'VERIFIED' | 'FAILED' | 'DRAFT' | 'REJECTED' | 'NOT_PUBLISHED' | string;
  actionId?: string;
  /**
   * Provenance. Present only on entries this process appended itself; seeds and
   * legacy persisted rows lack it and are never presented as executed work.
   */
  source?: string;
}

export interface ServerSocialPost {
  id: string;
  platform: string;
  topic: string;
  topicHi?: string;
  content: string;
  /** Origin of `content`: model output vs a fixed local fallback template. */
  generationSource?: 'ai' | 'local_template';
  aiGenerated?: boolean;
  generationNotice?: string;
  hashtags: string[];
  creativePrompt: string;
  status: 'draft' | 'pending_approval' | 'approved' | 'published' | 'not_published' | 'failed' | string;
  scheduledTime?: string;
  likesSimulated?: number;
  executionStatus?: 'DRAFT' | 'PENDING_APPROVAL' | 'QUEUED' | 'EXECUTING' | 'SUCCESS' | 'FAILED' | 'VERIFIED' | 'NOT_PUBLISHED' | 'UNVERIFIED';
  verificationStatus?: 'VERIFIED' | 'UNVERIFIED' | 'MISSING_CREDENTIALS' | 'PROVIDER_ERROR' | 'STANDBY';
  errorReason?: string;
  providerUrn?: string;
  verifiedAt?: string;
  finalTruthState?: 'VERIFIED' | 'FAILED' | 'DRAFT' | 'REJECTED' | 'NOT_PUBLISHED' | 'UNVERIFIED';
  videoTitle?: string;
  videoDescription?: string;
  privacyStatus?: 'private' | 'unlisted' | 'public';
  targetChannel?: string;
  videoUrl?: string;
  isTestUpload?: boolean;
  videoFileName?: string;
  videoPayloadBase64?: string;
  videoFilePath?: string;
  scheduledPublishTime?: string;
}

export interface ServerFreelanceLead {
  id: string;
  clientName: string;
  source: string;
  projectType: string;
  rawRequirement: string;
  budgetEstimate: { currency: string; amount: number | null };
  status: string;
  createdAt: string;
  quotation?: {
    scopeSummary: string;
    timelineDays: number;
    totalPrice: number;
    milestones: { title: string; price: number; days: number }[];
  };
}

export interface ServerLinkedInConnection {
  connected: boolean;
  authType: 'OAUTH_2_0' | 'STATIC_ENV_TOKEN';
  memberSub?: string;
  authorUrn?: string;
  name?: string;
  email?: string;
  picture?: string;
  connectedAt?: string;
  expiresAt?: string;
  scopes?: string[];
  accessToken?: string; // In-memory cached token
  accessTokenEncrypted?: EncryptedVaultData; // Encrypted on-disk format
  errorReason?: string;
}

export interface ServerYouTubeConnection {
  connected: boolean;
  authType: 'OAUTH_2_0' | 'STATIC_ENV_TOKEN' | 'API_KEY';
  channelId?: string;
  channelTitle?: string;
  customUrl?: string;
  avatarUrl?: string;
  connectedAt?: string;
  expiresAt?: string;
  scopes?: string[];
  accessToken?: string; // In-memory cached token
  accessTokenEncrypted?: EncryptedVaultData; // Encrypted on-disk format
  refreshToken?: string; // In-memory cached refresh token
  refreshTokenEncrypted?: EncryptedVaultData; // Encrypted on-disk format
  errorReason?: string;
}

interface MemoryData {
  name?: string;
  notes: { id: string; title: string; content: string; createdAt: string }[];
  customKeyValues: Record<string, string>;
  stats: {
    totalCommands: number;
    actionsExecuted: number;
    lastActive: string;
  };
  processedTelegramUpdates: number[];
  socialPosts: ServerSocialPost[];
  auditLogs: AuditLogEntry[];
  freelanceLeads: ServerFreelanceLead[];
  linkedInConnection?: ServerLinkedInConnection;
  youTubeConnection?: ServerYouTubeConnection;
  schedulerState: {
    lastMorningRunDate?: string;
    lastMiddayRunDate?: string;
    lastEveningRunDate?: string;
    lastNightRunDate?: string;
    /**
     * Operator-registered recurring goals. Persisted so a restart does not
     * silently drop them — the register route may report success only once the
     * task is durable.
     */
    scheduledGoals?: ScheduledGoalSpec[];
    /** Last date each goal ran, keyed by goal id. */
    lastAutonomousGoalRuns?: Record<string, string>;
  };
  /**
   * Operator-ticked blueprint deliverables. Persisted so the Master Blueprint
   * modal's readiness checklist survives a restart instead of silently
   * reverting to the archived design state.
   */
  blueprintPhases?: unknown[];
  /** Recent conversation turns, kept server-side so context survives a client reset. */
  conversationHistory?: {
    role: 'user' | 'jarvis';
    content: string;
    timestamp: string;
  }[];
  /**
   * The Security Matrix gates (level, human approval, masking, credential-leak
   * protection). Persisted so an operator's toggle survives a restart — the
   * update route may report a save only once the gate is durable.
   */
  securityMatrix?: SecurityMatrixPersistedState;
  /**
   * The emergency stop / global kill-switch freeze. Persisted so a safety stop
   * an operator engaged survives a restart — a freeze that evaporates on reboot
   * is worse than none, because the operator still believes it holds.
   */
  emergencyState?: EmergencyPersistedState;
  /**
   * The Level-3/4 approval queue. Persisted so a pending human approval (and its
   * terminal decisions) survives a restart instead of silently emptying — an
   * approval card the operator resolves after a reboot must act on the same
   * request it was shown.
   */
  permissionRequests?: PermissionActionRequest[];
  /**
   * The telephony settings the operator saved (provider, greeting, voice rate,
   * screening flags...). Persisted so a save survives a restart — the settings
   * route may report a stored setting only once it is durable, or the operator
   * is told "SAVED" for a change that silently reverts on the next boot.
   */
  telephonySettings?: Record<string, unknown>;
  /**
   * The telephony call history. Persisted so a recorded call (and a deletion)
   * survives a restart — the call routes may report a stored or removed record
   * only once it is durable, or a call the operator logged silently disappears
   * on the next boot.
   */
  telephonyCallRecords?: unknown[];
}

/**
 * The durable subset of the Security Matrix. Only the operator-settable gates
 * are stored; the descriptive `levels` catalog is static and re-derived on boot.
 */
interface SecurityMatrixPersistedState {
  currentLevel: 1 | 2 | 3 | 4;
  humanApprovalForExternal: boolean;
  maskSensitiveData: boolean;
  credentialLeakProtection: boolean;
}

const defaultSocialPosts: ServerSocialPost[] = [
  {
    id: 'post-1',
    platform: 'LinkedIn',
    topic: 'How Autonomous AI Agents are transforming Freelance Engineering',
    topicHi: 'ऑटोनॉमस एआई एजेंट्स कैसे फ्रीलांसिंग को बदल रहे हैं',
    content: '🚀 The future of engineering isn\'t writing code manually from scratch — it\'s orchestrating autonomous AI agents like Hermes and Jarvis.\n\nFrom handling automated client requirement audits to drafting quotations and managing cloud servers, our Always-Free Oracle ARM stack delivers ₹0 infrastructure cost with enterprise capabilities.\n\nAre you building single-task chatbots or full autonomous agents?\n\n#ArtificialIntelligence #FreelanceTech #DevOps #OracleCloud #AutonomousAgents #BuildInPublic',
    hashtags: ['#ArtificialIntelligence', '#FreelanceTech', '#DevOps', '#OracleCloud', '#AutonomousAgents'],
    creativePrompt: 'Futuristic sci-fi holographic workspace showing an AI core managing multiple cloud nodes and mobile notifications, 8k resolution, cinematic lighting.',
    status: 'pending_approval',
    scheduledTime: 'Today at 05:00 PM IST',
    likesSimulated: 0,
    executionStatus: 'PENDING_APPROVAL',
    verificationStatus: 'STANDBY',
    finalTruthState: 'DRAFT',
  },
  {
    id: 'post-2',
    platform: 'Twitter/X',
    topic: 'Oracle Always Free ARM VM Guide',
    topicHi: 'ओरेकल ऑलवेज फ्री एआरएम वीएम गाइड',
    content: '💡 PSA for developers:\nOracle Cloud offers 4 ARM OCPUs, 24GB RAM, and 200GB storage completely ₹0 / forever.\n\nPair it with an autonomous AI agent + Telegram webhook, and you have a 24/7 personal assistant on your phone without paying a penny.\n\nThread below on how we set up Phase 0 & 1 👇',
    hashtags: ['#CloudComputing', '#OracleCloud', '#Developers', '#AI'],
    creativePrompt: 'Minimalist tech diagram of mobile connected to cloud server with zero cost badge.',
    status: 'draft',
    scheduledTime: 'Tomorrow at 10:00 AM IST',
    likesSimulated: 0,
    executionStatus: 'DRAFT',
    verificationStatus: 'STANDBY',
    finalTruthState: 'DRAFT',
  },
];

// A cold start begins with an empty audit trail. This array previously seeded
// three fabricated records — a Level 1 repository read, a Level 2 LinkedIn
// draft and a Level 2 client quotation — each stamped 'EXECUTED' and
// /VERIFIED, none of which this process had performed. The Security Matrix
// rendered them as "Real-Time Execution Logs", so the operator saw invented
// external work presented as executed and verified.
const defaultAuditLogs: AuditLogEntry[] = [];

/**
 * Append an audit entry and stamp its provenance. Every write to
 * `memoryState.auditLogs` must go through here so the trail can distinguish
 * events this process really recorded from seeds and legacy rows.
 */
function pushAuditEntry(entry: AuditLogEntry): AuditLogEntry {
  entry.source = AUDIT_LOG_SOURCE_RECORDED;
  memoryState.auditLogs.unshift(entry);
  if (memoryState.auditLogs.length > 100) {
    memoryState.auditLogs = memoryState.auditLogs.slice(0, 100);
  }
  return entry;
}

const defaultFreelanceLeads: ServerFreelanceLead[] = [
  {
    id: 'lead-1',
    clientName: 'Aarav Tech Solutions (Bengaluru)',
    source: 'Website Form',
    projectType: 'AI Integration',
    rawRequirement: 'Need an autonomous customer support chatbot with WhatsApp integration and CRM sync.',
    budgetEstimate: { currency: 'INR', amount: 65000 },
    status: 'Quotation Sent',
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    quotation: {
      scopeSummary: 'Autonomous multi-lingual WhatsApp AI bot with CRM lead capture & real-time notification webhook.',
      timelineDays: 10,
      totalPrice: 65000,
      milestones: [
        { title: 'Architecture & WhatsApp Business API Setup', price: 20000, days: 3 },
        { title: 'Gemini AI Prompt & Intent Engine', price: 25000, days: 4 },
        { title: 'CRM Database Sync & Testing', price: 20000, days: 3 },
      ],
    },
  },
  {
    id: 'lead-2',
    clientName: 'Global Horizon Exports',
    source: 'Telegram AI Bot',
    projectType: 'Full-Stack Web App',
    rawRequirement: 'B2B product catalog portal with inventory tracker and PDF quotation generator.',
    budgetEstimate: { currency: 'INR', amount: 85000 },
    status: 'AI Requirements Extracted',
    createdAt: new Date(Date.now() - 28800000).toISOString(),
  },
];

/**
 * The compile-time Security Matrix gates. `securityMatrixState` is declared
 * further down, so `memoryState` seeds from this literal and the boot hydration
 * (below the declaration) overwrites it with whatever the file holds.
 */
const SECURITY_MATRIX_DEFAULTS: SecurityMatrixPersistedState = {
  currentLevel: 2,
  humanApprovalForExternal: true,
  maskSensitiveData: true,
  credentialLeakProtection: true,
};

/**
 * The durable gate values, read straight from `memoryState`. This is the single
 * source of truth for what `persistSecurityMatrixState` writes, so the writer and
 * the in-memory matrix can never drift.
 */
function persistedSecurityMatrix(): SecurityMatrixPersistedState {
  return {
    currentLevel: securityMatrixState.currentLevel,
    humanApprovalForExternal: securityMatrixState.humanApprovalForExternal,
    maskSensitiveData: securityMatrixState.maskSensitiveData,
    credentialLeakProtection: securityMatrixState.credentialLeakProtection,
  };
}

let memoryState: MemoryData = {
  name: '',
  notes: [
    {
      id: '1',
      title: 'Project Setup Notes',
      content: 'Hermes Jarvis Autonomous Core running on Oracle Always Free ARM VM with 24/7 daemon resilience and strict Level-4 verification.',
      createdAt: new Date().toISOString(),
    },
  ],
  customKeyValues: {
    protocol: 'Hermes Jarvis Daemon V2.5',
    runtime: 'Node.js + Oracle ARM64 Always Free',
    status: 'ONLINE',
    persistence: 'Durable Disk Sync (jarvis_memory.json)',
  },
  stats: {
    totalCommands: 0,
    actionsExecuted: 0,
    lastActive: new Date().toISOString(),
  },
  processedTelegramUpdates: [],
  socialPosts: defaultSocialPosts,
  auditLogs: defaultAuditLogs,
  freelanceLeads: defaultFreelanceLeads,
  schedulerState: {},
  securityMatrix: { ...SECURITY_MATRIX_DEFAULTS },
  emergencyState: { emergencyPaused: false, hardKillSwitchTriggered: false },
};

// Load memory from disk on startup
try {
  if (fs.existsSync(MEMORY_FILE_PATH)) {
    const raw = fs.readFileSync(MEMORY_FILE_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    // Prefer whatever is on disk — including an intentionally empty array. The
    // previous `length > 0` guards silently restored seed data, so deleting every
    // note or lead and restarting brought them all back.
    const coerceArray = <T,>(value: unknown, fallback: T[]): T[] =>
      Array.isArray(value) ? (value as T[]) : fallback;
    const coerceKeyValues = (
      value: unknown,
      fallback: Record<string, string>,
    ): Record<string, string> =>
      value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, string>)
        : fallback;

    memoryState = {
      ...memoryState,
      ...parsed,
      notes: coerceArray(parsed.notes, memoryState.notes),
      customKeyValues: coerceKeyValues(parsed.customKeyValues, memoryState.customKeyValues),
      stats: { ...memoryState.stats, ...(parsed.stats || {}) },
      processedTelegramUpdates: coerceArray(parsed.processedTelegramUpdates, []),
      socialPosts: coerceArray(parsed.socialPosts, memoryState.socialPosts),
      auditLogs: coerceArray(parsed.auditLogs, memoryState.auditLogs),
      freelanceLeads: coerceArray(parsed.freelanceLeads, memoryState.freelanceLeads),
      conversationHistory: coerceArray(parsed.conversationHistory, []),
      schedulerState: parsed.schedulerState || {},
      securityMatrix: parsed.securityMatrix,
      emergencyState: parsed.emergencyState,
      linkedInConnection: parsed.linkedInConnection ? {
        ...parsed.linkedInConnection,
        accessToken: parsed.linkedInConnection.accessTokenEncrypted
          ? decryptToken(parsed.linkedInConnection.accessTokenEncrypted)
          : parsed.linkedInConnection.accessToken,
      } : undefined,
      youTubeConnection: parsed.youTubeConnection ? {
        ...parsed.youTubeConnection,
        accessToken: parsed.youTubeConnection.accessTokenEncrypted
          ? decryptToken(parsed.youTubeConnection.accessTokenEncrypted)
          : parsed.youTubeConnection.accessToken,
        refreshToken: parsed.youTubeConnection.refreshTokenEncrypted
          ? decryptToken(parsed.youTubeConnection.refreshTokenEncrypted)
          : parsed.youTubeConnection.refreshToken,
      } : undefined,
    };
  }
} catch (err: any) {
  console.warn('[Storage] Could not read jarvis_memory.json, using default in-memory state:', err?.message);
}

export function getDecryptedLinkedInAccessToken(): string {
  const conn = memoryState.linkedInConnection;
  if (conn?.accessToken && typeof conn.accessToken === 'string' && conn.accessToken.length > 5) {
    return conn.accessToken;
  }
  if (conn?.accessTokenEncrypted) {
    const decrypted = decryptToken(conn.accessTokenEncrypted);
    if (decrypted) {
      conn.accessToken = decrypted;
      return decrypted;
    }
  }
  const envToken = (process.env.LINKEDIN_ACCESS_TOKEN || '').trim();
  return envToken;
}

export function getDecryptedYouTubeAccessToken(): string {
  const conn = memoryState.youTubeConnection;
  if (conn?.accessToken && typeof conn.accessToken === 'string' && conn.accessToken.length > 5) {
    return conn.accessToken;
  }
  if (conn?.accessTokenEncrypted) {
    const decrypted = decryptToken(conn.accessTokenEncrypted);
    if (decrypted) {
      conn.accessToken = decrypted;
      return decrypted;
    }
  }
  const envToken = (process.env.YOUTUBE_ACCESS_TOKEN || '').trim();
  return envToken;
}

export function getDecryptedYouTubeRefreshToken(): string {
  const conn = memoryState.youTubeConnection;
  if (conn?.refreshToken && typeof conn.refreshToken === 'string' && conn.refreshToken.length > 5) {
    return conn.refreshToken;
  }
  if (conn?.refreshTokenEncrypted) {
    const decrypted = decryptToken(conn.refreshTokenEncrypted);
    if (decrypted) {
      conn.refreshToken = decrypted;
      return decrypted;
    }
  }
  const envToken = (process.env.YOUTUBE_REFRESH_TOKEN || '').trim();
  return envToken;
}

export async function ensureValidYouTubeToken(): Promise<{ valid: boolean; token: string; error?: string }> {
  const conn = memoryState.youTubeConnection;
  const currentToken = getDecryptedYouTubeAccessToken();
  const refreshToken = getDecryptedYouTubeRefreshToken();
  const clientId = (process.env.YOUTUBE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '').trim();
  const clientSecret = (process.env.YOUTUBE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || '').trim();

  // If token exists and has expiry info
  if (currentToken && conn?.expiresAt) {
    const expiresTimestamp = new Date(conn.expiresAt).getTime();
    if (Date.now() < expiresTimestamp - 60000) {
      return { valid: true, token: currentToken };
    }
  } else if (currentToken && !conn?.expiresAt) {
    return { valid: true, token: currentToken };
  }

  // Attempt token refresh if refreshToken is available
  if (refreshToken && clientId && clientSecret) {
    try {
      const resp = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }).toString(),
      });

      const tokenData: any = await resp.json().catch(() => null);
      if (resp.ok && tokenData?.access_token) {
        const newAccessToken = tokenData.access_token;
        const expiresIn = tokenData.expires_in || 3600;

        if (conn) {
          conn.accessToken = newAccessToken;
          conn.expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
        } else {
          memoryState.youTubeConnection = {
            connected: true,
            authType: 'OAUTH_2_0',
            accessToken: newAccessToken,
            refreshToken,
            expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
            connectedAt: new Date().toISOString(),
          };
        }
        persistMemory();
        return { valid: true, token: newAccessToken };
      } else {
        const errDetail = tokenData?.error_description || tokenData?.error || `HTTP status ${resp.status}`;
        return { valid: false, token: '', error: `Token refresh failed: ${errDetail}` };
      }
    } catch (ex: any) {
      return { valid: false, token: '', error: `Refresh network exception: ${ex.message}` };
    }
  }

  if (currentToken) {
    return { valid: true, token: currentToken };
  }

  return { valid: false, token: '', error: 'No valid YouTube access token or refresh token available' };
}

let lastPersistedTimestamp = new Date().toISOString();
/** Write the in-memory state to disk. Returns whether the state is on disk. */
function persistMemory(): boolean {
  try {
    // Keep max 200 processed updates to save space
    if (memoryState.processedTelegramUpdates.length > 200) {
      memoryState.processedTelegramUpdates = memoryState.processedTelegramUpdates.slice(-200);
    }
    // Keep max 100 audit logs
    if (memoryState.auditLogs.length > 100) {
      memoryState.auditLogs = memoryState.auditLogs.slice(0, 100);
    }

    // Clone state and ensure sensitive token is encrypted on disk
    const diskState = { ...memoryState };
    if (diskState.linkedInConnection) {
      const rawToken = diskState.linkedInConnection.accessToken || (diskState.linkedInConnection.accessTokenEncrypted ? decryptToken(diskState.linkedInConnection.accessTokenEncrypted) : '');
      diskState.linkedInConnection = {
        ...diskState.linkedInConnection,
        accessToken: undefined, // Never save plaintext token in disk JSON
        accessTokenEncrypted: rawToken ? encryptToken(rawToken) : diskState.linkedInConnection.accessTokenEncrypted,
      };
    }
    if (diskState.youTubeConnection) {
      const rawAccessToken = diskState.youTubeConnection.accessToken || (diskState.youTubeConnection.accessTokenEncrypted ? decryptToken(diskState.youTubeConnection.accessTokenEncrypted) : '');
      const rawRefreshToken = diskState.youTubeConnection.refreshToken || (diskState.youTubeConnection.refreshTokenEncrypted ? decryptToken(diskState.youTubeConnection.refreshTokenEncrypted) : '');
      diskState.youTubeConnection = {
        ...diskState.youTubeConnection,
        accessToken: undefined, // Never save plaintext access token in disk JSON
        refreshToken: undefined, // Never save plaintext refresh token in disk JSON
        accessTokenEncrypted: rawAccessToken ? encryptToken(rawAccessToken) : diskState.youTubeConnection.accessTokenEncrypted,
        refreshTokenEncrypted: rawRefreshToken ? encryptToken(rawRefreshToken) : diskState.youTubeConnection.refreshTokenEncrypted,
      };
    }

    // Re-encrypting on every boot rewrites identical tokens into new ciphertext,
    // which churns the committed memory file for no benefit. Only write when the
    // serialized state actually changed.
    const serialized = JSON.stringify(diskState, null, 2);
    try {
      if (fs.existsSync(MEMORY_FILE_PATH) && fs.readFileSync(MEMORY_FILE_PATH, 'utf-8') === serialized) {
        lastPersistedTimestamp = new Date().toISOString();
        return true;
      }
    } catch {
      // Fall through and write.
    }

    fs.writeFileSync(MEMORY_FILE_PATH, serialized, 'utf-8');
    lastPersistedTimestamp = new Date().toISOString();
    return true;
  } catch (err: any) {
    console.warn('[Storage] Error writing to jarvis_memory.json:', err?.message);
    return false;
  }
}

/**
 * True only when the audit row with `id` is present in the memory file on disk.
 * `persistMemory()` can return true without writing when the file already holds
 * the identical bytes, so a route that appends a row and then persists needs a
 * disk check to be sure the row is durable rather than trusting the boolean.
 */
function diskHasAuditRow(id: string): boolean {
  try {
    const onDisk = JSON.parse(fs.readFileSync(MEMORY_FILE_PATH, 'utf-8'));
    const rows: AuditLogEntry[] = Array.isArray(onDisk.auditLogs) ? onDisk.auditLogs : [];
    return rows.some((r) => r?.id === id);
  } catch {
    return false;
  }
}

/**
 * Append `entry` to the audit log and report whether it is durable.
 *
 * `persistMemory()` returns true without writing when the file already holds
 * identical bytes, so a route that only trusts that boolean can record a
 * `VERIFIED` audit row the next boot does not have. When the write does not
 * reach disk the phantom row is removed from the in-memory log so the running
 * process never claims history it cannot keep.
 */
function recordDurableAuditRow(entry: AuditLogEntry): boolean {
  pushAuditEntry(entry);
  if (persistMemory() && diskHasAuditRow(entry.id)) return true;
  memoryState.auditLogs = memoryState.auditLogs.filter((e) => e.id !== entry.id);
  return false;
}

/**
 * True only when the memory file on disk carries the expected `emergencyPaused`
 * latch. `persistMemory()` can return true without writing when the file already
 * holds the identical bytes, so a safety route that reports the freeze as
 * durable must read the latch back rather than trust the boolean.
 */
function emergencyStateOnDisk(expected: boolean): boolean {
  try {
    const onDisk = JSON.parse(fs.readFileSync(MEMORY_FILE_PATH, 'utf-8'));
    return onDisk?.emergencyState?.emergencyPaused === expected;
  } catch {
    return false;
  }
}

/**
 * True only when the approval request `id` is present in the memory file on disk
 * with the expected terminal status. `persistMemory()` can return true without
 * writing when the file already holds the identical bytes, so a route that
 * reports a decision as durable must read the request back rather than trust the
 * boolean. A missing request is treated as not durable.
 */
function actionRequestStatusOnDisk(id: string, expected: string): boolean {
  try {
    const onDisk = JSON.parse(fs.readFileSync(MEMORY_FILE_PATH, 'utf-8'));
    const rows: any[] = Array.isArray(onDisk.permissionRequests) ? onDisk.permissionRequests : [];
    return rows.some((r) => r?.id === id && r?.status === expected);
  } catch {
    return false;
  }
}

/**
 * Write the Security Matrix gates to disk. The matrix lives outside `memoryState`,
 * so this first copies the live gates into `memoryState.securityMatrix` and then
 * runs the durable write. Returns whether the gates are on disk — the update route
 * may report a save only on `true`.
 */
function persistSecurityMatrixState(): boolean {
  memoryState.securityMatrix = persistedSecurityMatrix();
  return persistMemory();
}

/**
 * Write the emergency/kill-switch freeze to disk. Like the Security Matrix, the
 * emergency state lives outside `memoryState`, so this first copies the live
 * state into `memoryState.emergencyState` and then runs the durable write.
 * Returns whether the freeze is on disk — a route may report a held freeze only
 * on `true`.
 */
function persistEmergencyState(): boolean {
  memoryState.emergencyState = persistedEmergencyState();
  return persistMemory();
}

/**
 * Write the approval registry to disk. Like the Security Matrix and the
 * emergency freeze, the registry lives outside `memoryState`, so this first
 * copies the live requests into `memoryState.permissionRequests` and then runs
 * the durable write. Returns whether the queue is on disk — a route may report a
 * staged or resolved approval only on `true`.
 */
function persistApprovalRegistry(): boolean {
  memoryState.permissionRequests = persistedActionRequests();
  return persistMemory();
}

/**
 * Write the live telephony settings to disk. Like the Security Matrix, the
 * emergency freeze and the approval queue, the settings object lives outside
 * `memoryState`, so this first copies the live values into
 * `memoryState.telephonySettings` and then runs the durable write. Returns
 * whether the settings are on disk — the settings route may report a save only
 * on `true`, or the operator is told "SAVED" for values the next boot discards.
 */
function persistTelephonySettingsState(): boolean {
  memoryState.telephonySettings = { ...telephonySettingsState };
  return persistMemory();
}

/**
 * Write the live telephony call history to disk. Like the settings object, the
 * history lives outside `memoryState`, so this first copies the live array into
 * `memoryState.telephonyCallRecords` and then runs the durable write. Returns
 * whether the history is on disk — the call routes may report a stored or
 * removed record only on `true`, or a recorded call is gone on the next boot
 * while the caller was told it was saved.
 */
function persistTelephonyCalls(): boolean {
  memoryState.telephonyCallRecords = telephonyCalls;
  return persistMemory();
}

export function addAuditLog(
  action: string,
  levelRequired: 1 | 2 | 3 | 4 = 1,
  approvedBy: string = 'HUMAN_CONFIRMATION',
  status: string = 'VERIFIED'
): boolean {
  const entry: AuditLogEntry = {
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    action,
    levelRequired,
    approvedBy,
    status,
    // Derive the truth fields from the caller's own outcome. Previously both
    // were hardcoded to 'VERIFIED', so a row logged as FAILED/PENDING/BLOCKED
    // still rendered a green "confirmed" badge in the Security Matrix.
    verificationStatus: deriveAuditVerificationStatus(status),
    finalTruthState: deriveAuditFinalTruthState(status),
  };
  // Route through the durable writer: `persistMemory()` can return true without
  // writing when the file already holds identical bytes, so trusting its boolean
  // alone can record a VERIFIED row the next boot does not have. The helper
  // reads the row back from disk and drops the phantom row on failure, and its
  // boolean is returned so a caller that reports the audit as written can gate
  // on it.
  return recordDurableAuditRow(entry);
}

// Shortcuts for convenience
let socialPosts = memoryState.socialPosts;
let freelanceLeads = memoryState.freelanceLeads;

// ==============================================================================
// 3. AI ENGINE (GEMINI 2.5 FLASH + RESILIENT BILINGUAL HEURISTIC FALLBACK)
// ==============================================================================
let genAIClient: GoogleGenAI | null = null;
function getGenAI(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  if (!genAIClient) {
    genAIClient = new GoogleGenAI({ apiKey });
  }
  return genAIClient;
}

// Intent Classification Helper (matching ask_ai_for_intent & regex)
function classifyIntentLocally(text: string): { intent: string; confidence: number; actionPayload?: any; financeBlocked?: boolean; financeReason?: string } {
  const lower = text.toLowerCase().trim();

  // 0. STRICT FINANCE EXCLUSION CHECK
  const financeCheck = isFinanceBlocked(lower);
  if (financeCheck.blocked) {
    return {
      intent: 'finance_blocked',
      confidence: 1,
      financeBlocked: true,
      financeReason: financeCheck.reason,
    };
  }

  // Voice / Language Switch Command ("मुझसे हिंदी में बात करो", "हिंदी में बात करो", "talk in hindi", etc.)
  const langSwitch = detectLanguageSwitchCommand(text);
  if (langSwitch?.requested && langSwitch.newLang) {
    return {
      intent: 'language_switch',
      confidence: 0.98,
      actionPayload: { newLang: langSwitch.newLang, acknowledgment: langSwitch.acknowledgment },
    };
  }

  // Telephony & Voice Calling Commands ("call Dr. Wayne", "answer call", "hang up", "open dialer", etc.)
  // Console/history phrases also begin with "call " and must not be read as an
  // outbound dial to a literal target ("call hub" -> call "hub"). They are
  // classified below.
  if (
    ((lower.startsWith('call ') || lower.startsWith('dial ')) &&
      !isTelephonyControlRequest(lower)) ||
    ((lower.includes('phone call') ||
      lower.includes('make a call') ||
      lower.includes('place a call') ||
      lower.includes('कॉल करो') ||
      lower.includes('फोन करो') ||
      lower.includes('call lagao')) &&
      !isTelephonyControlRequest(lower))
  ) {
    const targetMatch = text.match(/(?:call|dial|फोन करो|कॉल करो|call lagao)\s+(.+)/i);
    // Only a target that carries real digits is a number. "make a call" /
    // "place a call" capture nothing, and a name is not dialable — neither may
    // become a fabricated "Contact" that the handler then reports as called.
    const target = extractDialTarget(targetMatch ? targetMatch[1] : '');
    return {
      intent: 'make_call',
      confidence: 0.96,
      actionPayload: { target, autoDial: true },
    };
  }

  if (isAnswerCallRequest(lower)) {
    return { intent: 'answer_call', confidence: 0.95 };
  }

  if (isHangupCallRequest(lower)) {
    return { intent: 'hangup_call', confidence: 0.95 };
  }

  if (isRejectCallRequest(lower)) {
    return { intent: 'reject_call', confidence: 0.95 };
  }

  if (isTelephonyHubRequest(lower)) {
    return { intent: 'telephony_hub', confidence: 0.95 };
  }

  if (isCallHistoryRequest(lower)) {
    return { intent: 'call_history', confidence: 0.95 };
  }

  // Time / Date / Clock Inquiry ("अभी कितने बजे हैं?", "समय क्या हुआ है", "what time is it", etc.)
  if (
    lower.includes('time') ||
    lower.includes('समय') ||
    lower.includes('बजे') ||
    lower.includes('कितने बजे') ||
    lower.includes('घड़ी') ||
    lower.includes('date') ||
    lower.includes('तारीख') ||
    lower.includes('waqt') ||
    lower.includes('what time') ||
    lower.includes('current time') ||
    lower.includes('clock')
  ) {
    return { intent: 'time_inquiry', confidence: 0.95 };
  }

  // Weather / Forecast Inquiry ("आज का मौसम बताओ", "मौसम कैसा है", "weather today", etc.)
  if (
    (lower.includes('मौसम') ||
    lower.includes('weather') ||
    lower.includes('तापमान') ||
    lower.includes('temperature') ||
    lower.includes('forecast')) &&
    !lower.includes('report देना') && !lower.includes('सुबह 9 बजे') && !lower.includes('daily report') && !lower.includes('briefing')
  ) {
    return { intent: 'weather_inquiry', confidence: 0.95 };
  }

  // JARVIS Capabilities & Help Inquiry ("JARVIS क्या कर सकता है?", "What can you do?", etc.)
  if (
    lower.includes('क्या कर सकता') ||
    lower.includes('क्या कर सकते') ||
    lower.includes('क्या कर सकती') ||
    lower.includes('kya kar sakte') ||
    lower.includes('kya kar sakta') ||
    lower.includes('what can you do') ||
    lower.includes('what are your capabilities') ||
    lower.includes('capabilities') ||
    lower.includes('features') ||
    lower.includes('तुम्हारी क्षमताएं') ||
    lower.includes('मदद क्या कर सकते') ||
    lower.includes('what can jarvis do')
  ) {
    return { intent: 'capabilities_inquiry', confidence: 0.95 };
  }

  // Calculator & Arithmetic Evaluation ("2 + 2 कितना होता है?", "what is 2 + 2", "calculate 15 * 4", etc.)
  const mathQueryMatch =
    text.match(/(?:calculate|what is|compute|solve|\bhow much is\b)\s+([0-9+\-*/().\s×÷]+)/i) ||
    text.match(/([0-9]+(?:\.[0-9]+)?(?:\s*[\+\-\*\/×÷]\s*[0-9]+(?:\.[0-9]+)?)+)(?:\s*(?:कितना होता है|कितना है|होता है|kitna hota hai|kitna hai|kya hoga|\?))?/i);

  if (mathQueryMatch && /[0-9]/.test(mathQueryMatch[1])) {
    const expr = mathQueryMatch[1].trim();
    return { intent: 'math_computation', confidence: 0.96, actionPayload: { expression: expr } };
  }

  // Emergency Stop / Pause / Resume
  if (lower.includes('emergency stop') || lower.includes('stop all actions') || lower.includes('pause jarvis') || lower.includes('emergency pause') || lower === 'stop' || lower === '/stop' || lower === '/emergency_stop') {
    return { intent: 'emergency_stop', confidence: 1 };
  }
  if (lower.includes('emergency resume') || lower.includes('resume actions') || lower.includes('unpause') || lower.includes('continue actions') || lower === '/resume') {
    return { intent: 'emergency_resume', confidence: 1 };
  }

  // YouTube Status Inquiry ("YouTube की स्थिति क्या है?", "YouTube status", "YouTube ka kya status", etc.)
  if (
    (lower.includes('youtube') || lower.includes('यूट्यूब')) &&
    (
      lower.includes('status') ||
      lower.includes('स्थिति') ||
      lower.includes('अपडेट') ||
      lower.includes('update') ||
      lower.includes('stats') ||
      lower.includes('हाल') ||
      lower.includes('check') ||
      lower.includes('का क्या status') ||
      lower.includes('ka kya status') ||
      lower.includes('कहाँ तक') ||
      lower.includes('channel') ||
      lower.includes('connected') ||
      lower.includes('चैनल') ||
      lower.includes('जुड़ा')
    )
  ) {
    return { intent: 'youtube_status_inquiry', confidence: 0.96 };
  }

  // YouTube Upload Request (Requires Level-4 Human Authorization)
  if (
    lower.includes('upload this video') ||
    lower.includes('upload video publicly') ||
    lower.includes('video upload karo') ||
    lower.includes('upload to youtube') ||
    lower.includes('यूट्यूब पर वीडियो अपलोड') ||
    lower.includes('publish video on youtube')
  ) {
    return { intent: 'youtube_upload_request', confidence: 0.96 };
  }

  // YouTube Video Summarizer Command
  const ytVideoId = extractYouTubeVideoId(text);
  if (
    ytVideoId ||
    lower.includes('youtube.com') ||
    lower.includes('youtu.be') ||
    lower.includes('summarize video') ||
    lower.includes('summarize youtube') ||
    lower.includes('youtube summary') ||
    lower.includes('video summary') ||
    lower.includes('video summarize') ||
    lower.includes('yt summary') ||
    lower.startsWith('/yt') ||
    lower.startsWith('/summarize')
  ) {
    const rawUrlMatch = text.match(/https?:\/\/[^\s]+/i)?.[0];
    const finalUrl = rawUrlMatch || (ytVideoId ? `https://www.youtube.com/watch?v=${ytVideoId}` : '');
    return {
      intent: 'summarize_youtube_video',
      confidence: 0.98,
      actionPayload: {
        url: finalUrl,
        videoId: ytVideoId || (rawUrlMatch ? extractYouTubeVideoId(rawUrlMatch) : null),
        rawPrompt: text,
      },
    };
  }

  // Real Git Tools
  if (lower.includes('git status') || lower.includes('git diff') || lower.includes('git log') || lower.includes('git check') || lower.includes('repo status')) {
    return { intent: 'git_status_tool', confidence: 0.95 };
  }

  // Real GitHub Tools
  if (lower.includes('github') || lower.includes('my repos') || lower.includes('github issues') || lower.includes('git repos')) {
    return { intent: 'github_repos_tool', confidence: 0.95 };
  }

  // Real Filesystem Tools
  if (lower.includes('list files') || lower.includes('show files') || lower.includes('directory list') || lower.includes('project files') || lower.includes('files dikhao')) {
    return { intent: 'list_files_tool', confidence: 0.95 };
  }

  // Web Research Tool
  if (lower.startsWith('research ') || lower.startsWith('fetch url ') || lower.includes('web research') || lower.includes('search web')) {
    const target = lower.replace(/^(?:research|fetch url|web research|search web)\s+/i, '').trim();
    return { intent: 'web_research_tool', confidence: 0.95, actionPayload: { target } };
  }

  // Integrations Status / Tool Audit
  if (lower.includes('integrations audit') || lower.includes('tools status') || lower.includes('api status') || lower.includes('check apis') || lower.includes('connected tools')) {
    return { intent: 'tools_audit', confidence: 0.95 };
  }

  // Approvals & Permission Gate
  if (lower.includes('pending approvals') || lower.includes('permission gate') || lower.includes('action approvals') || lower.includes('approvals dikhao')) {
    return { intent: 'pending_approvals', confidence: 0.95 };
  }

  // Computer Operator & Screen Researcher
  if (
    lower.includes('cancel task') ||
    lower.includes('stop task') ||
    lower.includes('काम बंद करो') ||
    lower.includes('ऑपरेटर रोको') ||
    lower.includes('cancel operator')
  ) {
    return { intent: 'cancel_computer_task', confidence: 0.98 };
  }

  if (
    (lower.includes('vs code') || lower.includes('vscode') || lower.includes('project')) &&
    (lower.includes('error') || lower.includes('fix') || lower.includes('समस्या') || lower.includes('ठीक करो') || lower.includes('ठीक कर'))
  ) {
    return { intent: 'fix_project_error', confidence: 0.98, actionPayload: { target: 'VS Code' } };
  }

  if (
    lower.includes('स्क्रीन देखकर') ||
    lower.includes('स्क्रीन देखो') ||
    lower.includes('क्या समस्या है') ||
    lower.includes('inspect screen') ||
    lower.includes('screen research') ||
    (lower.includes('screen') && lower.includes('error'))
  ) {
    return { intent: 'inspect_screen', confidence: 0.98 };
  }

  if (
    lower.includes('computer operator') ||
    lower.includes('कंप्यूटर ऑपरेटर') ||
    lower.includes('स्क्रीन ऑपरेटर')
  ) {
    return { intent: 'open_computer_operator', confidence: 0.98 };
  }

  if (
    lower.includes('vs code') ||
    lower.includes('vscode') ||
    (lower.includes('visual studio') && lower.includes('code'))
  ) {
    return { intent: 'operate_vscode', confidence: 0.95, actionPayload: { app: 'VS Code' } };
  }

  if (
    lower.includes('browser खोलो') ||
    lower.includes('ब्राउज़र खोलो') ||
    lower.includes('open browser') ||
    lower.includes('chrome खोलो')
  ) {
    return { intent: 'operate_browser', confidence: 0.95, actionPayload: { app: 'Chrome' } };
  }

  if (
    lower.includes('terminal खोलो') ||
    lower.includes('टर्मिनल खोलो') ||
    lower.includes('open terminal') ||
    lower.includes('open powershell') ||
    lower.includes('powershell खोलो')
  ) {
    return { intent: 'operate_terminal', confidence: 0.95, actionPayload: { app: 'Terminal' } };
  }

  // Exit
  if (lower === 'exit' || lower.includes('बंद करो') || lower.includes('बाय') || lower === 'quit') {
    return { intent: 'pc_shutdown', confidence: 1 };
  }

  // Master Plan & Remote Mobile Commands
  if (lower.includes('project check') || lower.includes('प्रोजेक्ट चेक') || lower.includes('check project') || lower.includes('git audit') || lower.includes('code status')) {
    return { intent: 'check_project', confidence: 0.95 };
  }

  if (lower.includes('post बनाओ') || lower.includes('create post') || lower.includes('social post') || lower.includes('linkedin post') || lower.includes('आज की post') || lower.includes('draft post')) {
    return { intent: 'create_social_post', confidence: 0.95 };
  }

  if (lower.includes('document ढूँढो') || lower.includes('find document') || lower.includes('search files') || lower.includes('मेरी files')) {
    const docQuery = lower.replace(/(?:मेरी files में|find document|search file|document ढूँढो)/gi, '').trim();
    return { intent: 'find_document', confidence: 0.95, actionPayload: { query: docQuery || 'Project Specification.pdf' } };
  }

  if (lower.includes('report देना') || lower.includes('morning report') || lower.includes('सुबह 9 बजे') || lower.includes('daily report') || lower.includes('कल सुबह') || lower.includes('briefing')) {
    return { intent: 'schedule_morning_report', confidence: 0.95 };
  }

  if (lower.includes('quotation') || lower.includes('कोटेशन') || lower.includes('client lead') || lower.includes('proposal') || lower.includes('lead create')) {
    return { intent: 'generate_quotation', confidence: 0.95 };
  }

  if (lower.includes('oracle') || lower.includes('cloud server') || lower.includes('vm status') || lower.includes('server health') || lower.includes('telemetry')) {
    return { intent: 'cloud_telemetry', confidence: 0.95 };
  }

  if (lower.includes('security') || lower.includes('सुरक्षा') || lower.includes('permission level') || lower.includes('audit log') || lower.includes('security audit')) {
    return { intent: 'security_audit', confidence: 0.95 };
  }

  // Name setting: "my name is X" or "mera naam X hai"
  const nameMatch = lower.match(/(?:my name is|mera naam|i am|call me)\s+([a-zA-Z0-9\s\u0900-\u097F]+)/i);
  if (nameMatch && nameMatch[1]) {
    const name = nameMatch[1].replace(/hai/i, '').trim();
    return { intent: 'set_name', confidence: 0.98, actionPayload: { name } };
  }

  if (lower.includes('what is my name') || lower.includes('mera naam kya hai') || lower.includes('who am i') || lower.includes('मैं कौन')) {
    return { intent: 'get_name', confidence: 0.98 };
  }

  // Apps
  if (lower.includes('open notepad') || lower.includes('नोटपैड खोलो') || lower.includes('text editor') || lower.includes('open notes')) {
    return { intent: 'open_notepad', confidence: 0.95 };
  }

  if (lower.includes('open calculator') || lower.includes('कैलकुलेटर खोलो') || lower.includes('calc') || lower.includes('open math')) {
    return { intent: 'open_calculator', confidence: 0.95 };
  }

  if (lower.includes('open paint') || lower.includes('पेंट खोलो') || lower.includes('drawing') || lower.includes('canvas')) {
    return { intent: 'open_paint', confidence: 0.95 };
  }

  if (lower.includes('open chrome') || lower.includes('क्रोम खोलो') || lower.includes('browser') || lower.includes('internet')) {
    return { intent: 'open_chrome', confidence: 0.95 };
  }

  if (lower.includes('take screenshot') || lower.includes('स्क्रीनशॉट लो') || lower.includes('capture screen') || lower.includes('screen photo')) {
    return { intent: 'take_screenshot', confidence: 0.95 };
  }

  if (lower.startsWith('create file') || lower.startsWith('save note') || lower.includes('नोट्स सेव करो') || lower.includes('write note')) {
    return { intent: 'create_file', confidence: 0.9 };
  }

  // Media / Volume
  if (lower.includes('volume up') || lower.includes('आवाज बढ़ाओ') || lower.includes('increase volume') || lower.includes('louder')) {
    return { intent: 'volume_up', confidence: 0.95 };
  }

  if (lower.includes('volume down') || lower.includes('आवाज कम करो') || lower.includes('decrease volume') || lower.includes('quieter')) {
    return { intent: 'volume_down', confidence: 0.95 };
  }

  // PC Controls
  if (lower.includes('shutdown') || lower.includes('कंप्यूटर बंद करो') || lower.includes('turn off pc')) {
    return { intent: 'pc_shutdown', confidence: 0.95 };
  }

  if (lower.includes('restart') || lower.includes('रीस्टार्ट करो') || lower.includes('reboot')) {
    return { intent: 'pc_restart', confidence: 0.95 };
  }

  // Web Navigation
  if (lower.includes('open google') || lower.includes('गूगल खोलो')) {
    return { intent: 'open_google', confidence: 0.95 };
  }

  if (lower.includes('open youtube') || lower.includes('यूट्यूब खोलो')) {
    return { intent: 'open_youtube', confidence: 0.95 };
  }

  if (lower.includes('open gmail') || lower.includes('जीमेल खोलो') || lower.includes('email')) {
    return { intent: 'open_gmail', confidence: 0.95 };
  }

  if (lower.includes('open chatgpt') || lower.includes('chat gpt')) {
    return { intent: 'open_chatgpt', confidence: 0.95 };
  }

  if (lower.startsWith('search ') || lower.includes('google search') || lower.includes('खोजो')) {
    const query = lower.replace(/^search\s+/i, '').replace(/google search/i, '').replace(/खोजो/i, '').trim();
    return { intent: 'google_search', confidence: 0.95, actionPayload: { query } };
  }

  if (lower.includes('diagnostic') || lower.includes('system status') || lower.includes('jarvis status') || lower.includes('daemon status')) {
    return { intent: 'system_diagnostic', confidence: 0.9 };
  }

  return { intent: 'chat', confidence: 0.7 };
}

// ==============================================================================
// 4. MASTER BLUEPRINT STATE & ORACLE TELEMETRY
// ==============================================================================
const BLUEPRINT_PHASES = [
  {
    id: 0,
    code: 'PHASE_0',
    titleEn: 'Safety + Architecture (Free-Only Strategy)',
    titleHi: 'Phase 0 — सुरक्षा और आर्किटेक्चर (₹0 रणनीति)',
    status: 'completed',
    icon: 'ShieldCheck',
    cost: '₹0 / Always Free',
    description: 'Establish zero-cost boundaries, multi-level security permissions (Levels 1 to 4), credentials vault masking, and backup recovery protocols.',
    deliverables: [
      { text: '100% Free-only strategy (Zero unnecessary paid APIs)', done: true },
      { text: 'Security levels definition (Level 1: Read-Only to Level 4: External)', done: true },
      { text: 'Human Approval Mode for all external / posting actions', done: true },
      { text: 'Cloud credentials & tokens protection from LLM memory', done: true },
      { text: 'Automated backup & recovery procedure', done: true },
    ],
    commandSample: 'JARVIS, security audit run करो',
  },
  {
    id: 1,
    code: 'PHASE_1',
    titleEn: 'Free Cloud Server (Oracle Always Free ARM VM)',
    titleHi: 'Phase 1 — फ्री क्लाउड सर्वर (Oracle Always Free)',
    status: 'completed',
    icon: 'Cloud',
    cost: '₹0 Always Free (declared plan, entitlement NOT_PROBED)',
    description: 'Provision an Ampere A1 ARM compute VM (4 OCPUs, 24 GB RAM, 200 GB Storage) on Oracle Cloud Always Free tier with strict zero-cost checklist verification.',
    deliverables: [
      { text: 'Oracle Cloud Always Free account setup verified', done: true },
      { text: 'ARM Ampere A1 VM Shape selected (4 OCPU / 24 GB RAM)', done: true },
      { text: 'SSH Keypair generation & secure remote access configured', done: true },
      { text: 'Firewall / Ingress Security Rules setup (Ports 22, 80, 443, 3000)', done: true },
      { text: 'Zero-cost confirmation checklist passed (No accidental billing)', done: true },
    ],
    commandSample: 'JARVIS, cloud server status बताओ',
  },
  {
    id: 2,
    code: 'PHASE_2',
    titleEn: 'Hermes Autonomous Agent Installation',
    titleHi: 'Phase 2 — हर्मीस एजेंट इंस्टॉलेशन',
    status: 'completed',
    icon: 'Bot',
    cost: '₹0 (Open-Source Runtime)',
    description: 'Deploy the Hermes autonomous agent daemon on Linux ARM VM with Python/Node runtime, system hooks, and the "Hello JARVIS" test loop.',
    deliverables: [
      { text: 'Linux environment & base runtime dependencies installed', done: true },
      { text: 'Hermes Agent core framework deployed', done: true },
      { text: 'Local configuration & file paths mapped', done: true },
      { text: 'Security sandbox & execution boundary verified', done: true },
      { text: 'First autonomous ping test: "Hello JARVIS" -> Verified ✅', done: true },
    ],
    commandSample: 'Hello JARVIS',
  },
  {
    id: 3,
    code: 'PHASE_3',
    titleEn: 'AI Brain Engine (Free & Hardware-Optimized)',
    titleHi: 'Phase 3 — एआई ब्रेन (हार्डवेयर-ऑप्टिमाइज्ड)',
    status: 'completed',
    icon: 'Cpu',
    cost: '₹0 (Gemini 2.5/3.7 Flash + Local Model Fallback)',
    description: 'Integrate the hybrid AI reasoning engine combining Google Gemini 2.5/3.7 Flash server-side with local fallback parsing, tool-selector reasoning, and step planning.',
    deliverables: [
      { text: 'Hardware-appropriate model routing (Optimized for 12-24 GB RAM)', done: true },
      { text: 'Autonomous tool-calling & reasoning pipeline (Hermes -> AI -> Tool -> Action)', done: true },
      { text: 'Bilingual comprehension (Hindi + English natural phrasing)', done: true },
      { text: 'Latency-optimized prompt engineering for voice & mobile', done: true },
    ],
    commandSample: 'JARVIS, analyze this complex workflow and execute step 1',
  },
  {
    id: 4,
    code: 'PHASE_4',
    titleEn: 'Mobile Control (Telegram Bot + Web Panel)',
    titleHi: 'Phase 4 — मोबाइल कंट्रोल (टेलीग्राम बॉट + वेब पैनल)',
    status: 'completed',
    icon: 'Smartphone',
    cost: '₹0 (Telegram Bot API)',
    description: 'Control JARVIS 100% remotely from your Android phone without needing a laptop open. Execute tasks, receive voice notes, and approve social posts on the go.',
    deliverables: [
      { text: 'Telegram Bot API connector (@HermesJarvisBot) created', done: true },
      { text: 'Android Webhook & instant command dispatcher', done: true },
      { text: 'Voice message audio notes recognition & reply', done: true },
      { text: 'Interactive approval buttons (YES / NO / REVISE) in Telegram', done: true },
    ],
    commandSample: '📱 Telegram: "JARVIS, project check करो"',
  },
  {
    id: 5,
    code: 'PHASE_5',
    titleEn: 'Multi-Tier Memory & Context Vault',
    titleHi: 'Phase 5 — मल्टी-टियर मेमोरी और संदर्भ स्टोर',
    status: 'completed',
    icon: 'Database',
    cost: '₹0 (Local File & Vector Store)',
    description: 'Long-term context persistence for User Preferences, Projects, Notes, Tasks, and History while strictly isolating passwords and secrets from general memory.',
    deliverables: [
      { text: 'Persistent User Profile & key preferences storage', done: true },
      { text: 'Active projects and instruction memories cache', done: true },
      { text: 'Work history & command log analytics', done: true },
      { text: 'Zero-credential storage rule: API keys never written to chat memory', done: true },
    ],
    commandSample: 'JARVIS, remember that my client deadline is Friday',
  },
  {
    id: 6,
    code: 'PHASE_6',
    titleEn: 'Autonomous Tools Suite (Dev, Files, Web, Scheduler)',
    titleHi: 'Phase 6 — ऑटोनॉमस टूल्स (फाइल्स, वेब, गिट, शेड्यूलर)',
    status: 'completed',
    icon: 'Wrench',
    cost: '₹0',
    description: 'Empower JARVIS with real execution tools: file search & organization, Git/GitHub bug audit, live web research, and cron task scheduler.',
    deliverables: [
      { text: 'File search, document reader, and report builder', done: true },
      { text: 'Development inspection, Git workflow & bug audit helper', done: true },
      { text: 'Web research & information extraction agent', done: true },
      { text: 'Automated recurring task scheduler (Daily / Weekly crons)', done: true },
    ],
    commandSample: 'JARVIS, मेरी files में यह document ढूँढो',
  },
  {
    id: 7,
    code: 'PHASE_7',
    titleEn: 'Freelancing JARVIS Business Pipeline',
    titleHi: 'Phase 7 — फ्रीलांसिंग बिजनेस पाइपलाइन',
    status: 'completed',
    icon: 'Briefcase',
    cost: '₹0 (Integrated CRM)',
    description: 'Automate end-to-end client workflows: Website Visitor -> AI Assistant -> Requirement Extraction -> Lead Ingestion -> Quotation Generator -> Delivery -> Follow-up.',
    deliverables: [
      { text: 'Client inquiry ingest & automated requirement breakdown', done: true },
      { text: 'Instant Quotation & Proposal Generator (in ₹ INR & $ USD)', done: true },
      { text: 'Project milestone tracker and deliverable estimator', done: true },
      { text: 'Automated client follow-up reminder schedule', done: true },
    ],
    commandSample: 'JARVIS, client inquiry के लिए quotation तैयार करो',
  },
  {
    id: 8,
    code: 'PHASE_8',
    titleEn: 'Social Media Automation & Human Approval',
    titleHi: 'Phase 8 — सोशल मीडिया ऑटोमेशन (ह्यूमन अप्रूवल मोड)',
    status: 'completed',
    icon: 'Share2',
    cost: '₹0',
    description: 'Autonomous content pipeline: Topic Research -> Caption & Hashtags -> Creative Image Prompt -> Human Approval in Mobile ("Post तैयार है। Publish करूँ? -> YES") -> Truthful Verification.',
    deliverables: [
      { text: 'Multi-platform post generator (LinkedIn, X/Twitter, Instagram, Telegram)', done: true },
      { text: 'Trending hashtag and SEO hook generator', done: true },
      { text: 'Strict Human-in-the-loop approval gate before any broadcast', done: true },
      { text: 'Zero false-positive verification engine (Real API verification)', done: true },
    ],
    commandSample: 'JARVIS, आज की LinkedIn post बनाओ',
  },
  {
    id: 9,
    code: 'PHASE_9',
    titleEn: 'Proactive JARVIS Automation (Daily Briefings)',
    titleHi: 'Phase 9 — प्रोएक्टिव जार्विस ऑटोमेशन (दैनिक ब्रीफिंग)',
    status: 'completed',
    icon: 'Sparkles',
    cost: '₹0',
    description: 'Self-initiating daily routines: Morning Task Briefing, Midday Website/System Health Check, Evening Social Media Summary, and Nightly Work Report.',
    deliverables: [
      { text: 'Morning 9 AM Briefing ("Good morning. आज के important tasks ये हैं…")', done: true },
      { text: 'Midday System & Website Health Monitor ("आपकी website में यह स्थिति है…")', done: true },
      { text: 'Evening Social Media Report ("आज 2 posts तैयार / प्रकाशित हुईं…")', done: true },
      { text: 'Night Work Summary ("आज का complete work report तैयार है…")', done: true },
    ],
    commandSample: 'JARVIS, कल सुबह 9 बजे मुझे report देना',
  },
] as BlueprintPhase[];

// The live phase list is the design constant overlaid with any operator tick
// state persisted on disk (memoryState is already loaded at this point).
// Without this, a tick made through the modal was in-memory only and a restart
// restored the archived checklist.
let blueprintPhases: BlueprintPhase[] = overlayPersistedPhases(
  BLUEPRINT_PHASES,
  memoryState.blueprintPhases
);

/** Persist the operator's blueprint tick state. Returns whether it reached disk. */
function persistBlueprintPhases(): boolean {
  memoryState.blueprintPhases = blueprintPhases;
  return persistMemory();
}

let oracleCloudState = {
  provider: 'Oracle Cloud Always Free' as const,
  // Shape/OCPU/RAM/boot-volume/OS below are the *plan* the owner intends to run
  // on, not readings from an instance. Nothing in this process queries the OCI
  // control plane, so none of them is an observation; the UI header labels them
  // as declared configuration and the panel labels the Always Free figures as
  // programme limits. They are kept only as the declared plan.
  tier: 'Always Free (₹0 / month)' as const,
  instanceType: 'Ampere A1 Compute (ARM64)' as const,
  shape: 'VM.Standard.A1.Flex' as const,
  ocpu: 4,
  ramGb: 24,
  bootVolumeGb: 200,
  os: 'Ubuntu 24.04 LTS (Minimal ARM)' as const,
  // `publicIp` and `status` are OCI control-plane facts. The previous seed
  // asserted a literal address and a constant `RUNNING`, and because a supplied
  // value passes through the UI normalisers it rendered — and was copied to the
  // clipboard as an `ssh` target — as an observed address. The literal is
  // deliberately not repeated here so it cannot re-enter this file; see
  // src/utils/hardening/ociInstanceTruth.ts and the guard in
  // src/tests/toolSurfaceTruthfulness.test.ts.
  // Both are null until something actually observes them (see the observation
  // block below this state).
  publicIp: null as string | null,
  sshPort: 22,
  status: null as 'RUNNING' | 'PROVISIONING' | 'STOPPED' | null,
  // When `status` was observed, or null when it was never observed.
  statusObservedAt: null as string | null,
  // Billing entitlement is an OCI billing-API fact and nothing in this process
  // queries that API, so it stays null (never "FREE") until something actually
  // observes it. The Telegram cloud reply and the blueprint report derive their
  // cost line from this rather than asserting a fixed ₹0 guarantee.
  // See src/utils/hardening/billingEntitlementTruth.ts.
  billingEntitlement: null as 'FREE' | 'BILLED' | null,
  billingObservedAt: null as string | null,
  // Hours this *process* has been up, measured. The previous version added a
  // hardcoded +342 offset, so JARVIS always claimed 342+ hours of uptime that
  // nobody had measured.
  uptimeHours: Math.floor((Date.now() - new Date(DAEMON_BOOT_TIME).getTime()) / 3600000),
  // Live host measurements. The previous version jittered around hardcoded
  // constants (14.8% CPU, 3.4 GB RAM) with Math.random(), so the UI and the
  // spoken responses reported invented numbers as if they were real telemetry.
  metrics: {
    cpuUsage: null as number | null,
    ramUsedGb: null as number | null,
    ramTotalGb: null as number | null,
    ramUsage: null as number | null,
    diskUsage: null as number | null,
    bandwidthUsedMb: null as number | null,
    tempCelsius: null as number | null,
  },
  metricsSource: 'unavailable' as 'live_host' | 'unavailable',
  metricsSampledAt: null as string | null,
  // This list is the *declared* VCN ingress configuration. It is not a
  // measurement: nothing in this process contacts the Oracle VCN, opens an
  // inbound socket, or can observe whether a port is reachable from the
  // internet, so `active` is null for every rule (never probed). The previous
  // version set `active: true` on all five, which the modal rendered as five
  // green checkmarks under a "Zero Accidental Ingress" heading — an
  // unconditional security claim about ports that were never tested.
  firewallRules: [
    { port: 22, proto: 'tcp' as const, label: 'SSH Remote Terminal (Restricted IP)', active: null },
    { port: 80, proto: 'tcp' as const, label: 'HTTP Web Panel (Nginx Proxy)', active: null },
    { port: 443, proto: 'tcp' as const, label: 'HTTPS SSL Encrypted Panel', active: null },
    { port: 3000, proto: 'tcp' as const, label: 'JARVIS Applet Core Engine', active: null },
    { port: 8443, proto: 'tcp' as const, label: 'Telegram Webhook Ingress Gateway', active: null },
  ],
};

// Re-sample the live host metrics into the shared Oracle state. Called at boot
// and on every /api/oracle-cloud request so Telegram and voice replies quote the
// same real values as the modal, never a stale or invented number.
function refreshOracleMetrics(): void {
  const sample: HostTelemetry = sampleHostTelemetry();
  oracleCloudState.metrics = {
    cpuUsage: sample.cpuUsage,
    ramUsedGb: sample.ramUsedGb,
    ramTotalGb: sample.ramTotalGb,
    ramUsage: sample.ramUsage,
    diskUsage: sample.diskUsage,
    // Bandwidth and temperature are not measurable from Node on this host.
    bandwidthUsedMb: null,
    tempCelsius: null,
  };
  oracleCloudState.metricsSource = 'live_host';
  oracleCloudState.metricsSampledAt = sample.sampledAt;
}

refreshOracleMetrics();

// Oracle VM instance observation.
//
// `status` and `publicIp` are OCI control-plane facts and this process never
// calls that control plane, so neither can be *measured* here. One weaker fact
// is provable: if the daemon host is the Oracle ARM instance (a real hostname
// match), the instance must be running — this process is executing on it. That
// is recorded as an observation of the hosting instance, and the public address
// stays unobserved because a host interface address is not the instance's
// cloud-assigned IP.
function observeOciInstance(): void {
  const { isOracleLike } = getLocalHostIdentity();
  const observation = observeInstanceFromHost(
    isOracleLike,
    oracleCloudState.metricsSampledAt,
  );
  oracleCloudState.status = observation.status;
  oracleCloudState.publicIp = observation.publicIp;
  oracleCloudState.statusObservedAt = observation.observedAt;
}

/** Identity of the machine this process actually runs on. Used to avoid
 *  asserting which cloud provider hosts us when nothing verified that. */
function getLocalHostIdentity(): { hostname: string; isOracleLike: boolean } {
  const hostname = (() => {
    try {
      return os.hostname();
    } catch {
      return 'unknown';
    }
  })();
  return { hostname, isOracleLike: /oracle|oci|ampere/i.test(hostname) };
}

observeOciInstance();

// Security Matrix State
let securityMatrixState = {
  currentLevel: 2 as 1 | 2 | 3 | 4,
  humanApprovalForExternal: true,
  maskSensitiveData: true,
  credentialLeakProtection: true,
  levels: [
    {
      level: 1 as 1 | 2 | 3 | 4,
      title: 'Level 1: Read-Only (Passive Safe Mode)',
      titleHi: 'स्तर 1: केवल पठन (सुरक्षित मोड)',
      description: 'Can only inspect system files, read docs, check repo status, and provide summaries. Cannot write or modify files.',
      allowedActions: ['File Read', 'Git Status', 'System Diagnostic', 'Chat Reasoning'],
      risk: 'MINIMAL' as const,
    },
    {
      level: 2 as 1 | 2 | 3 | 4,
      title: 'Level 2: Create (Local Generation)',
      titleHi: 'स्तर 2: निर्माण (स्थानीय जनरेशन)',
      description: 'Can draft notes, create new code snippets, generate social media post drafts, and write local files.',
      allowedActions: ['Create File', 'Draft Post', 'Generate Quotation', 'Save Memory Note'],
      risk: 'LOW' as const,
    },
    {
      level: 3 as 1 | 2 | 3 | 4,
      title: 'Level 3: Modify (Controlled Update)',
      titleHi: 'स्तर 3: संशोधन (नियंत्रित अपडेट)',
      description: 'Can edit existing workspace code, reconfigure internal parameters, and update project tracking boards.',
      allowedActions: ['Edit Code', 'Update Memory', 'Restart Subsystem', 'Change Task Status'],
      risk: 'MEDIUM' as const,
    },
    {
      level: 4 as 1 | 2 | 3 | 4,
      title: 'Level 4: External Actions (Requires Human Approval)',
      titleHi: 'स्तर 4: बाहरी क्रियाएं (ह्यूमन अप्रूवल आवश्यक)',
      description: 'Can execute live actions like posting to social media, emailing clients, deleting remote branches, or executing cloud scripts. ALWAYS pauses for your confirmation.',
      allowedActions: ['Social Media Publish', 'Send Client Quotation', 'Remote Git Push', 'Cloud VM Script'],
      risk: 'HIGH' as const,
    },
  ],
  get auditLogs() {
    return memoryState.auditLogs;
  },
};

// Restore the persisted Security Matrix gates. Each field is validated before it
// is adopted, so a hand-edited or legacy file cannot install an out-of-range
// level or a non-boolean gate; anything invalid keeps the default. The matrix
// then re-writes itself back into `memoryState` in lockstep, so a later persist
// records exactly what the running matrix holds.
{
  const stored = memoryState.securityMatrix as Partial<SecurityMatrixPersistedState> | undefined;
  if (stored && typeof stored === 'object') {
    const level = stored.currentLevel;
    if (level === 1 || level === 2 || level === 3 || level === 4) {
      securityMatrixState.currentLevel = level;
    }
    const gates = ['humanApprovalForExternal', 'maskSensitiveData', 'credentialLeakProtection'] as const;
    for (const gate of gates) {
      if (typeof stored[gate] === 'boolean') securityMatrixState[gate] = stored[gate] as boolean;
    }
  }
  memoryState.securityMatrix = persistedSecurityMatrix();
}

// Restore the persisted emergency stop / kill-switch freeze. A safety stop an
// operator engaged must survive a restart; without this the freeze silently
// reverted to the compile-time `false` on the next boot. A hand-edited or legacy
// file can only restore a genuine boolean freeze, never invent one.
{
  const stored = memoryState.emergencyState as Partial<EmergencyPersistedState> | undefined;
  hydrateEmergencyState({
    emergencyPaused: stored?.emergencyPaused === true,
    hardKillSwitchTriggered: stored?.hardKillSwitchTriggered === true,
    ...(typeof stored?.pausedAt === 'string' ? { pausedAt: stored.pausedAt } : {}),
    ...(typeof stored?.pausedBy === 'string' ? { pausedBy: stored.pausedBy } : {}),
    ...(typeof stored?.reason === 'string' ? { reason: stored.reason } : {}),
  });
  memoryState.emergencyState = persistedEmergencyState();
}

// Restore the persisted approval registry. Without this the Level-3/4 queue
// silently emptied on every restart, so a pending approval card the operator
// acted on after a reboot resolved nothing. A legacy file with no registry
// hydrates empty rather than inventing requests, and the registry then re-writes
// itself into `memoryState` so a later persist records exactly what it holds.
hydrateActionRequests(memoryState.permissionRequests);
memoryState.permissionRequests = persistedActionRequests();

// Proactive Daily Reports.
//
// These are *plans*, not results: the times are real (the scheduler in
// checkAndRunSchedulerJobs fires the 09:00 IST briefing), but no website probe,
// HTTP status code or cloud uptime number is measured for this preview. Earlier
// revisions hardcoded "All 3 monitored web properties returned HTTP 200 OK within
// 180ms", "Oracle VM Uptime: 342+ hrs", invented quotation/draft counts and a
// "Memory consumption 14%" figure that nothing ever sampled. The builder below
// substitutes the values that *are* known (real counts, real security level, real
// live-host telemetry when it was sampled) and says "not measured" for the rest.
const NOT_MEASURED = 'not measured';

function buildProactiveReports(): any[] {
  const live = oracleCloudState.metricsSource === 'live_host' ? oracleCloudState.metrics : null;
  const cpuText = live?.cpuUsage != null ? `${live.cpuUsage}%` : NOT_MEASURED;
  const ramText = live?.ramUsedGb != null ? `${live.ramUsedGb} GB` : NOT_MEASURED;
  const pendingQuotations = memoryState.freelanceLeads.filter((l) => !!l.quotation).length;
  const pendingPosts = memoryState.socialPosts.filter((p) => p.status === 'pending_approval').length;
  const publishedPosts = memoryState.socialPosts.filter((p) => p.status === 'published').length;
  const level = securityMatrixState.currentLevel;
  // The approval gate is operator-flippable, so the briefing may only state what
  // the matrix actually holds. The previous literals asserted the gate was on
  // even when /api/security/update had turned it off.
  const posture = securityMatrixPosture(securityMatrixState);

  return [
    {
      id: 'rep-morning',
      timeSlot: 'morning' as const,
      titleEn: '🌅 Morning Briefing (09:00 AM)',
      titleHi: '🌅 सुबह की ब्रीफिंग (09:00 AM)',
      timestamp: new Date().toISOString(),
      contentEn: `Good morning, Sir. Scheduled morning briefing. Pipeline: ${pendingQuotations} lead(s) with a prepared quotation, ${pendingPosts} social draft(s) awaiting approval. Security level: ${level}. Host CPU ${cpuText}, RAM ${ramText}. Cloud node health is not probed by this server.`,
      contentHi: `शुभ प्रभात, सर। निर्धारित सुबह की ब्रीफिंग। पाइपलाइन: ${pendingQuotations} कोटेशन तैयार, ${pendingPosts} सोशल ड्राफ्ट स्वीकृति की प्रतीक्षा में। सुरक्षा स्तर: ${level}।`,
      keyInsights: [
        `Prepared Quotations: ${pendingQuotations}`,
        `Social Drafts Awaiting Approval: ${pendingPosts}`,
        `Host CPU: ${cpuText} • RAM: ${ramText}`,
        `System Security Level: Level ${level}`,
        `External-action approval: ${posture.humanApproval}`,
        'Cloud node uptime: not probed by this server',
        describeServerHealthClaim(assessedServerStatus()),
      ],
      systemHealth: {
        serverStatus: assessedServerStatus(),
        activeWebsitesMonitored: 0,
        pendingTasksCount: pendingQuotations + pendingPosts,
        socialPostsPublished: publishedPosts,
      },
    },
    {
      id: 'rep-midday',
      timeSlot: 'midday' as const,
      titleEn: '☀️ Midday Health & Site Audit (02:00 PM)',
      titleHi: '☀️ दोपहर की वेबसाइट और सिस्टम जांच (02:00 PM)',
      timestamp: new Date().toISOString(),
      contentEn: `Sir, midday plan. No client website is configured for monitoring on this server, so no HTTP status or response-time probe was performed. Host CPU ${cpuText}, RAM ${ramText}.`,
      contentHi: `सर, दोपहर की योजना। इस सर्वर पर कोई क्लाइंट वेबसाइट मॉनिटरिंग के लिए कॉन्फ़िगर नहीं है, इसलिए कोई HTTP जांच नहीं की गई।`,
      keyInsights: [
        'Website uptime: not measured (no site configured)',
        `Host CPU: ${cpuText} • RAM: ${ramText}`,
        'Security anomaly scan: not performed',
        describeServerHealthClaim(assessedServerStatus()),
      ],
      systemHealth: {
        serverStatus: assessedServerStatus(),
        activeWebsitesMonitored: 0,
        pendingTasksCount: 0,
        socialPostsPublished: publishedPosts,
      },
    },
    {
      id: 'rep-evening',
      timeSlot: 'evening' as const,
      titleEn: '🌇 Evening Social & Growth Pulse (06:30 PM)',
      titleHi: '🌇 शाम की सोशल मीडिया और ग्रोथ रिपोर्ट (06:30 PM)',
      timestamp: new Date().toISOString(),
      contentEn: `Sir, evening plan. ${publishedPosts} post(s) published, ${pendingPosts} draft(s) still behind the Level-4 approval gate. Reach and impression metrics are not collected by this server.`,
      contentHi: `सर, शाम की योजना। ${publishedPosts} पोस्ट प्रकाशित, ${pendingPosts} ड्राफ्ट लेवल-4 स्वीकृति गेट पर।`,
      keyInsights: [
        `External-action approval: ${posture.humanApproval}`,
        `Published posts: ${publishedPosts} • Awaiting approval: ${pendingPosts}`,
        'Reach/impression metrics: not collected',
        describeServerHealthClaim(assessedServerStatus()),
      ],
      systemHealth: {
        serverStatus: assessedServerStatus(),
        activeWebsitesMonitored: 0,
        pendingTasksCount: pendingPosts,
        socialPostsPublished: publishedPosts,
      },
    },
    {
      id: 'rep-night',
      timeSlot: 'night' as const,
      titleEn: '🌙 Nightly Work Summary & Backup (10:30 PM)',
      titleHi: '🌙 रात का कार्य सारांश और बैकअप (10:30 PM)',
      timestamp: new Date().toISOString(),
      contentEn: `Sir, nightly plan. ${memoryState.stats.totalCommands} command(s) recorded this session; memory persists to jarvis_memory.json on write. No off-host incremental backup is configured.`,
      contentHi: `सर, रात की योजना। इस सत्र में ${memoryState.stats.totalCommands} कमांड दर्ज। मेमोरी jarvis_memory.json में सुरक्षित होती है।`,
      keyInsights: [
        'Total Commands Executed: ' + memoryState.stats.totalCommands,
        'Memory store: jarvis_memory.json (local write)',
        'Off-host backup: not configured',
        describeServerHealthClaim(assessedServerStatus()),
      ],
      systemHealth: {
        serverStatus: assessedServerStatus(),
        activeWebsitesMonitored: 0,
        pendingTasksCount: 0,
        socialPostsPublished: publishedPosts,
      },
    },
  ];
}

let proactiveReports = buildProactiveReports();

// ==============================================================================
// 5. STRICT TRUTH-IN-EXECUTION & REAL MULTI-SOCIAL VERIFICATION ENGINE
// ==============================================================================

/**
 * Base URL for the LinkedIn REST API.
 *
 * Overridable so the real publish path can be exercised end-to-end against a
 * local server. Defaults to the live API.
 */
function getLinkedInApiBaseUrl(): string {
  return (process.env.LINKEDIN_API_BASE_URL || 'https://api.linkedin.com').replace(/\/+$/, '');
}

/**
 * 1. LINKEDIN VERIFICATION & PUBLISHING ENGINE (Official REST Posts API - Personal Member Profile)
 */
async function verifyAndPublishToLinkedIn(post: ServerSocialPost): Promise<{
  success: boolean;
  executionStatus: ServerSocialPost['executionStatus'];
  verificationStatus: ServerSocialPost['verificationStatus'];
  finalTruthState: ServerSocialPost['finalTruthState'];
  providerUrn?: string;
  errorReason?: string;
  userMessage: string;
}> {
  const oauthConn = memoryState.linkedInConnection;
  const token = getDecryptedLinkedInAccessToken();
  const configuredUrn = (oauthConn?.connected && oauthConn.authorUrn ? oauthConn.authorUrn : (process.env.LINKEDIN_AUTHOR_URN || '')).trim();

  if (!token) {
    return {
      success: false,
      executionStatus: 'NOT_PUBLISHED',
      verificationStatus: 'MISSING_CREDENTIALS',
      finalTruthState: 'DRAFT',
      errorReason: 'LinkedIn is not connected. Connect your Personal Profile via the "Connect LinkedIn" OAuth button or configure LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET. Post is held safely in local DRAFT queue without false claims.',
      userMessage: '⚠️ NOT PUBLISHED: Real LinkedIn publishing requires an active OAuth connection. Post is retained safely in your local DRAFT queue with zero false claims.',
    };
  }

  // Token expiration timestamp check
  if (oauthConn?.expiresAt && new Date(oauthConn.expiresAt).getTime() < Date.now()) {
    if (oauthConn) {
      oauthConn.connected = false;
      oauthConn.errorReason = 'OAuth token expired. Please reconnect.';
      persistMemory();
    }
    return {
      success: false,
      executionStatus: 'FAILED',
      verificationStatus: 'PROVIDER_ERROR',
      finalTruthState: 'FAILED',
      errorReason: 'LinkedIn OAuth token has expired. Please reconnect your Personal Profile via the "Connect LinkedIn" button.',
      userMessage: '❌ EXPIRED TOKEN: LinkedIn OAuth token has expired. Click "Connect LinkedIn" to refresh authorization.',
    };
  }

  try {
    let targetAuthor = configuredUrn;
    if (!targetAuthor || targetAuthor === 'urn:li:person:self') {
      const meRes = await fetch(`${getLinkedInApiBaseUrl()}/v2/userinfo`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (meRes.ok) {
        const meData: any = await meRes.json().catch(() => null);
        if (meData?.sub) {
          targetAuthor = `urn:li:person:${meData.sub}`;
          if (oauthConn) {
            oauthConn.memberSub = meData.sub;
            oauthConn.authorUrn = targetAuthor;
            if (meData.name) oauthConn.name = meData.name;
            if (meData.picture) oauthConn.picture = meData.picture;
            if (meData.email) oauthConn.email = meData.email;
            persistMemory();
          }
        }
      } else if (meRes.status === 401 || meRes.status === 403) {
        if (oauthConn) {
          oauthConn.connected = false;
          oauthConn.errorReason = 'OAuth token invalid or expired. Reconnection required.';
          persistMemory();
        }
        return {
          success: false,
          executionStatus: 'FAILED',
          verificationStatus: 'PROVIDER_ERROR',
          finalTruthState: 'FAILED',
          errorReason: 'LinkedIn authentication failed (HTTP 401/403). Token expired or revoked.',
          userMessage: '❌ AUTHENTICATION ERROR: LinkedIn rejected the token (HTTP 401/403). Please reconnect via the Connect LinkedIn button.',
        };
      }
    }

    if (!targetAuthor || targetAuthor === 'urn:li:person:self') {
      targetAuthor = 'urn:li:person:self';
    }

    // Official LinkedIn REST Posts API (2025/v2) Payload for Personal Member Profile
    const postPayload = {
      author: targetAuthor,
      commentary: `${post.content}\n\n${(post.hashtags || []).join(' ')}`.trim(),
      visibility: 'PUBLIC',
      distribution: {
        feedDistribution: 'MAIN_FEED',
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    };

    // The POST to LinkedIn is retried only for failures that are safe to repeat.
    // A timeout after the request was sent is ambiguous: the retry helper stops
    // and reports UNVERIFIED rather than risking a duplicate post.
    const publishAttempt = async (): Promise<
      { ok: true; providerId: string } | { ok: false; status?: number; message: string; error?: unknown }
    > => {
      // `globalThis.Response` because the bare name refers to Express's type here.
      let res: globalThis.Response;
      try {
        res = await fetch(`${getLinkedInApiBaseUrl()}/rest/posts`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'LinkedIn-Version': '202501',
            'X-Restli-Protocol-Version': '2.0.0',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(postPayload),
        });
      } catch (netErr) {
        return {
          ok: false,
          message: netErr instanceof Error ? netErr.message : 'network error',
          error: netErr,
        };
      }

      const xRestliId = res.headers.get('x-restli-id') || res.headers.get('location') || '';
      const resData: any = await res.json().catch(() => null);

      // LinkedIn returns the created post's URN in x-restli-id. A 2xx without a
      // URN is not evidence of a post, so it is reported as unverified rather
      // than being handed a fabricated identifier.
      const confirmedUrn = res.status === 201
        ? (xRestliId || resData?.id || '').trim()
        : res.ok
          ? String(resData?.id ?? '').trim()
          : '';

      if (confirmedUrn) return { ok: true, providerId: confirmedUrn };

      if (res.ok) {
        // Signal the caller that the request succeeded without an identifier.
        return { ok: true, providerId: '' };
      }

      // Treat any other non-ok response as a typed failure so the retry helper can
      // classify it from the status code.
      return { ok: false, status: res.status, message: resData?.message || `HTTP ${res.status}` };
    };

    const { result: publishOutcome, receipt: publishReceipt } = await publishWithRetry({
      label: 'linkedin',
      attempt: publishAttempt,
    });

    if (publishOutcome.published) {
      // LinkedIn answers 201 with the post URN — proof the post exists — but it
      // does not report the post's visibility back, so the confirmation states
      // what was requested (PUBLIC) rather than asserting a confirmed audience.
      return {
        success: true,
        executionStatus: 'SUCCESS',
        verificationStatus: 'VERIFIED',
        finalTruthState: 'VERIFIED',
        providerUrn: publishOutcome.providerId,
        userMessage: `✅ VERIFIED UPLOAD: LinkedIn accepted the post with URN ${publishOutcome.providerId} (requested visibility PUBLIC). LinkedIn does not echo per-post visibility, so the audience is taken as requested, not independently measured.`,
      };
    }

    // A rejected token must clear the connection so the UI asks for a reconnect.
    if (publishOutcome.failureKind === 'AUTH' || publishOutcome.failureKind === 'PERMISSION') {
      if (oauthConn) {
        oauthConn.connected = false;
        oauthConn.errorReason =
          publishOutcome.failureKind === 'AUTH'
            ? 'OAuth token rejected. Please reconnect.'
            : 'OAuth token rejected or missing w_member_social scope. Please reconnect.';
        persistMemory();
      }
    }

    const attempts = publishOutcome.attempts.length;
    const errDetail = publishOutcome.errorReason || 'unknown error';

    if (publishReceipt.outcome === 'UNVERIFIED') {
      return {
        success: false,
        executionStatus: 'UNVERIFIED',
        verificationStatus: 'UNVERIFIED',
        finalTruthState: 'UNVERIFIED',
        errorReason: errDetail,
        userMessage: `⚠️ UNVERIFIED: ${errDetail} Check LinkedIn manually before retrying, to avoid posting twice.`,
      };
    }

    if (publishOutcome.failureKind === 'AUTH' || publishOutcome.failureKind === 'PERMISSION') {
      return {
        success: false,
        executionStatus: 'FAILED',
        verificationStatus: 'PROVIDER_ERROR',
        finalTruthState: 'FAILED',
        errorReason: `LinkedIn auth/permission error: ${errDetail}`,
        userMessage: `❌ PERMISSION / AUTH ERROR: LinkedIn rejected the post (${errDetail}). Ensure 'w_member_social' is approved, then reconnect.`,
      };
    }

    return {
      success: false,
      executionStatus: 'FAILED',
      verificationStatus: 'PROVIDER_ERROR',
      finalTruthState: 'FAILED',
      errorReason: `LinkedIn publish failed after ${attempts} attempt(s): ${errDetail}`,
      userMessage: `❌ PUBLISHING FAILED: ${errDetail} (${attempts} attempt(s)). Post saved as DRAFT.`,
    };
  } catch (netErr: any) {
    return {
      success: false,
      executionStatus: 'FAILED',
      verificationStatus: 'PROVIDER_ERROR',
      finalTruthState: 'FAILED',
      errorReason: `Network exception during LinkedIn dispatch: ${netErr.message}`,
      userMessage: `❌ NETWORK ERROR: Unable to reach LinkedIn API (${netErr.message}). Post held in DRAFT.`,
    };
  }
}

/**
 * 2. FACEBOOK PAGE VERIFICATION & PUBLISHING ENGINE (Meta Graph API v20.0)
 */
async function verifyAndPublishToFacebook(post: ServerSocialPost): Promise<{
  success: boolean;
  executionStatus: ServerSocialPost['executionStatus'];
  verificationStatus: ServerSocialPost['verificationStatus'];
  finalTruthState: ServerSocialPost['finalTruthState'];
  providerUrn?: string;
  errorReason?: string;
  userMessage: string;
}> {
  const token = (process.env.FACEBOOK_PAGE_ACCESS_TOKEN || '').trim();
  const pageId = (process.env.FACEBOOK_PAGE_ID || '').trim();

  if (!token || !pageId) {
    return {
      success: false,
      executionStatus: 'NOT_PUBLISHED',
      verificationStatus: 'MISSING_CREDENTIALS',
      finalTruthState: 'DRAFT',
      errorReason: 'FACEBOOK_PAGE_ACCESS_TOKEN or FACEBOOK_PAGE_ID is not configured in server environment.',
      userMessage: '⚠️ NOT PUBLISHED: Real Facebook Page publishing requires FACEBOOK_PAGE_ACCESS_TOKEN and FACEBOOK_PAGE_ID in environment secrets.',
    };
  }

  try {
    const postBody = `${post.content}\n\n${(post.hashtags || []).join(' ')}`;
    const res = await fetch(`https://graph.facebook.com/v20.0/${pageId}/feed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: postBody,
        access_token: token,
      }),
    });

    const resData: any = await res.json().catch(() => null);

    if (res.ok && resData && resData.id) {
      return {
        success: true,
        executionStatus: 'SUCCESS',
        verificationStatus: 'VERIFIED',
        finalTruthState: 'VERIFIED',
        providerUrn: resData.id,
        userMessage: `✅ VERIFIED UPLOAD: Published to the Facebook Page feed — Graph API returned post ID ${resData.id}. This confirms feed creation, not the post's reach or impressions.`,
      };
    } else {
      const errDetail = resData?.error?.message || `HTTP status ${res.status}`;
      return {
        success: false,
        executionStatus: 'FAILED',
        verificationStatus: 'PROVIDER_ERROR',
        finalTruthState: 'FAILED',
        errorReason: `Meta Graph API error: ${errDetail}`,
        userMessage: `❌ PUBLISHING FAILED: Facebook returned error (${errDetail}). Post saved as DRAFT.`,
      };
    }
  } catch (netErr: any) {
    return {
      success: false,
      executionStatus: 'FAILED',
      verificationStatus: 'PROVIDER_ERROR',
      finalTruthState: 'FAILED',
      errorReason: `Network exception during Facebook dispatch: ${netErr.message}`,
      userMessage: `❌ NETWORK ERROR: Unable to reach Meta Graph API (${netErr.message}). Post held in DRAFT.`,
    };
  }
}

/**
 * 3. INSTAGRAM PROFESSIONAL/BUSINESS ENGINE (Meta Instagram Graph API v20.0)
 */
async function verifyAndPublishToInstagram(post: ServerSocialPost): Promise<{
  success: boolean;
  executionStatus: ServerSocialPost['executionStatus'];
  verificationStatus: ServerSocialPost['verificationStatus'];
  finalTruthState: ServerSocialPost['finalTruthState'];
  providerUrn?: string;
  errorReason?: string;
  userMessage: string;
}> {
  const token = (process.env.INSTAGRAM_ACCESS_TOKEN || '').trim();
  const igUserId = (process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID || '').trim();

  if (!token || !igUserId) {
    return {
      success: false,
      executionStatus: 'NOT_PUBLISHED',
      verificationStatus: 'MISSING_CREDENTIALS',
      finalTruthState: 'DRAFT',
      errorReason: 'INSTAGRAM_ACCESS_TOKEN or INSTAGRAM_BUSINESS_ACCOUNT_ID is not configured in server environment.',
      userMessage: '⚠️ NOT PUBLISHED: Real Instagram publishing requires INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_BUSINESS_ACCOUNT_ID.',
    };
  }

  try {
    const caption = `${post.content}\n\n${(post.hashtags || []).join(' ')}`;
    // Step 1: Create IG Container
    const containerRes = await fetch(`https://graph.facebook.com/v20.0/${igUserId}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        caption,
        media_type: 'CAROUSEL',
        access_token: token,
      }),
    });

    const containerData: any = await containerRes.json().catch(() => null);

    if (!containerRes.ok || !containerData?.id) {
      const errDetail = containerData?.error?.message || `HTTP status ${containerRes.status}`;
      return {
        success: false,
        executionStatus: 'FAILED',
        verificationStatus: 'PROVIDER_ERROR',
        finalTruthState: 'FAILED',
        errorReason: `Instagram container creation error: ${errDetail}`,
        userMessage: `❌ INSTAGRAM FAILED: Container creation failed (${errDetail}). Post held in DRAFT.`,
      };
    }

    const creationId = containerData.id;

    // Step 2: Publish Container
    const publishRes = await fetch(`https://graph.facebook.com/v20.0/${igUserId}/media_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        creation_id: creationId,
        access_token: token,
      }),
    });

    const publishData: any = await publishRes.json().catch(() => null);

    if (publishRes.ok && publishData?.id) {
      return {
        success: true,
        executionStatus: 'SUCCESS',
        verificationStatus: 'VERIFIED',
        finalTruthState: 'VERIFIED',
        providerUrn: publishData.id,
        userMessage: `✅ VERIFIED UPLOAD: Instagram media container published — Graph API returned media ID ${publishData.id}. This confirms the media object exists, not its engagement.`,
      };
    } else {
      const errDetail = publishData?.error?.message || `HTTP status ${publishRes.status}`;
      return {
        success: false,
        executionStatus: 'FAILED',
        verificationStatus: 'PROVIDER_ERROR',
        finalTruthState: 'FAILED',
        errorReason: `Instagram publish step error: ${errDetail}`,
        userMessage: `❌ INSTAGRAM PUBLISH FAILED: ${errDetail}. Held in DRAFT.`,
      };
    }
  } catch (netErr: any) {
    return {
      success: false,
      executionStatus: 'FAILED',
      verificationStatus: 'PROVIDER_ERROR',
      finalTruthState: 'FAILED',
      errorReason: `Network exception during Instagram dispatch: ${netErr.message}`,
      userMessage: `❌ NETWORK ERROR: Unable to reach Instagram Graph API (${netErr.message}). Post held in DRAFT.`,
    };
  }
}

/**
 * Generates a minimal, valid 2-second H.264/AAC MP4 video buffer using ffmpeg for test uploads.
 */
function generateTestMp4Buffer(): Buffer {
  const tmpPath = path.join(os.tmpdir(), `jarvis_yt_test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.mp4`);
  try {
    // Generate a minimal valid 2-second H.264/AAC MP4 video with lavfi color source and silent audio
    execSync(
      `ffmpeg -y -f lavfi -i color=c=0x0f172a:s=320x240:d=2 -f lavfi -i anullsrc=r=44100:cl=mono -t 2 -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest -movflags +faststart ${tmpPath}`,
      { stdio: 'ignore', timeout: 8000 }
    );
    if (fs.existsSync(tmpPath)) {
      const buf = fs.readFileSync(tmpPath);
      try { fs.unlinkSync(tmpPath); } catch {}
      return buf;
    }
  } catch (err) {
    console.warn('ffmpeg test video generation fallback:', err);
  }

  // Fallback: minimal valid ftyp/moov/mdat MP4 container if ffmpeg execution fails
  return Buffer.from([
    0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
    0x00, 0x00, 0x02, 0x00, 0x69, 0x73, 0x6f, 0x6d, 0x69, 0x73, 0x6f, 0x32,
    0x00, 0x00, 0x00, 0x08, 0x66, 0x72, 0x65, 0x65, 0x00, 0x00, 0x00, 0x08,
    0x6d, 0x64, 0x61, 0x74
  ]);
}

/**
 * 4. YOUTUBE VIDEO UPLOAD & DATA ENGINE (Google Cloud & YouTube Data API v3 videos.insert)
 * Requires Level-4 Explicit Approval & Respects Global Kill Switch.
 */
async function verifyAndPublishToYouTube(post: ServerSocialPost): Promise<{
  success: boolean;
  executionStatus: ServerSocialPost['executionStatus'];
  verificationStatus: ServerSocialPost['verificationStatus'];
  finalTruthState: ServerSocialPost['finalTruthState'];
  providerUrn?: string;
  errorReason?: string;
  userMessage: string;
}> {
  // 1. Check Global Kill Switch / Emergency Stop
  const emergency = getEmergencyState();
  if (emergency.emergencyPaused) {
    return {
      success: false,
      executionStatus: 'NOT_PUBLISHED',
      verificationStatus: 'STANDBY',
      finalTruthState: 'FAILED',
      errorReason: 'Global Kill Switch is ACTIVE. All YouTube uploads are strictly blocked.',
      userMessage: '🚨 BLOCKED BY GLOBAL KILL SWITCH: System is paused. YouTube upload aborted.',
    };
  }

  // 2. Check and Refresh OAuth Access Token
  const tokenCheck = await ensureValidYouTubeToken();
  if (!tokenCheck.valid || !tokenCheck.token) {
    return {
      success: false,
      executionStatus: 'NOT_PUBLISHED',
      verificationStatus: 'MISSING_CREDENTIALS',
      finalTruthState: 'DRAFT',
      errorReason: tokenCheck.error || 'YouTube OAuth token is missing or refresh failed. Please connect via 1-Click YouTube OAuth.',
      userMessage: '⚠️ NOT PUBLISHED: Real YouTube upload requires 1-Click OAuth Connect (with channel & upload scopes) from Google Cloud Console.',
    };
  }
  const bearerToken = tokenCheck.token;

  // 2b. Pre-flight scope check. A token can authenticate and still be missing
  // youtube.upload — the OAuth grant may have skipped the scope. The stored
  // scope list is authoritative; when it was never recorded we proceed and let
  // the provider decide, but we never assert the scope is present.
  const grantedScopes = memoryState.youTubeConnection?.scopes;
  if (Array.isArray(grantedScopes)) {
    const requiredScope = PLATFORM_PUBLISH_SCOPES.youtube;
    if (!scopeGranted(grantedScopes, requiredScope)) {
      return {
        success: false,
        executionStatus: 'NOT_PUBLISHED',
        verificationStatus: 'MISSING_CREDENTIALS',
        finalTruthState: 'DRAFT',
        errorReason: `The stored YouTube credential was granted without the upload scope (${requiredScope}). Granted scopes: ${grantedScopes.length > 0 ? grantedScopes.join(' ') : 'none recorded'}.`,
        userMessage: `⚠️ NOT PUBLISHED: This YouTube connection was authorized without the upload scope (${requiredScope}). Reconnect with "1-Click YouTube OAuth" and approve upload access. Post held in DRAFT.`,
      };
    }
  }

  // 3. Verify Channel Status
  // Honest empty default: use the recorded title if any, else no name (never the
  // invented 'YouTube Channel'). Downstream passes it through recordedChannelTitle.
  let channelTitle = memoryState.youTubeConnection?.channelTitle || '';
  let channelId = memoryState.youTubeConnection?.channelId || '';

  try {
    const chRes = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails&mine=true`, {
      headers: { Authorization: `Bearer ${bearerToken}` },
    });
    const chData: any = await chRes.json().catch(() => null);
    if (chRes.ok && chData?.items?.length > 0) {
      channelTitle = chData.items[0].snippet?.title || channelTitle;
      channelId = chData.items[0].id || channelId;
      if (memoryState.youTubeConnection) {
        memoryState.youTubeConnection.channelTitle = channelTitle;
        memoryState.youTubeConnection.channelId = channelId;
        persistMemory();
      }
    }
  } catch (chErr) {
    console.warn('Channel verification warning before YouTube upload:', chErr);
  }

  // 4. Validate Video Metadata
  const title = (post.videoTitle || post.topic || 'JARVIS Autonomous System Overview').trim().slice(0, 100);
  if (!title) {
    return {
      success: false,
      executionStatus: 'NOT_PUBLISHED',
      verificationStatus: 'MISSING_CREDENTIALS',
      finalTruthState: 'DRAFT',
      errorReason: 'YouTube video title is required and cannot be empty.',
      userMessage: '⚠️ NOT PUBLISHED: Video Title is missing. Please provide a title before uploading.',
    };
  }

  const description = (post.videoDescription || post.content || '').trim().slice(0, 5000);
  const tags = (Array.isArray(post.hashtags) && post.hashtags.length > 0)
    ? post.hashtags.map((h: string) => h.replace(/^#/, '').trim()).filter(Boolean)
    : ['JARVIS', 'AI', 'AutonomousAgent', 'TestUpload'];

  // Default testing mode MUST be private or unlisted
  let privacyStatus: 'private' | 'unlisted' | 'public' = 'private';
  if (post.privacyStatus === 'unlisted' || post.privacyStatus === 'public') {
    privacyStatus = post.privacyStatus;
  }

  // 5. Prepare Video Binary Payload
  let videoBuffer: Buffer;
  try {
    if (post.videoPayloadBase64) {
      videoBuffer = Buffer.from(post.videoPayloadBase64, 'base64');
    } else if (post.videoFilePath && fs.existsSync(post.videoFilePath)) {
      videoBuffer = fs.readFileSync(post.videoFilePath);
    } else {
      // Test upload mode -> synthesize valid lightweight H.264 MP4 container
      videoBuffer = generateTestMp4Buffer();
    }
  } catch (bufErr: any) {
    return {
      success: false,
      executionStatus: 'FAILED',
      verificationStatus: 'PROVIDER_ERROR',
      finalTruthState: 'FAILED',
      errorReason: `Failed to prepare video payload: ${bufErr.message}`,
      userMessage: `❌ VIDEO PAYLOAD ERROR: ${bufErr.message}. Post held in DRAFT.`,
    };
  }

  if (!videoBuffer || videoBuffer.length === 0) {
    return {
      success: false,
      executionStatus: 'NOT_PUBLISHED',
      verificationStatus: 'PROVIDER_ERROR',
      finalTruthState: 'DRAFT',
      errorReason: 'Video binary stream is empty or could not be generated.',
      userMessage: '❌ VIDEO ERROR: Empty video buffer. Upload held in DRAFT.',
    };
  }

  // 6. Execute Multipart videos.insert Upload via YouTube Data API v3
  try {
    const boundary = `----JARVIS_YT_BOUNDARY_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const snippetObj: any = {
      title,
      description,
      tags,
      categoryId: '28', // Science & Technology
    };

    const statusObj: any = {
      privacyStatus, // 'private' by default
      selfDeclaredMadeForKids: false,
    };

    if (post.scheduledPublishTime && privacyStatus === 'private') {
      try {
        statusObj.publishAt = new Date(post.scheduledPublishTime).toISOString();
      } catch {}
    }

    const metadataPart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ snippet: snippetObj, status: statusObj })}\r\n`;
    const videoHeaderPart = `--${boundary}\r\nContent-Type: video/mp4\r\n\r\n`;
    const footerPart = `\r\n--${boundary}--\r\n`;

    const bodyBuffer = Buffer.concat([
      Buffer.from(metadataPart, 'utf8'),
      Buffer.from(videoHeaderPart, 'utf8'),
      videoBuffer,
      Buffer.from(footerPart, 'utf8'),
    ]);

    const uploadRes = await fetch(
      'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${bearerToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
          'Content-Length': String(bodyBuffer.length),
        },
        body: bodyBuffer,
      }
    );

    const uploadData: any = await uploadRes.json().catch(() => null);

    if (uploadRes.ok && uploadData?.id) {
      const videoId = uploadData.id;
      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
      const finalPrivacy = uploadData.status?.privacyStatus || privacyStatus;
      // Prefer the channel the provider echoed; otherwise the one read earlier in
      // this route. If neither is a real title, the upload still succeeded — do
      // not invent a channel name for it.
      const uploadedChannel =
        recordedChannelTitle(uploadData.snippet?.channelTitle) ?? recordedChannelTitle(channelTitle);
      const channelLabel = uploadedChannel
        ? `"${uploadedChannel}"`
        : 'the connected channel (channel title not read)';

      post.providerUrn = videoId;
      post.videoUrl = videoUrl;
      post.privacyStatus = finalPrivacy;
      post.targetChannel = uploadedChannel ?? undefined;

      // A 2xx with an id proves the upload was accepted, but not that the video
      // is publicly watchable: a PRIVATE or UNLISTED upload is not visible to
      // anyone but the owner. The message must state the privacy actually
      // applied rather than a blanket "Live".
      const isPubliclyVisible = finalPrivacy === 'public';
      return {
        success: true,
        executionStatus: 'SUCCESS',
        verificationStatus: 'VERIFIED',
        finalTruthState: 'VERIFIED',
        providerUrn: videoId,
        userMessage: isPubliclyVisible
          ? `✅ VERIFIED & PUBLIC: Live on YouTube Channel ${channelLabel}!\n• Video ID: ${videoId}\n• Video URL: ${videoUrl}\n• Privacy Mode: ${finalPrivacy.toUpperCase()} — publicly watchable`
          : `✅ VERIFIED UPLOAD: Accepted by YouTube Data API on channel ${channelLabel} as ${finalPrivacy.toUpperCase()} — ${finalPrivacy === 'private' ? 'visible only to the channel owner' : 'visible only with the direct link, not publicly listed'}.\n• Video ID: ${videoId}\n• Video URL: ${videoUrl}`,
      };
    } else {
      const errDetail = uploadData?.error?.message || `HTTP ${uploadRes.status}: ${uploadRes.statusText}`;
      return {
        success: false,
        executionStatus: 'FAILED',
        verificationStatus: 'PROVIDER_ERROR',
        finalTruthState: 'FAILED',
        errorReason: `YouTube Data API videos.insert error: ${errDetail}`,
        userMessage: `❌ YOUTUBE UPLOAD ERROR: ${errDetail}. Post held safely in DRAFT.`,
      };
    }
  } catch (netErr: any) {
    return {
      success: false,
      executionStatus: 'FAILED',
      verificationStatus: 'PROVIDER_ERROR',
      finalTruthState: 'FAILED',
      errorReason: `Network exception during YouTube upload: ${netErr.message}`,
      userMessage: `❌ NETWORK ERROR: Unable to reach YouTube Data API (${netErr.message}). Post held in DRAFT.`,
    };
  }
}

/**
 * 5. X / TWITTER ENGINE (Twitter Developer API v2 - Pay-per-use architecture)
 */
async function verifyAndPublishToTwitter(post: ServerSocialPost): Promise<{
  success: boolean;
  executionStatus: ServerSocialPost['executionStatus'];
  verificationStatus: ServerSocialPost['verificationStatus'];
  finalTruthState: ServerSocialPost['finalTruthState'];
  providerUrn?: string;
  errorReason?: string;
  userMessage: string;
}> {
  const bearerToken = (process.env.TWITTER_BEARER_TOKEN || '').trim();
  const accessToken = (process.env.TWITTER_ACCESS_TOKEN || '').trim();

  if (!bearerToken && !accessToken) {
    return {
      success: false,
      executionStatus: 'NOT_PUBLISHED',
      verificationStatus: 'MISSING_CREDENTIALS',
      finalTruthState: 'DRAFT',
      errorReason: 'TWITTER_BEARER_TOKEN or TWITTER_ACCESS_TOKEN is not configured in server environment. Twitter API requires a paid developer tier.',
      userMessage: '⚠️ NOT PUBLISHED: X/Twitter API v2 requires paid developer credentials (TWITTER_BEARER_TOKEN / TWITTER_ACCESS_TOKEN). Post retained in DRAFT.',
    };
  }

  try {
    const tweetText = `${post.content}\n\n${(post.hashtags || []).join(' ')}`.substring(0, 280);
    const token = accessToken || bearerToken;
    const res = await fetch('https://api.twitter.com/2/tweets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: tweetText }),
    });

    const data: any = await res.json().catch(() => null);

    if (res.ok && data?.data?.id) {
      return {
        success: true,
        executionStatus: 'SUCCESS',
        verificationStatus: 'VERIFIED',
        finalTruthState: 'VERIFIED',
        providerUrn: data.data.id,
        userMessage: `✅ VERIFIED UPLOAD: X/Twitter accepted the tweet — API v2 returned tweet ID ${data.data.id}. This confirms creation, not delivery to any follower's timeline.`,
      };
    } else {
      const errDetail = data?.detail || data?.title || `HTTP status ${res.status}`;
      return {
        success: false,
        executionStatus: 'FAILED',
        verificationStatus: 'PROVIDER_ERROR',
        finalTruthState: 'FAILED',
        errorReason: `Twitter API error: ${errDetail}`,
        userMessage: `❌ X/TWITTER FAILED: ${errDetail}. Post held in DRAFT.`,
      };
    }
  } catch (netErr: any) {
    return {
      success: false,
      executionStatus: 'FAILED',
      verificationStatus: 'PROVIDER_ERROR',
      finalTruthState: 'FAILED',
      errorReason: `Network exception during Twitter dispatch: ${netErr.message}`,
      userMessage: `❌ NETWORK ERROR: Unable to reach Twitter API (${netErr.message}). Post held in DRAFT.`,
    };
  }
}

/**
 * Live Connection Tester for Individual Platforms (Zero Fake Success)
 */
async function testPlatformConnection(platformKey: string): Promise<{
  success: boolean;
  status: 'NOT_CONFIGURED' | 'AUTH_REQUIRED' | 'CONNECTED' | 'ERROR' | 'EXPIRED' | 'VERIFIED';
  accountName?: string;
  accountIdentifier?: string;
  message: string;
}> {
  const p = platformKey.toLowerCase();

  if (p === 'linkedin') {
    const conn = memoryState.linkedInConnection;
    const token = getDecryptedLinkedInAccessToken();
    if (!token) {
      return {
        success: false,
        status: 'NOT_CONFIGURED',
        message: 'LinkedIn is not connected. Connect your Personal Profile via the "Connect LinkedIn" OAuth button or configure credentials.',
      };
    }
    try {
      const res = await fetch('https://api.linkedin.com/v2/userinfo', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data: any = await res.json().catch(() => null);
        // The token authenticated, but LinkedIn may not return a name. Never
        // fall back to the invented 'LinkedIn Member' — name the identity from
        // the real URN when the provider omitted the name.
        const memberName = observedAccountName(data?.name) ?? observedAccountName(`${data?.given_name || ''} ${data?.family_name || ''}`.trim());
        const memberUrn = data?.sub ? `urn:li:person:${data.sub}` : conn?.authorUrn;
        if (conn && conn.connected) {
          if (memberName) conn.name = memberName;
          if (data?.picture) conn.picture = data.picture;
          if (data?.email) conn.email = data.email;
          if (memberUrn) conn.authorUrn = memberUrn;
          persistMemory();
        }
        return {
          success: true,
          status: 'VERIFIED',
          accountName: memberName ?? undefined,
          accountIdentifier: memberUrn,
          message: memberName
            ? `Live Verified: Connected to Personal Member Profile for ${memberName} (${memberUrn}).`
            : `Live Verified: Connected to Personal Member Profile (${memberUrn}). The provider did not return an account name.`,
        };
      } else {
        if (conn) {
          conn.connected = false;
          conn.errorReason = `LinkedIn returned HTTP ${res.status}. OAuth token may be expired or revoked.`;
          persistMemory();
        }
        return {
          success: false,
          status: res.status === 401 ? 'EXPIRED' : 'ERROR',
          message: `LinkedIn returned HTTP ${res.status}. OAuth token may be expired or revoked. Please click "Connect LinkedIn" to reconnect.`,
        };
      }
    } catch (e: any) {
      return { success: false, status: 'ERROR', message: `Connection error: ${e.message}` };
    }
  }

  if (p === 'facebook') {
    const token = (process.env.FACEBOOK_PAGE_ACCESS_TOKEN || '').trim();
    const pageId = (process.env.FACEBOOK_PAGE_ID || '').trim();
    if (!token || !pageId) {
      return {
        success: false,
        status: 'NOT_CONFIGURED',
        message: 'Missing FACEBOOK_PAGE_ACCESS_TOKEN or FACEBOOK_PAGE_ID.',
      };
    }
    try {
      const res = await fetch(`https://graph.facebook.com/v20.0/${pageId}?fields=id,name,category,link&access_token=${token}`);
      const data: any = await res.json();
      if (res.ok && data?.id) {
        const pageName = observedAccountName(data.name);
        return {
          success: true,
          status: 'VERIFIED',
          accountName: pageName ?? undefined,
          accountIdentifier: data.id,
          message: pageName
            ? `Connected & Verified to Page "${pageName}" (${data.category || 'Business'}).`
            : `Connected & Verified to Page ID ${data.id}. The provider did not return a page name.`,
        };
      } else {
        return {
          success: false,
          status: res.status === 401 ? 'EXPIRED' : 'ERROR',
          message: `Meta Graph API error: ${data?.error?.message || `HTTP ${res.status}`}`,
        };
      }
    } catch (e: any) {
      return { success: false, status: 'ERROR', message: `Connection error: ${e.message}` };
    }
  }

  if (p === 'instagram') {
    const token = (process.env.INSTAGRAM_ACCESS_TOKEN || '').trim();
    const igUserId = (process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID || '').trim();
    if (!token || !igUserId) {
      return {
        success: false,
        status: 'NOT_CONFIGURED',
        message: 'Missing INSTAGRAM_ACCESS_TOKEN or INSTAGRAM_BUSINESS_ACCOUNT_ID.',
      };
    }
    try {
      const res = await fetch(`https://graph.facebook.com/v20.0/${igUserId}?fields=id,username,name&access_token=${token}`);
      const data: any = await res.json();
      if (res.ok && data?.id) {
        // Prefer the real @handle, then the returned name, then the id. Never
        // invent an 'Instagram Account' name when the provider returned none.
        const igUsername = observedAccountName(data.username);
        const igIdentity = igUsername ? `@${igUsername}` : (observedAccountName(data.name) ?? data.id);
        return {
          success: true,
          status: 'VERIFIED',
          accountName: igIdentity,
          accountIdentifier: data.id,
          message: `Connected & Verified to Instagram account ${igIdentity}.`,
        };
      } else {
        return {
          success: false,
          status: res.status === 401 ? 'EXPIRED' : 'ERROR',
          message: `Instagram Graph API error: ${data?.error?.message || `HTTP ${res.status}`}`,
        };
      }
    } catch (e: any) {
      return { success: false, status: 'ERROR', message: `Connection error: ${e.message}` };
    }
  }

  if (p === 'youtube') {
    const tokenCheck = await ensureValidYouTubeToken();
    const apiKey = (process.env.YOUTUBE_API_KEY || '').trim();
    const channelId = (process.env.YOUTUBE_CHANNEL_ID || memoryState.youTubeConnection?.channelId || '').trim();
    const clientId = (process.env.YOUTUBE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '').trim();

    if (!tokenCheck.valid && !apiKey && !clientId) {
      return {
        success: false,
        status: 'NOT_CONFIGURED',
        message: 'YouTube is not configured. Add YOUTUBE_CLIENT_ID & YOUTUBE_CLIENT_SECRET in Settings (⚙️) then click "Connect YouTube".',
      };
    }

    try {
      if (tokenCheck.valid) {
        const res = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails&mine=true`, {
          headers: { Authorization: `Bearer ${tokenCheck.token}` },
        });
        const data: any = await res.json().catch(() => null);
        if (res.ok && data?.items?.length > 0) {
          const item = data.items[0];
          // Never fall back to the invented 'YouTube Channel' name. When the
          // provider returned no title, name the channel from its real id.
          const title = observedAccountName(item.snippet?.title);
          const chId = item.id || '';
          const avatarUrl = item.snippet?.thumbnails?.default?.url || item.snippet?.thumbnails?.high?.url;

          // Update memoryState with verified channel data
          if (memoryState.youTubeConnection) {
            if (title) memoryState.youTubeConnection.channelTitle = title;
            memoryState.youTubeConnection.channelId = chId;
            if (avatarUrl) memoryState.youTubeConnection.avatarUrl = avatarUrl;
            persistMemory();
          }

          return {
            success: true,
            status: 'VERIFIED',
            accountName: title ?? chId ?? undefined,
            accountIdentifier: chId,
            message: title
              ? `Connected & Verified to YouTube Channel "${title}" (${chId}) via OAuth 2.0.`
              : `Connected & Verified to YouTube Channel ${chId} via OAuth 2.0. The provider did not return a channel name.`,
          };
        } else {
          const errMsg = data?.error?.message || `HTTP ${res.status}`;
          const is403 = res.status === 403;
          const is401 = res.status === 401;
          return {
            success: false,
            status: is401 ? 'EXPIRED' : 'ERROR',
            message: is403
              ? `YouTube API 403 (Access Denied / Quota / Verification): ${errMsg}. If your Google Cloud app is in "Testing" mode, ensure your Google account email is added under OAuth Consent Screen -> Test Users.`
              : `YouTube API probe failed (${res.status}): ${errMsg}`,
          };
        }
      } else if (apiKey) {
        // Probe with API key to verify key validity
        const probeUrl = channelId
          ? `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${channelId}&key=${apiKey}`
          : `https://www.googleapis.com/youtube/v3/videoCategories?part=snippet&regionCode=US&key=${apiKey}`;
        
        const res = await fetch(probeUrl);
        const data: any = await res.json().catch(() => null);
        if (res.ok && data?.items?.length > 0) {
          return {
            success: false,
            status: 'AUTH_REQUIRED',
            accountName: 'Google API Key (Read-Only)',
            message: 'Google API Key is active & verified for read-only metadata. Video uploads and channel management require 1-Click OAuth 2.0 connection.',
          };
        } else {
          return {
            success: false,
            status: 'ERROR',
            message: `Google API Key validation failed: ${data?.error?.message || `HTTP ${res.status}`}`,
          };
        }
      } else if (clientId) {
        return {
          success: false,
          status: 'AUTH_REQUIRED',
          message: 'Google OAuth Client credentials configured. Click "Connect YouTube" to authorize your YouTube channel.',
        };
      }

      return {
        success: false,
        status: 'AUTH_REQUIRED',
        message: tokenCheck.error
          ? `YouTube OAuth Notice: ${tokenCheck.error}. Please click "Connect YouTube" to authorize.`
          : 'No active YouTube OAuth token found. Click "Connect YouTube" in Social Integrations to authenticate.',
      };
    } catch (e: any) {
      return { success: false, status: 'ERROR', message: `Connection error: ${e.message}` };
    }
  }

  if (p === 'twitter' || p === 'x') {
    const bearer = (process.env.TWITTER_BEARER_TOKEN || '').trim();
    const access = (process.env.TWITTER_ACCESS_TOKEN || '').trim();
    if (!bearer && !access) {
      return {
        success: false,
        status: 'NOT_CONFIGURED',
        message: 'Architecture ready. TWITTER_BEARER_TOKEN / TWITTER_ACCESS_TOKEN is required (Paid Developer Tier).',
      };
    }
    try {
      const res = await fetch('https://api.twitter.com/2/users/me', {
        headers: { Authorization: `Bearer ${access || bearer}` },
      });
      const data: any = await res.json();
      if (res.ok && data?.data?.username) {
        return {
          success: true,
          status: 'VERIFIED',
          accountName: `@${data.data.username}`,
          accountIdentifier: data.data.id,
          message: `Connected & Verified as @${data.data.username} on X/Twitter.`,
        };
      } else {
        return {
          success: false,
          status: res.status === 401 ? 'EXPIRED' : 'ERROR',
          message: `Twitter API error: ${data?.detail || `HTTP ${res.status}`}`,
        };
      }
    } catch (e: any) {
      return { success: false, status: 'ERROR', message: `Connection error: ${e.message}` };
    }
  }

  return {
    success: false,
    status: 'NOT_CONFIGURED',
    message: `Unknown platform "${platformKey}".`,
  };
}

/**
 * Universal Action Approver & Executor (Enforcing Level 4 Human Approval & Idempotency)
 */
async function executeApprovedAction(
  postIdOrActionId: string,
  actionType: 'approve_and_publish' | 'reject',
  approvedBy: string = 'HUMAN_CONFIRMATION'
): Promise<{
  success: boolean;
  post?: ServerSocialPost;
  auditEntry: AuditLogEntry;
  userMessage: string;
  persisted: boolean;
}> {
  const post = memoryState.socialPosts.find((p) => p.id === postIdOrActionId);
  const actionLogId = `audit-${Date.now()}`;

  // A Level-4 decision (an external publish or its rejection) is only real once
  // its audit row and the post's new state are on disk. The helper previously
  // called persistMemory() at each of these sites and discarded the boolean, so
  // a read-only volume or full disk produced a "confirmed" publish in the reply
  // for a decision the store never kept. Each site now checks the persist
  // result, rolls its in-memory audit row back when the write fails, and reports
  // `persisted: false` so a later persist cannot resurrect a decision that was
  // reported as not recorded.
  const rollbackAudit = (entry: AuditLogEntry) => {
    memoryState.auditLogs = memoryState.auditLogs.filter((e) => e !== entry);
  };

  if (!post) {
    const fallbackAudit: AuditLogEntry = {
      id: actionLogId,
      timestamp: new Date().toISOString(),
      action: `Action on ${postIdOrActionId}`,
      levelRequired: 4,
      approvedBy,
      status: 'BLOCKED',
      errorReason: 'Target post not found in memory registry',
      finalTruthState: 'FAILED',
    };
    pushAuditEntry(fallbackAudit);
    if (!persistMemory()) {
      rollbackAudit(fallbackAudit);
      return {
        success: false,
        auditEntry: fallbackAudit,
        userMessage: 'Target post / action ID was not found, and the audit row could not be written to durable storage.',
        persisted: false,
      };
    }
    return {
      success: false,
      auditEntry: fallbackAudit,
      userMessage: 'Target post / action ID was not found.',
      persisted: true,
    };
  }

  // Idempotency check: if post is already published, do not re-execute
  if (post.status === 'published' && post.finalTruthState === 'VERIFIED') {
    const existingAudit: AuditLogEntry = {
      id: actionLogId,
      timestamp: new Date().toISOString(),
      action: `Duplicate Approval Blocked for ${post.platform} Post (${post.id})`,
      levelRequired: 4,
      approvedBy,
      status: 'BLOCKED',
      verificationStatus: 'VERIFIED',
      providerUrn: post.providerUrn,
      finalTruthState: 'VERIFIED',
      errorReason: 'Action was already executed and verified previously.',
    };
    // Refusing a duplicate is itself a decision and must reach disk like any
    // other. This branch used to build the row, discard it, and still answer
    // `persisted: true` — so `auditEntry.id` named a row absent from the audit
    // log and the duplicate refusal was gone on reboot. Commit it and report the
    // durable outcome honestly.
    pushAuditEntry(existingAudit);
    if (!persistMemory()) {
      rollbackAudit(existingAudit);
      return {
        success: false,
        post,
        auditEntry: {
          ...existingAudit,
          errorReason:
            'The duplicate-approval block could not be written to durable storage; it was not recorded.',
        },
        userMessage: `Post was already published and verified on ${post.platform}, but the duplicate-approval block could not be written to durable storage.`,
        persisted: false,
      };
    }
    return {
      success: true,
      post,
      auditEntry: existingAudit,
      userMessage: post.providerUrn
        ? `Post was already published and verified on ${post.platform} (Share ID: ${post.providerUrn}).`
        : `Post was already published and verified on ${post.platform}, but no provider share ID was recorded.`,
      persisted: true,
    };
  }

  if (actionType === 'reject') {
    const rejectedSnapshot = {
      status: post.status,
      executionStatus: post.executionStatus,
      verificationStatus: post.verificationStatus,
      finalTruthState: post.finalTruthState,
      errorReason: post.errorReason,
    };
    post.status = 'draft';
    post.executionStatus = 'DRAFT';
    post.verificationStatus = 'STANDBY';
    post.finalTruthState = 'REJECTED';
    post.errorReason = 'Rejected by human operator.';

    const rejectAudit: AuditLogEntry = {
      id: actionLogId,
      timestamp: new Date().toISOString(),
      action: `Human Rejected ${post.platform} Post Draft (${post.id})`,
      levelRequired: 4,
      approvedBy,
      status: 'BLOCKED',
      verificationStatus: 'STANDBY',
      finalTruthState: 'REJECTED',
    };
    pushAuditEntry(rejectAudit);
    if (!persistMemory()) {
      rollbackAudit(rejectAudit);
      post.status = rejectedSnapshot.status;
      post.executionStatus = rejectedSnapshot.executionStatus;
      post.verificationStatus = rejectedSnapshot.verificationStatus;
      post.finalTruthState = rejectedSnapshot.finalTruthState;
      post.errorReason = rejectedSnapshot.errorReason;
      return {
        success: false,
        post,
        auditEntry: rejectAudit,
        userMessage: 'The rejection could not be written to durable storage; the draft was not changed.',
        persisted: false,
      };
    }

    return {
      success: true,
      post,
      auditEntry: rejectAudit,
      userMessage: 'Draft rejected. Post returned to offline draft status.',
      persisted: true,
    };
  }

  // 0. Hard Kill Switch / Emergency Pause check
  const emergency = getEmergencyState();
  if (emergency.emergencyPaused) {
    const killAudit: AuditLogEntry = {
      id: actionLogId,
      timestamp: new Date().toISOString(),
      action: `BLOCKED Level 4 ${post.platform} Action (${post.id}) - Global Kill Switch Active`,
      levelRequired: 4,
      approvedBy,
      status: 'BLOCKED',
      verificationStatus: 'STANDBY',
      finalTruthState: 'FAILED',
      errorReason: 'Operation blocked: Global Kill Switch / Emergency Stop is active.',
    };
    pushAuditEntry(killAudit);
    if (!persistMemory()) {
      rollbackAudit(killAudit);
      return {
        success: false,
        post,
        auditEntry: killAudit,
        userMessage: '🚨 Action blocked: Global Kill Switch / Emergency Stop is active. (The block audit row could not be written to durable storage.)',
        persisted: false,
      };
    }
    return {
      success: false,
      post,
      auditEntry: killAudit,
      userMessage: '🚨 Action blocked: Global Kill Switch / Emergency Stop is active.',
      persisted: true,
    };
  }

  // Multi-Platform Real Publishing Router
  const platLower = (post.platform || '').toLowerCase();
  let result: {
    success: boolean;
    executionStatus: ServerSocialPost['executionStatus'];
    verificationStatus: ServerSocialPost['verificationStatus'];
    finalTruthState: ServerSocialPost['finalTruthState'];
    providerUrn?: string;
    errorReason?: string;
    userMessage: string;
  };

  if (platLower.includes('linkedin')) {
    result = await verifyAndPublishToLinkedIn(post);
  } else if (platLower.includes('facebook') || platLower.includes('fb')) {
    result = await verifyAndPublishToFacebook(post);
  } else if (platLower.includes('instagram') || platLower.includes('ig')) {
    result = await verifyAndPublishToInstagram(post);
  } else if (platLower.includes('youtube') || platLower.includes('yt')) {
    result = await verifyAndPublishToYouTube(post);
  } else if (platLower.includes('twitter') || platLower.includes('x')) {
    result = await verifyAndPublishToTwitter(post);
  } else {
    // Internal channel with no external provider to confirm against. The
    // broadcast is recorded as dispatched, not verified: there is no platform
    // response to verify it with. Engagement counts are deliberately omitted
    // rather than generated, since invented numbers read as real metrics.
    const internalSnapshot = {
      status: post.status,
      executionStatus: post.executionStatus,
      verificationStatus: post.verificationStatus,
      finalTruthState: post.finalTruthState,
      verifiedAt: post.verifiedAt,
    };
    post.status = 'not_published';
    post.executionStatus = 'NOT_PUBLISHED';
    post.verificationStatus = 'STANDBY';
    post.finalTruthState = 'NOT_PUBLISHED';
    post.verifiedAt = undefined;

    const internalAudit: AuditLogEntry = {
      id: actionLogId,
      timestamp: new Date().toISOString(),
      action: `Execute Level 4 ${post.platform} Broadcast (${post.id})`,
      levelRequired: 4,
      approvedBy,
      status: 'NOT_PUBLISHED',
      targetPlatform: post.platform,
      verificationStatus: 'STANDBY',
      finalTruthState: 'NOT_PUBLISHED',
      errorReason:
        'No external provider is configured for this channel, so the broadcast could not be verified. No engagement metrics are reported.',
    };
    pushAuditEntry(internalAudit);
    if (!persistMemory()) {
      rollbackAudit(internalAudit);
      post.status = internalSnapshot.status;
      post.executionStatus = internalSnapshot.executionStatus;
      post.verificationStatus = internalSnapshot.verificationStatus;
      post.finalTruthState = internalSnapshot.finalTruthState;
      post.verifiedAt = internalSnapshot.verifiedAt;
      return {
        success: false,
        post,
        auditEntry: internalAudit,
        userMessage: `⚠️ NOT_VERIFIED: ${post.platform} has no configured provider to confirm against, and the dispatch audit row could not be written to durable storage.`,
        persisted: false,
      };
    }

    return {
      success: false,
      post,
      auditEntry: internalAudit,
      userMessage: `⚠️ NOT_VERIFIED: ${post.platform} has no configured provider to confirm against. Nothing was reported as published, and no engagement metrics are shown.`,
      persisted: true,
    };
  }

  // The post state reflects what the provider actually did and is never rolled
  // back: a verified publish really happened even if the local record cannot be
  // written. The durable-write result is reported separately so no caller reads
  // the local record as confirmed when it is not on disk.
  post.status = result.finalTruthState === 'VERIFIED' ? 'published' : result.finalTruthState === 'FAILED' ? 'failed' : 'not_published';
  post.executionStatus = result.executionStatus;
  post.verificationStatus = result.verificationStatus;
  post.finalTruthState = result.finalTruthState;
  post.providerUrn = result.providerUrn;
  post.errorReason = result.errorReason;
  post.verifiedAt = result.finalTruthState === 'VERIFIED' ? new Date().toISOString() : undefined;

  const auditEntry: AuditLogEntry = {
    id: actionLogId,
    timestamp: new Date().toISOString(),
    action: `Execute Level 4 ${post.platform} Publish (${post.id})`,
    levelRequired: 4,
    approvedBy,
    status: result.finalTruthState === 'VERIFIED' ? 'VERIFIED' : result.finalTruthState === 'FAILED' ? 'FAILED' : 'NOT_PUBLISHED',
    targetPlatform: post.platform,
    verificationStatus: result.verificationStatus,
    errorReason: result.errorReason,
    providerUrn: result.providerUrn,
    finalTruthState: result.finalTruthState,
  };
  pushAuditEntry(auditEntry);
  const persisted = persistMemory();
  if (!persisted) {
    // The publish already happened at the provider and is not undone. Drop the
    // audit row that could not be written so the in-memory log does not claim a
    // durable record, and tell the caller the local record is not on disk.
    rollbackAudit(auditEntry);
  }

  const baseMessage = result.userMessage;
  return {
    success: result.success,
    post,
    auditEntry,
    userMessage: persisted
      ? baseMessage
      : `${baseMessage}\n⚠️ The publish outcome could not be written to durable storage; the local record may be lost on restart.`,
    persisted,
  };
}

// ==============================================================================
// 6. REAL TELEGRAM BOT MOBILE CONTROLLER ENGINE
// ==============================================================================
let telegramMessages = telegramSeedMessages(getLocalHostIdentity());

function getCleanTelegramToken(): string | null {
  const token = (process.env.TELEGRAM_BOT_TOKEN || '').trim().replace(/^["']|["']$/g, '');
  if (!token || token.length < 10 || !token.includes(':')) {
    return null;
  }
  return token;
}

function getCleanAdminChatId(): string | null {
  const raw = (process.env.TELEGRAM_ADMIN_CHAT_ID || '').trim().replace(/^["']|["']$/g, '');
  return raw.length > 0 ? raw : null;
}

/**
 * Telegram API host. Overridable so the real send path can be pointed at a
 * local server in tests; production leaves it unset and uses Telegram.
 */
function getTelegramApiBase(): string {
  const override = (process.env.TELEGRAM_API_BASE_URL || '').trim().replace(/\/+$/, '');
  return override.length > 0 ? override : 'https://api.telegram.org';
}

const initialTelegramToken = getCleanTelegramToken();
const initialAdminChatId = getCleanAdminChatId();

let telegramConfig = {
  botName: 'Hermes JARVIS Mobile Controller',
  botUsername: '@HermesJarvisAssistantBot',
  botUsernameReported: false,
  botTokenMasked: initialTelegramToken
    ? `${initialTelegramToken.substring(0, Math.min(6, initialTelegramToken.length))}...${initialTelegramToken.slice(-4)}`
    : 'Not Configured (Add TELEGRAM_BOT_TOKEN)',
  isLiveTokenConfigured: Boolean(initialTelegramToken),
  isLiveConnected: false,
  mode: initialTelegramToken ? ('live_polling' as const) : ('simulator' as const),
  webhookStatus: initialTelegramToken ? ('polling' as const) : ('waiting_token' as const),
  telegramLink: 'https://t.me/BotFather',
  allowedUserIds: initialAdminChatId ? [initialAdminChatId] : ['Owner (Auto-registers on /start)'],
  humanApprovalRequired: true,
  notificationsEnabled: true,
  adminChatIdConfigured: Boolean(initialAdminChatId),
  // Counts this process has actually handled, never a plausible seed. The old
  // literal 3 was a fabricated baseline.
  totalMessagesReceived: 0,
  lastActivity: new Date().toISOString(),
  errorMessage: undefined as string | undefined,
};

let activeTelegramChatId: string | number | null = initialAdminChatId;
let telegramPollingActive = false;
let lastTelegramUpdateId = 0;

async function callTelegramApi(method: string, body?: any, timeoutMs = 8000) {
  const token = getCleanTelegramToken();
  if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN is missing or malformed');
  }

  const controller = new AbortController();
  const timeoutTimer = setTimeout(() => {
    try {
      controller.abort();
    } catch {
      // ignore
    }
  }, timeoutMs);

  try {
    const res = await fetch(`${getTelegramApiBase()}/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timeoutTimer);

    let data: any = null;
    try {
      data = await res.json();
    } catch {
      const err: any = new Error(`Telegram API returned non-JSON response (HTTP ${res.status})`);
      err.statusCode = res.status;
      throw err;
    }

    if (!data || !data.ok) {
      const desc = data?.description || `Telegram API call to ${method} failed (HTTP ${res.status})`;
      const err: any = new Error(desc);
      err.statusCode = res.status;
      err.errorCode = data?.error_code;
      throw err;
    }
    return data.result;
  } catch (err: any) {
    clearTimeout(timeoutTimer);
    if (err.name === 'AbortError') {
      const abortErr: any = new Error(`Telegram API request to ${method} timed out after ${timeoutMs}ms`);
      abortErr.statusCode = 408;
      throw abortErr;
    }
    throw err;
  }
}

function formatTelegramReplyMarkup(rawMarkup?: any): Record<string, any> | undefined {
  if (!rawMarkup) {
    return undefined;
  }
  // If it's passed as a raw array of button rows: [[ { text, callback_data } ]]
  if (Array.isArray(rawMarkup)) {
    if (rawMarkup.length === 0) return undefined;
    return { inline_keyboard: rawMarkup };
  }
  if (typeof rawMarkup === 'object') {
    // If it already has inline_keyboard
    if (Array.isArray(rawMarkup.inline_keyboard) && rawMarkup.inline_keyboard.length > 0) {
      return rawMarkup;
    }
    // If it has keyboard (custom reply keyboard)
    if (Array.isArray(rawMarkup.keyboard) && rawMarkup.keyboard.length > 0) {
      return rawMarkup;
    }
    // If it has remove_keyboard or force_reply
    if (rawMarkup.remove_keyboard === true || rawMarkup.force_reply === true) {
      return rawMarkup;
    }
  }
  return undefined;
}

/**
 * Send a message and report exactly what can be confirmed about it.
 *
 * Uses the strict sender so real failures (a blocked bot, a bad token) surface
 * and are classified, rather than being collapsed into "nothing to send".
 */
async function deliverTelegramMessage(
  chatId: string | number | null | undefined,
  text: string,
  replyMarkup?: any,
): Promise<DeliveryInterpretation> {
  if (!getCleanTelegramToken() || !chatId) {
    return interpretTelegramSend(null);
  }
  try {
    return interpretTelegramSend(await sendTelegramMessageStrict(chatId, text, replyMarkup));
  } catch (err) {
    return classifyTelegramError(err);
  }
}


/**
 * Send a Telegram message, throwing on failure.
 *
 * Markdown is attempted first. The plain-text fallback runs only when the first
 * failure looks like a formatting/parse error — retrying plain text after a 403
 * or 401 is pointless, and swallowing those errors is how a blocked bot came to
 * look like a successful send.
 */
async function sendTelegramMessageStrict(
  chatId: string | number,
  text: string,
  replyMarkup?: any,
): Promise<any> {
  const formattedMarkup = formatTelegramReplyMarkup(replyMarkup);
  const payload: Record<string, any> = { chat_id: chatId, text, parse_mode: 'Markdown' };
  if (formattedMarkup) payload.reply_markup = formattedMarkup;

  try {
    return await callTelegramApi('sendMessage', payload, 6000);
  } catch (err: any) {
    const isParseError = /parse|entities|markdown/i.test(String(err?.message ?? ''));
    if (!isParseError) throw err;

    const fallbackPayload: Record<string, any> = {
      chat_id: chatId,
      text: text.replace(/[*_`#]/g, ''),
    };
    if (formattedMarkup) fallbackPayload.reply_markup = formattedMarkup;
    return await callTelegramApi('sendMessage', fallbackPayload, 6000);
  }
}

/**
 * Legacy send helper. Returns `null` on any failure so existing fire-and-forget
 * callers never throw. Use `deliverTelegramMessage` when the outcome matters.
 */
async function sendRealTelegramMessage(chatId: string | number, text: string, replyMarkup?: any) {
  if (!getCleanTelegramToken() || !chatId) return null;
  try {
    return await sendTelegramMessageStrict(chatId, text, replyMarkup);
  } catch (err: any) {
    console.warn(`[Telegram Bot] Failed to send message to ${chatId}:`, err?.message);
    return null;
  }
}

/**
 * Universal Mobile Command Processor
 * Responds to ANY incoming text message (commands, natural language, Hindi, English, Hinglish).
 * NEVER silently ignores any message.
 */
async function processMobileCommand(text: string, senderLabel: string = 'user', chatId?: string | number) {
  const clean = text.trim();
  const lower = clean.toLowerCase();

  const userMsg = {
    id: `tg-${Date.now()}`,
    sender: 'user' as const,
    text: clean,
    timestamp: new Date().toISOString(),
    type: 'text' as const,
  };
  telegramMessages.push(userMsg);
  telegramConfig.totalMessagesReceived = (telegramConfig.totalMessagesReceived || 0) + 1;
  telegramConfig.lastActivity = new Date().toISOString();
  memoryState.stats.totalCommands += 1;

  const intentData = classifyIntentLocally(clean);
  let botReplyText = '';
  let actionData: any = null;
  let inlineKeyboard: any = null;

  // 1. /start or Hello/Hi greeting
  if (clean === '/start' || lower === 'start' || lower === 'hi' || lower === 'hello' || lower === 'नमस्ते' || lower === 'kaisa hai' || lower === 'kaise ho') {
    botReplyText = `🤖 *HERMES JARVIS ONLINE MOBILE CONTROLLER*\n\nGreetings, ${memoryState.name || 'Sir'}! ${telegramHostClaim(getLocalHostIdentity())} (no 24/7 uptime has been measured here).\n\n*Quick Mobile Commands:*\n• \`JARVIS, project check करो\` — Codebase & Git Audit\n• \`JARVIS, आज की LinkedIn post बनाओ\` — Social Draft & Level 4 Approval\n• \`JARVIS, client lead quotation बनाओ\` — Freelance Proposal\n• \`JARVIS, server status बताओ\` — Cloud & Telemetry\n• \`JARVIS, कल सुबह 9 बजे report देना\` — Schedule Daily Briefing\n\n🛡️ *Security Matrix*: ${securityMatrixPosture(securityMatrixState).levelLabel} active. Human approval: ${securityMatrixPosture(securityMatrixState).humanApproval}.`;
    inlineKeyboard = {
      inline_keyboard: [
        [
          { text: '📊 Project Audit', callback_data: 'cmd_check_project' },
          { text: '☁️ Server Telemetry', callback_data: 'cmd_cloud_telemetry' },
        ],
        [
          { text: '📝 Draft Social Post', callback_data: 'cmd_draft_post' },
          { text: '💼 Client Quotation', callback_data: 'cmd_gen_quote' },
        ],
        [
          { text: '🛡️ Security Audit', callback_data: 'cmd_security_audit' },
          { text: '🌅 Morning Briefing', callback_data: 'cmd_morning_report' },
        ],
      ],
    };
  } else if (intentData.intent === 'summarize_youtube_video') {
    const rawUrl = intentData.actionPayload?.url || clean;
    const vidId = intentData.actionPayload?.videoId || extractYouTubeVideoId(rawUrl);
    if (!vidId && !rawUrl.includes('http')) {
      botReplyText = `🎥 *YOUTUBE VIDEO SUMMARIZER*\n\nPlease provide a YouTube URL (e.g. \`https://www.youtube.com/watch?v=...\` or \`/summarize https://youtu.be/...\`).`;
    } else {
      botReplyText = `⏳ *HERMES JARVIS*: Analyzing YouTube video and extracting transcript...\n\nProcessing link: \`${rawUrl || vidId}\``;
      // Fetch and summarize
      const summaryResult = await summarizeYouTubeVideoCore({ url: rawUrl, videoId: vidId || undefined });
      if (summaryResult.success && summaryResult.videoInfo) {
        const info = summaryResult.videoInfo;
        // A summariser result can carry `success: true` and a video with an EMPTY
        // summary (`source: 'none'` — no transcript and no description). The old
        // reply rendered the "YOUTUBE VIDEO SUMMARY" heading with a blank body in
        // that case, reading as a summary that was never produced. Lead with the
        // truth instead.
        const noSummaryNotice = formatYouTubeSummaryNotice(summaryResult);
        if (noSummaryNotice) {
          botReplyText = `🎥 *YOUTUBE VIDEO SUMMARY*\n\n📌 *Title*: ${info.title}\n👤 *Channel*: ${info.channel} (${info.durationFormatted})\n🔗 [Watch Video](${info.url})\n\n⚠️ _${noSummaryNotice}_`;
          actionData = { type: 'youtube_summary_unavailable', videoInfo: info, source: summaryResult.source };
        } else {
          const takeaways = summaryResult.keyTakeaways && summaryResult.keyTakeaways.length > 0
            ? `\n\n💡 *Key Takeaways*:\n${summaryResult.keyTakeaways.slice(0, 5).join('\n')}`
            : '';
          const notice = summaryResult.notice ? `\n\n⚠️ _${summaryResult.notice}_` : '';
          botReplyText = `🎥 *YOUTUBE VIDEO SUMMARY*\n\n📌 *Title*: ${info.title}\n👤 *Channel*: ${info.channel} (${info.durationFormatted})\n🔗 [Watch Video](${info.url})${notice}\n\n${summaryResult.summary}${takeaways}`;
          actionData = { type: 'youtube_summary', videoInfo: info, source: summaryResult.source };
        }
      } else {
        botReplyText = `❌ *YouTube Summarizer Notice*:\n${summaryResult.success ? 'Failed to extract video content. Ensure the video is public and accessible.' : summaryResult.error}`;
      }
    }
  } else if (intentData.intent === 'check_project') {
    // Report the real working tree. The previous reply asserted a completed
    // multi-repository audit, a fixed clean branch, a cloud-VM uptime and a
    // green test suite — none of which this handler ever measured.
    const git = realGitStatus();
    if (git.success) {
      botReplyText = git.clean
        ? `📊 *HERMES PROJECT AUDIT*\n\n*Repository*: this JARVIS working tree.\n• Branch: \`${git.branch ?? 'detached HEAD'}\`\n• Working tree: clean (${git.statusText || 'no changes'})\n\nNote: this checks the local working tree only. Other repositories, the cloud VM and the test suite are not inspected by this command.`
        : `📊 *HERMES PROJECT AUDIT*\n\n*Repository*: this JARVIS working tree.\n• Branch: \`${git.branch ?? 'detached HEAD'}\`\n• Working tree: *uncommitted changes present*\n\n\`\`\`\n${(git.statusText || '').slice(0, 500)}\n\`\`\``;
      actionData = { type: 'check_project', status: git.clean ? 'clean' : 'dirty', branch: git.branch };
    } else {
      botReplyText = `📊 *HERMES PROJECT AUDIT*\n\n⚠️ Audit unavailable: git could not be queried in this environment.\nReason: ${git.error ?? 'unknown'}`;
      actionData = { type: 'check_project', status: 'unavailable', error: git.error };
    }
    inlineKeyboard = {
      inline_keyboard: [
        [{ text: '📝 Create Today\'s Post', callback_data: 'cmd_draft_post' }],
        [{ text: '🔄 Re-Audit Codebase', callback_data: 'cmd_check_project' }],
      ],
    };
  } else if (intentData.intent === 'create_social_post') {
    const activeDraft = memoryState.socialPosts.find((p) => p.status === 'pending_approval') || memoryState.socialPosts[0];
    botReplyText = `📱 *NEW SOCIAL MEDIA POST DRAFTED*\n\n*Topic*: ${activeDraft.topic}\n*Platform*: ${activeDraft.platform}\n\n📝 *Draft Content*:\n"${activeDraft.content.substring(0, 220)}..."\n\n⚠️ *Human Approval Mode*: Post तैयार है। क्या मैं इसे publish करूँ?`;
    actionData = { type: 'social_draft', postId: activeDraft.id, status: 'pending_approval' };
    inlineKeyboard = {
      inline_keyboard: [
        [
          { text: '✅ YES (Approve & Publish)', callback_data: `approve_post_${activeDraft.id}` },
          { text: '❌ REJECT (Draft Only)', callback_data: `reject_post_${activeDraft.id}` },
        ],
      ],
    };
  } else if (intentData.intent === 'find_document') {
    const doc = intentData.actionPayload?.query || '';
    const search = realFsSearch(doc);
    if (search.success && search.matches && search.matches.length > 0) {
      const listing = search.matches
        .map((m) => `• \`${m.path}\` (${(m.sizeBytes / 1024).toFixed(1)} KB)`)
        .join('\n');
      botReplyText = `🔍 *FILE SEARCH RESULT*\n\nSearched the workspace for "${doc}". ${search.matches.length} match(es):\n${listing}`;
      actionData = { type: 'file_found', query: doc, matches: search.matches };
    } else if (search.success) {
      botReplyText = `🔍 *FILE SEARCH RESULT*\n\nNo file matching "${doc}" exists in the workspace. I did not find a document to report.`;
      actionData = { type: 'file_not_found', query: doc };
    } else {
      botReplyText = `🔍 *FILE SEARCH UNAVAILABLE*\n\nCould not search the workspace: ${search.error}`;
      actionData = { type: 'file_search_unavailable', error: search.error };
    }
  } else if (intentData.intent === 'schedule_morning_report') {
    const telegramLinked = !!activeTelegramChatId && !!getCleanTelegramToken();
    const delivery = telegramLinked
      ? 'A Telegram chat is linked, so the briefing will be pushed there.'
      : 'No Telegram chat is currently linked, so nothing will be delivered until you connect one.';
    botReplyText = `⏰ *SCHEDULE ACTIVE*\n\nThe proactive Morning Briefing runs daily at *09:00 AM IST* on this server's scheduler. ${delivery}`;
    actionData = { type: 'schedule_morning_report', time: '09:00 AM IST', telegramLinked };
  } else if (intentData.intent === 'generate_quotation') {
    const withQuote = memoryState.freelanceLeads.filter((l) => !!l.quotation);
    if (withQuote.length === 0) {
      botReplyText = `💼 *NO QUOTATION FOUND*\n\nNo quotation has been generated yet — the freelance pipeline has no lead with a prepared quotation. I did not generate one.`;
      actionData = { type: 'quotation_not_available' };
    } else {
      const listing = withQuote
        .map((l) => `• *${l.clientName}* — ${l.quotation!.totalPrice} ${l.budgetEstimate.currency} (${l.quotation!.timelineDays} days)`)
        .join('\n');
      botReplyText = `💼 *EXISTING QUOTATIONS*\n\n${withQuote.length} lead(s) with a prepared quotation:\n${listing}\n\nThese are stored pipeline records. No new quotation was generated.`;
      actionData = { type: 'quotation_ready', leads: withQuote.map((l) => ({ id: l.id, clientName: l.clientName, quotation: l.quotation })) };
      inlineKeyboard = {
        inline_keyboard: [
          [
            { text: '📊 View Freelance Leads', callback_data: 'cmd_view_leads' },
            { text: '☁️ Server Telemetry', callback_data: 'cmd_cloud_telemetry' },
          ],
        ],
      };
    }
  } else if (intentData.intent === 'cloud_telemetry') {
    const live = oracleCloudState.metricsSource === 'live_host' ? oracleCloudState.metrics : null;
    const cpuLine = live?.cpuUsage != null ? `${live.cpuUsage}%` : 'unavailable';
    const ramLine = live?.ramUsedGb != null ? `${live.ramUsedGb} GB` : 'unavailable';
    botReplyText = `☁️ *ORACLE CLOUD ARM VM STATUS*\n\n• *Status*: ${describeRunState(oracleCloudState.status)}\n• *CPU*: ${cpuLine} | *RAM*: ${ramLine}\n• *Metrics Source*: ${live ? 'live host telemetry' : 'unavailable'}\n• *Uptime*: ${processUptimeLabel(oracleCloudState.uptimeHours)} (instance uptime is a control-plane fact this server does not measure)\n• *Cost*: ${describeBillingCost(oracleCloudState.billingEntitlement)}\n• *IP*: ${describePublicIp(oracleCloudState.publicIp)}\n• *Security Level*: Level ${securityMatrixState.currentLevel}`;
    actionData = { type: 'telemetry', metrics: oracleCloudState.metrics };
  } else if (intentData.intent === 'security_audit') {
    const posture = securityMatrixPosture(securityMatrixState);
    botReplyText = `🛡️ *HERMES SECURITY MATRIX AUDIT*\n\n• *Active Level*: ${posture.levelLabel}\n• *Human Approval*: ${posture.humanApproval}\n• *Secret Masking*: ${posture.secretMasking}\n• *Credential Leak Protection*: ${posture.credentialLeakProtection}\n• *Audit Trail*: ${describeAuditTrail(memoryState.auditLogs)} (${auditTrailCounts(memoryState.auditLogs).total} total)`;
    actionData = { type: 'security_audit', level: securityMatrixState.currentLevel };
  } else if (intentData.intent === 'set_name') {
    // Mirrors the /api/chat set_name case and the offline engine: the classifier's
    // name group is greedy over a whitespace class, so a pasted sentence or a
    // digit-only payload reaches here. Recording that as the identity and telling
    // the user it was saved is a spoken fake success. Only a plausible name is
    // written, and the reply reflects whether it actually reached disk.
    const rawName = intentData.actionPayload?.name || clean.replace(/(?:my name is|mera naam|i am|call me)/i, '').trim();
    const verdict = judgeSetNameIntent(rawName);
    if (verdict.kind === 'name') {
      memoryState.name = verdict.name;
      const persisted = persistMemory();
      if (persisted) {
        botReplyText = `Understood, ${verdict.name}! Your identity has been recorded into my durable memory banks.`;
      } else {
        botReplyText = `I read your name as *${verdict.name}*, but I could not write it to durable storage, so it is not saved. Please try again.`;
      }
      actionData = { type: 'set_name', name: verdict.name, persisted };
    } else {
      botReplyText = `I could not read a usable name there (${verdict.reason}). Please say it plainly, for example "My name is [your name]".`;
      actionData = { type: 'set_name_rejected', reason: verdict.reason, actionExecuted: false };
    }
  } else if (intentData.intent === 'get_name') {
    if (memoryState.name) {
      botReplyText = `Your name is *${memoryState.name}*, as logged in our neural memory banks.`;
    } else {
      botReplyText = `I have not recorded your name yet. You can tell me by saying "My name is [your name]".`;
    }
  } else {
    // Natural Language AI Processing (Gemini or Resilient Bilingual Fallback)
    const ai = getGenAI();
    if (ai) {
      try {
        const result = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: `You are HERMES JARVIS, an autonomous AI agent running on an Oracle Always Free ARM Cloud server, controllable via Android Telegram Bot and Web Panel.
User's name: ${memoryState.name || 'Sir'}.
Reply with professional poise, concise clarity (1-3 sentences), markdown formatting, and emojis.
Support Hindi, English, and Hinglish seamlessly.
User message: "${clean}".`,
                },
              ],
            },
          ],
          config: {
            temperature: 0.7,
            maxOutputTokens: 250,
          },
        });
        botReplyText = result.text?.trim() || `Sir, your command "${clean}" was parsed and logged by this daemon process.`;
      } catch (geminiErr: any) {
        console.warn('[Telegram Bot] Gemini fallback:', geminiErr?.message);
        botReplyText = `Greetings ${memoryState.name || 'Sir'}. Hermes Jarvis server online. Command "${clean}" received and recorded.`;
      }
    } else {
      // Rule-based smart bilingual heuristic
      if (lower.includes('who are you') || lower.includes('तुम कौन हो') || lower.includes('aap kaun ho')) {
        const host = getLocalHostIdentity();
        botReplyText = `I am *HERMES JARVIS*, your autonomous mobile-controlled AI assistant. I am running as a server process on this host (${host.hostname}).`;
      } else if (lower.includes('how are you') || lower.includes('kaise ho') || lower.includes('kaisa hai')) {
        botReplyText = `All subsystems I can measure are responding, ${memoryState.name || 'Sir'}. CPU load is currently unavailable on this host.`;
      } else if (lower.includes('thank') || lower.includes('धन्यवाद') || lower.includes('shukriya')) {
        botReplyText = `Always at your service, ${memoryState.name || 'Sir'}. Let me know if you need any other tasks executed.`;
      } else {
        botReplyText = `Command received: "${clean}". Hermes Jarvis daemon standing by. You can ask me to check projects, create social posts, generate quotations, or check server health.`;
      }
    }
  }

  const botMsg = {
    id: `tg-${Date.now() + 1}`,
    sender: 'jarvis_bot' as const,
    text: botReplyText,
    timestamp: new Date().toISOString(),
    type: 'text' as const,
    actionData,
  };
  telegramMessages.push(botMsg);
  if (telegramMessages.length > 80) telegramMessages.shift();

  // Send to real Telegram and record whether it actually landed. The previous
  // fire-and-forget call meant a failed or blocked send still looked delivered
  // to every caller (and the web gateway spoke the reply aloud regardless).
  // `deliverTelegramMessage` never throws; it classifies the outcome.
  let delivery: DeliveryInterpretation | undefined;
  if (chatId && getCleanTelegramToken()) {
    delivery = await deliverTelegramMessage(chatId, botReplyText, inlineKeyboard);
    if (!delivery.delivered) {
      console.warn(`[Telegram Bot] Reply not delivered to ${chatId}: ${delivery.errorReason}`);
    }
  }

  persistMemory();
  return { userMsg, botMsg, inlineKeyboard, delivery };
}

async function handleTelegramCallback(callbackQuery: any) {
  const data = callbackQuery.data || '';
  const chatId = callbackQuery.message?.chat?.id;
  const callbackId = callbackQuery.id;

  // Acknowledge callback safely
  try {
    await callTelegramApi(
      'answerCallbackQuery',
      {
        callback_query_id: callbackId,
        text: 'Action received by JARVIS Core',
      },
      5000
    );
  } catch (err: any) {
    console.warn('[Telegram Bot] Callback answer warning:', err.message);
  }

  if (data === 'cmd_check_project') {
    await processMobileCommand('JARVIS, project check करो', 'user', chatId);
  } else if (data === 'cmd_cloud_telemetry') {
    await processMobileCommand('JARVIS, server status बताओ', 'user', chatId);
  } else if (data === 'cmd_draft_post') {
    await processMobileCommand('JARVIS, आज की LinkedIn post बनाओ', 'user', chatId);
  } else if (data === 'cmd_gen_quote') {
    await processMobileCommand('JARVIS, client lead quotation बनाओ', 'user', chatId);
  } else if (data === 'cmd_security_audit') {
    await processMobileCommand('JARVIS, security audit run करो', 'user', chatId);
  } else if (data === 'cmd_morning_report') {
    await processMobileCommand('JARVIS, morning report बताओ', 'user', chatId);
  } else if (data === 'cmd_view_leads') {
    const reply = freelanceLeadsReply(memoryState.freelanceLeads);
    if (chatId) await sendRealTelegramMessage(chatId, reply);
  } else if (data.startsWith('approve_post_') || data === 'approve_publish_post_1') {
    const postId = data.startsWith('approve_post_') ? data.replace('approve_post_', '') : 'post-1';
    const result = await executeApprovedAction(postId, 'approve_and_publish', 'HUMAN_CONFIRMATION_TELEGRAM_MOBILE');

    const approveDurabilityNote = result.persisted
      ? ''
      : '\n\n⚠️ *DURABILITY WARNING*: this outcome could not be written to durable storage and may be lost on restart.';
    const confirmText = result.success
      ? `✅ *LEVEL 4 AUTHORIZATION CONFIRMED*\n\n${result.userMessage}\n\n• *Audit Log ID*: \`${result.auditEntry.id}\`\n• *Verification Status*: ${result.auditEntry.verificationStatus}${approveDurabilityNote}`
      : `⚠️ *LEVEL 4 EXECUTION NOTICE*\n\n${result.userMessage}\n\n• *Audit Log ID*: \`${result.auditEntry.id}\`\n• *Truth State*: ${result.auditEntry.finalTruthState}${approveDurabilityNote}`;

    const botMsg = {
      id: `tg-${Date.now()}`,
      sender: 'jarvis_bot' as const,
      text: confirmText,
      timestamp: new Date().toISOString(),
      type: 'text' as const,
    };
    telegramMessages.push(botMsg);
    if (chatId) await sendRealTelegramMessage(chatId, confirmText);
  } else if (data.startsWith('reject_post_') || data === 'reject_post_1') {
    const postId = data.startsWith('reject_post_') ? data.replace('reject_post_', '') : 'post-1';
    const result = await executeApprovedAction(postId, 'reject', 'HUMAN_CONFIRMATION_TELEGRAM_MOBILE');

    const cancelText = result.success
      ? `❌ *ACTION REJECTED*\n\nUnderstood, Sir. The post remains saved as a local draft in memory with status: \`${result.post?.finalTruthState || 'REJECTED'}\`.${result.persisted ? '' : '\n\n⚠️ *DURABILITY WARNING*: the rejection could not be written to durable storage and may be lost on restart.'}`
      : `⚠️ *REJECTION NOT RECORDED*\n\n${result.userMessage}`;
    const botMsg = {
      id: `tg-${Date.now()}`,
      sender: 'jarvis_bot' as const,
      text: cancelText,
      timestamp: new Date().toISOString(),
      type: 'text' as const,
    };
    telegramMessages.push(botMsg);
    if (chatId) await sendRealTelegramMessage(chatId, cancelText);
  } else if (data.startsWith('approve_perm_')) {
    const permId = data.replace('approve_perm_', '');
    const updated = updateActionRequestStatus(permId, 'EXECUTED', { resolvedBy: 'TELEGRAM_MOBILE_ADMIN' });
    // The mobile approval must survive a restart, or a reboot resurrects the
    // request as pending and it can be approved again (a duplicate external
    // action). The registry lives outside `memoryState` and `persistMemory()`
    // can return true without writing when the file already holds identical
    // bytes, so EXECUTED is read back from disk rather than trusting the write
    // boolean. A decision that cannot be confirmed on disk is refused: the
    // request is reverted to PENDING_APPROVAL so a later successful persist
    // cannot write a phantom approval, and the reply does not claim it was
    // recorded.
    const persisted = updated
      ? persistApprovalRegistry() && actionRequestStatusOnDisk(permId, 'EXECUTED')
      : false;
    if (updated && !persisted) {
      const liveReq = getAllActionRequests().find((r) => r.id === permId);
      if (liveReq) liveReq.status = 'PENDING_APPROVAL';
      memoryState.permissionRequests = persistedActionRequests();
    }
    // This branch records the human approval only — no dispatcher runs here, so
    // no provider can confirm the external action. Never say "executed/verified".
    const confirmText = updated
      ? persisted
        ? formatUnconfirmedMobileApprovalReply(updated)
        : `⚠️ *APPROVAL NOT RECORDED*\n\nRequest \`${permId}\` could not be written to durable storage; the approval was not recorded and the request remains pending.`
      : `⚠️ *ACTION NOTICE*: Request \`${permId}\` was already processed or expired.`;

    const botMsg = {
      id: `tg-${Date.now()}`,
      sender: 'jarvis_bot' as const,
      text: confirmText,
      timestamp: new Date().toISOString(),
      type: 'text' as const,
    };
    telegramMessages.push(botMsg);
    if (chatId) await sendRealTelegramMessage(chatId, confirmText);
  } else if (data.startsWith('reject_perm_')) {
    const permId = data.replace('reject_perm_', '');
    const updated = updateActionRequestStatus(permId, 'REJECTED', { resolvedBy: 'TELEGRAM_MOBILE_ADMIN' });
    // As on the approve branch, the rejection must be confirmed on disk rather
    // than trusted from `persistApprovalRegistry()`'s boolean, or a restart
    // resurrects the rejected request as pending. A rejection that cannot be
    // confirmed is reverted so the operator is not told it was recorded.
    const persisted = updated
      ? persistApprovalRegistry() && actionRequestStatusOnDisk(permId, 'REJECTED')
      : false;
    if (updated && !persisted) {
      const liveReq = getAllActionRequests().find((r) => r.id === permId);
      if (liveReq) liveReq.status = 'PENDING_APPROVAL';
      memoryState.permissionRequests = persistedActionRequests();
    }
    // A request that was already decided is not re-rejectable. Saying "cancelled
    // safely" for a null result told the operator a re-tap had withdrawn an
    // action that had in fact already run (or been rejected earlier). A
    // rejection that could not be written to disk is likewise not reported.
    const cancelText = updated
      ? persisted
        ? `❌ *ACTION REJECTED*\n\nUnderstood, Sir. Action \`${updated.exactAction || permId}\` cancelled safely.`
        : `⚠️ *REJECTION NOT RECORDED*\n\nRequest \`${permId}\` could not be written to durable storage; the rejection was not recorded and the request remains pending.`
      : `⚠️ *ACTION NOTICE*: Request \`${permId}\` was already processed or expired; nothing was changed.`;
    const botMsg = {
      id: `tg-${Date.now()}`,
      sender: 'jarvis_bot' as const,
      text: cancelText,
      timestamp: new Date().toISOString(),
      type: 'text' as const,
    };
    telegramMessages.push(botMsg);
    if (chatId) await sendRealTelegramMessage(chatId, cancelText);
  }
}

/**
 * Robust, Self-Healing Telegram Long-Polling Loop (24/7 Daemon)
 */
async function startTelegramPolling() {
  const token = getCleanTelegramToken();
  if (!token) {
    telegramConfig.isLiveConnected = false;
    telegramConfig.isLiveTokenConfigured = false;
    telegramConfig.mode = 'simulator';
    telegramConfig.webhookStatus = 'waiting_token';
    return;
  }
  if (telegramPollingActive) return;

  try {
    console.log('[Telegram Bot] Initializing connection with api.telegram.org...');
    const botInfo = await callTelegramApi('getMe', undefined, 5000);
    telegramConfig.isLiveConnected = true;
    telegramConfig.isLiveTokenConfigured = true;
    telegramConfig.botUsername = `@${botInfo.username}`;
    telegramConfig.botUsernameReported = true;
    telegramConfig.botName = botInfo.first_name || 'Hermes JARVIS Mobile Controller';
    telegramConfig.telegramLink = `https://t.me/${botInfo.username}`;
    telegramConfig.mode = 'live_polling';
    telegramConfig.webhookStatus = 'polling';
    telegramConfig.errorMessage = undefined;
    console.log(`[Telegram Bot] Connected as ${telegramConfig.botUsername} (ID: ${botInfo.id})`);

    telegramPollingActive = true;
    let consecutiveErrors = 0;
    let reconnectDelay = 2000;

    // Background Long-Polling Loop with self-healing backoff
    (async () => {
      while (telegramPollingActive) {
        try {
          const updates = await callTelegramApi(
            'getUpdates',
            {
              offset: lastTelegramUpdateId + 1,
              timeout: 12,
              allowed_updates: ['message', 'callback_query'],
            },
            16000
          );

          consecutiveErrors = 0;
          reconnectDelay = 2000;

          if (Array.isArray(updates) && updates.length > 0) {
            for (const update of updates) {
              const updateId = update.update_id;
              lastTelegramUpdateId = updateId;

              // Deduplication guard: verify update has not been processed
              if (memoryState.processedTelegramUpdates.includes(updateId)) {
                continue;
              }
              memoryState.processedTelegramUpdates.push(updateId);

              if (update.message) {
                const msg = update.message;
                const chatId = msg.chat?.id;
                const text = msg.text || msg.caption || '';
                const senderName = msg.from?.username ? `@${msg.from.username}` : (msg.from?.first_name || 'User');

                if (chatId) {
                  activeTelegramChatId = chatId;
                  if (!telegramConfig.allowedUserIds.includes(String(chatId))) {
                    telegramConfig.allowedUserIds = [String(chatId), `@${senderName}`];
                  }
                }

                if (text) {
                  await processMobileCommand(text, senderName, chatId).catch((cmdErr) => {
                    console.warn('[Telegram Bot] Command processing note:', cmdErr.message);
                  });
                }
              } else if (update.callback_query) {
                await handleTelegramCallback(update.callback_query).catch((cbErr) => {
                  console.warn('[Telegram Bot] Callback processing note:', cbErr.message);
                });
              }
            }
            persistMemory();
          }
        } catch (pollErr: any) {
          consecutiveErrors++;
          console.warn(`[Telegram Bot] Polling notice (attempt ${consecutiveErrors}):`, pollErr.message);

          // If unauthorized token, stop permanently
          if (pollErr.errorCode === 401 || pollErr.statusCode === 401) {
            telegramPollingActive = false;
            telegramConfig.isLiveConnected = false;
            telegramConfig.mode = 'simulator';
            telegramConfig.webhookStatus = 'waiting_token';
            telegramConfig.errorMessage = 'TELEGRAM_BOT_TOKEN is unauthorized or invalid.';
            break;
          }

          // Otherwise, backoff and automatically reconnect
          await new Promise((r) => setTimeout(r, reconnectDelay));
          reconnectDelay = Math.min(reconnectDelay * 1.5, 30000);
        }
      }
    })().catch((loopErr) => {
      console.warn('[Telegram Bot] Polling loop caught:', loopErr.message);
      telegramPollingActive = false;
      telegramConfig.isLiveConnected = false;
    });
  } catch (err: any) {
    console.warn('[Telegram Bot] Initial connection notice (server continuing):', err.message);
    telegramConfig.errorMessage = err.message;
    telegramConfig.isLiveConnected = false;
    telegramConfig.mode = 'simulator';
    telegramConfig.webhookStatus = 'waiting_token';
    telegramPollingActive = false;
  }
}

// ==============================================================================
// 7. 24/7 PERSISTENT SCHEDULER ENGINE
// ==============================================================================
function getISTDateString(): string {
  // Return current date in Asia/Kolkata (YYYY-MM-DD)
  const now = new Date();
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
}

function getISTCurrentHourMinute(): { hour: number; minute: number } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(now);

  const hour = Number(parts.find((p) => p.type === 'hour')?.value || 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value || 0);
  return { hour, minute };
}

let schedulerRunLog: string[] = [];

/**
 * Record one routine tick. The per-day marker is stamped by the caller, before
 * the push is attempted, so a slow or failing push can never re-trigger the
 * tick every 30 seconds for the rest of the window. The log line, in contrast,
 * is only written once the push outcome is known — and it never claims a
 * delivery that did not happen (item 13).
 */
async function recordSchedulerOutcome(
  name: string,
  push: SchedulerPushOutcome,
): Promise<void> {
  const logEntry = schedulerRunLogLine(name, push);
  schedulerRunLog.unshift(logEntry);
  console.log('[Scheduler]', logEntry);
}

async function checkAndRunSchedulerJobs() {
  const todayIST = getISTDateString();
  const { hour, minute } = getISTCurrentHourMinute();

  // 1. Morning Briefing at 09:00 AM IST
  if (hour === 9 && minute >= 0 && minute <= 15) {
    if (memoryState.schedulerState.lastMorningRunDate !== todayIST) {
      memoryState.schedulerState.lastMorningRunDate = todayIST;

      let push: SchedulerPushOutcome = { attempted: false, delivered: false };
      if (activeTelegramChatId && getCleanTelegramToken()) {
        const pendingQuotations = memoryState.freelanceLeads.filter((l) => !!l.quotation).length;
        const pendingPosts = memoryState.socialPosts.filter((p) => p.status === 'pending_approval').length;
        const morningText = `🌅 *HERMES PROACTIVE MORNING BRIEFING (09:00 AM)*\n\nGood morning, Sir!\n\n• *Pending Quotations*: ${pendingQuotations} lead(s)\n• *Social Posts*: ${pendingPosts} draft awaiting approval\n• *Security Level*: Level ${securityMatrixState.currentLevel} Active\n\nHave a productive day!`;
        const delivery = await deliverTelegramMessage(activeTelegramChatId, morningText);
        push = { attempted: true, delivered: delivery.delivered, detail: delivery.errorReason || delivery.outcome };
      }
      await recordSchedulerOutcome('Morning Briefing (09:00 AM IST)', push);
      persistMemory();
    }
  }

  // 2. Midday Health Audit at 02:00 PM IST (14:00)
  if (hour === 14 && minute >= 0 && minute <= 15) {
    if (memoryState.schedulerState.lastMiddayRunDate !== todayIST) {
      memoryState.schedulerState.lastMiddayRunDate = todayIST;
      // No Telegram push and no audit work: this tick only advances the marker.
      await recordSchedulerOutcome('Midday Health Audit (02:00 PM IST)', { attempted: false, delivered: false });
      persistMemory();
    }
  }

  // 3. Evening Social Pulse at 06:30 PM IST (18:30)
  if (hour === 18 && minute >= 30 && minute <= 45) {
    if (memoryState.schedulerState.lastEveningRunDate !== todayIST) {
      memoryState.schedulerState.lastEveningRunDate = todayIST;
      await recordSchedulerOutcome('Evening Social Pulse (06:30 PM IST)', { attempted: false, delivered: false });
      persistMemory();
    }
  }

  // 4. Nightly Work Summary at 10:30 PM IST (22:30)
  if (hour === 22 && minute >= 30 && minute <= 45) {
    if (memoryState.schedulerState.lastNightRunDate !== todayIST) {
      memoryState.schedulerState.lastNightRunDate = todayIST;

      let push: SchedulerPushOutcome = { attempted: false, delivered: false };
      if (activeTelegramChatId && getCleanTelegramToken()) {
        const nightText = `🌙 *HERMES NIGHTLY WORK REPORT (10:30 PM)*\n\nSir, today's work summary has been recorded.\n• *Commands Executed*: ${memoryState.stats.totalCommands}\n• *Memory Persistence*: Synchronized\n• *Daemon Status*: Standby & Active`;
        const delivery = await deliverTelegramMessage(activeTelegramChatId, nightText);
        push = { attempted: true, delivered: delivery.delivered, detail: delivery.errorReason || delivery.outcome };
      }
      await recordSchedulerOutcome('Nightly Work Summary (10:30 PM IST)', push);
      persistMemory();
    }
  }

  // 5. Nightly Repository Check at 03:00 AM IST (item 24).
  // Read-only: it scans repositories and prepares a plan. It never edits, commits
  // or pushes, so it is safe to run unattended. A scan that fails is logged as
  // FAILED rather than recorded as a successful night.
  if (hour === 3 && minute >= 0 && minute <= 15) {
    const schedState = memoryState.schedulerState as unknown as {
      lastGithubNightlyRunDate?: string;
    };
    if (schedState.lastGithubNightlyRunDate !== todayIST) {
      schedState.lastGithubNightlyRunDate = todayIST;
      const logEntry = `[${new Date().toISOString()}] Started Nightly Repository Check (03:00 AM IST)`;
      schedulerRunLog.unshift(logEntry);
      console.log('[Scheduler]', logEntry);
      persistMemory();

      runNightlyCheck({ github: githubFetchOptions() })
        .then((result) => {
          recordNightlyRun(result.record);
          addAuditLog(
            `GitHub nightly check ${result.record.outcome}: ${result.record.scannedRepositories} scanned, ${result.record.reposWithFailingCi.length} with failing CI, ${result.record.plannedSteps} planned step(s)`,
            1,
            'AUTOMATED_SCHEDULE',
            result.record.outcome === 'COMPLETED' ? 'VERIFIED' : 'FAILED'
          );
          console.log('[Scheduler] Nightly repository check:', result.record.outcome);
        })
        .catch((err: any) => {
          console.warn('[Scheduler] Nightly repository check failed:', err?.message);
          addAuditLog(
            `GitHub nightly check FAILED: ${err?.message || 'unknown error'}`,
            1,
            'AUTOMATED_SCHEDULE',
            'FAILED'
          );
        });
    }
  }

  // 6. Scheduled autonomous tasks (item 43). Tasks that require approval never
  // run unattended: they are recorded as needing a human instead. A task on the
  // list is planned and run through the same verified loop as a manual goal.
  // Times are interpreted in IST, matching the rest of this tick.
  if (scheduledGoals.length > 0) {
    const schedState = memoryState.schedulerState as unknown as {
      lastAutonomousGoalRuns?: Record<string, string>;
    };
    if (!schedState.lastAutonomousGoalRuns) schedState.lastAutonomousGoalRuns = {};

    for (const goal of dueGoals(scheduledGoals as ScheduledGoal[], schedState.lastAutonomousGoalRuns, {
      minuteOfDay: hour * 60 + minute,
      date: todayIST,
    })) {
      const today = todayIST;
      schedState.lastAutonomousGoalRuns[goal.id] = today;

      if (goal.requiresApproval) {
        addAuditLog(
          `Scheduled autonomous task "${goal.name}" (${goal.id}) is due but requires human approval; it was NOT run unattended.`,
          3,
          'AUTOMATED_SCHEDULE',
          'PENDING'
        );
        scheduledGoalRuns.unshift({
          goalId: goal.id,
          ranDate: today,
          outcome: 'PERMISSION_REQUIRED',
          verified: false,
          stepsDone: 0,
          stepsTotal: Array.isArray(goal.steps) ? goal.steps.length : 0,
          at: new Date().toISOString(),
        });
        persistMemory();
        continue;
      }

      const { buildGoalSteps } = await import('./src/utils/autonomous/stepLibrary');
      const { steps, rejected } = buildGoalSteps(goal.steps as StepDescriptor[]);
      if (rejected.length > 0) {
        addAuditLog(
          `Scheduled autonomous task "${goal.name}" rejected: unsupported step kind(s) ${rejected.join(', ')}`,
          2,
          'AUTOMATED_SCHEDULE',
          'FAILED'
        );
        persistMemory();
        continue;
      }

      try {
        const runner = new AutonomousGoalRunner();
        const result = await runner.run(goal.name, steps);
        scheduledGoalRuns.unshift({
          goalId: goal.id,
          ranDate: today,
          outcome: result.outcome,
          verified: result.verified,
          stepsDone: result.steps.filter((s) => s.status === 'DONE').length,
          stepsTotal: result.steps.length,
          at: new Date().toISOString(),
        });
        addAuditLog(
          `Scheduled autonomous task "${goal.name}" finished ${result.outcome} (${result.steps.filter((s) => s.status === 'DONE').length}/${result.steps.length} steps)`,
          2,
          'AUTOMATED_SCHEDULE',
          result.outcome === 'VERIFIED' ? 'VERIFIED' : 'FAILED'
        );
      } catch (err: any) {
        scheduledGoalRuns.unshift({
          goalId: goal.id,
          ranDate: today,
          outcome: 'FAILED',
          verified: false,
          stepsDone: 0,
          stepsTotal: steps.length,
          at: new Date().toISOString(),
        });
        addAuditLog(
          `Scheduled autonomous task "${goal.name}" FAILED: ${err?.message || 'unknown error'}`,
          2,
          'AUTOMATED_SCHEDULE',
          'FAILED'
        );
      }
      if (scheduledGoalRuns.length > 100) scheduledGoalRuns.length = 100;
      persistMemory();
    }
  }
}

// Run scheduler tick every 30 seconds. The tick is async now, so a rejected
// promise would otherwise surface as an unhandled rejection and crash the
// process; log it and keep the schedule alive.
const schedulerInterval = setInterval(() => {
  checkAndRunSchedulerJobs().catch((err: unknown) => {
    console.warn('[Scheduler] Tick failed:', err instanceof Error ? err.message : err);
  });
}, 30000);
schedulerInterval.unref();

// ==============================================================================
// 8. REST APIS & TELEMETRY ENDPOINTS
// ==============================================================================

// Health Check
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'online',
    system: 'HERMES JARVIS Autonomous Core',
    daemonPid: DAEMON_PID,
    uptimeSeconds: Math.floor((Date.now() - new Date(DAEMON_BOOT_TIME).getTime()) / 1000),
    geminiEnabled: Boolean(process.env.GEMINI_API_KEY),
    telegramConfigured: Boolean(getCleanTelegramToken()),
    telegramConnected: telegramConfig.isLiveConnected,
    timestamp: new Date().toISOString(),
  });
});

// Comprehensive Daemon Status & System Telemetry Endpoint
app.get('/api/daemon/status', (req: Request, res: Response) => {
  const uptimeSeconds = Math.floor((Date.now() - new Date(DAEMON_BOOT_TIME).getTime()) / 1000);
  const memUsage = process.memoryUsage();

  res.json({
    daemon: {
      status: 'ONLINE',
      pid: DAEMON_PID,
      uptimeSeconds,
      nodeVersion: process.version,
      memoryMb: Math.round(memUsage.heapUsed / 1024 / 1024),
      platform: `${process.platform} (${process.arch})`,
      host: '0.0.0.0',
      port: PORT,
      bootTimestamp: DAEMON_BOOT_TIME,
      heartbeatTimestamp: new Date().toISOString(),
    },
    telegram: {
      configured: Boolean(getCleanTelegramToken()),
      connected: telegramConfig.isLiveConnected,
      mode: telegramConfig.mode,
      botUsername: telegramConfig.botUsername,
      adminChatIdConfigured: Boolean(getCleanAdminChatId()),
      activeChatId: activeTelegramChatId,
      totalMessagesReceived: telegramConfig.totalMessagesReceived,
      processedUpdatesCount: memoryState.processedTelegramUpdates.length,
      lastHeartbeat: telegramConfig.lastActivity,
      errorMessage: telegramConfig.errorMessage,
    },
    aiEngine: (() => {
      // The provider/model describe the engine that will answer, not a
      // hardcoded aspirational one: with no API key the offline heuristic
      // engine serves every request and no model name is reported.
      const geminiConfigured = Boolean(process.env.GEMINI_API_KEY);
      return {
        provider: aiEngineProviderLabel(geminiConfigured),
        geminiConfigured,
        model: aiEngineModelName(geminiConfigured),
        fallbackActive: !geminiConfigured,
        bilingualSupport: true,
      };
    })(),
    scheduler: {
      // The count and the per-job labels come from the routines this process
      // actually schedules. The previous block hardcoded a count of 4 and
      // labelled each `nextRun` as if the next run had been observed.
      ...(() => {
        const recurring: RoutineSpec[] = [
          { id: 'morning_9am', name: 'Morning Task Briefing', cronOrTime: '09:00 AM IST', lastRunDate: memoryState.schedulerState.lastMorningRunDate },
          { id: 'midday_2pm', name: 'Midday System & Site Audit', cronOrTime: '02:00 PM IST', lastRunDate: memoryState.schedulerState.lastMiddayRunDate },
          { id: 'evening_630pm', name: 'Evening Social Growth Pulse', cronOrTime: '06:30 PM IST', lastRunDate: memoryState.schedulerState.lastEveningRunDate },
          { id: 'night_1030pm', name: 'Nightly Work Summary & Backup', cronOrTime: '10:30 PM IST', lastRunDate: memoryState.schedulerState.lastNightRunDate },
          { id: 'nightly_repo_check', name: 'Nightly Repository Check', cronOrTime: '03:00 AM IST', lastRunDate: (memoryState.schedulerState as { lastGithubNightlyRunDate?: string }).lastGithubNightlyRunDate },
        ];
        return {
          ...daemonSchedulerTruth(recurring, scheduledGoals.length),
          lastRunLog: schedulerRunLog.slice(0, 10),
        };
      })(),
    },
    storage: {
      persistenceFile: MEMORY_FILE_PATH,
      existsOnDisk: fs.existsSync(MEMORY_FILE_PATH),
      notesCount: memoryState.notes.length,
      leadsCount: memoryState.freelanceLeads.length,
      postsCount: memoryState.socialPosts.length,
      auditLogsCount: memoryState.auditLogs.length,
      recordedAuditLogs: auditTrailCounts(memoryState.auditLogs).recorded,
      lastPersisted: lastPersistedTimestamp,
    },
    integrations: (() => {
      // Each entry states what was actually observed in this process. A
      // credential being present is not evidence that the remote service is
      // reachable, so `status` distinguishes configured from not configured and
      // flags when reachability was not probed.
      const linkedInToken = getDecryptedLinkedInAccessToken();
      const telegramToken = getCleanTelegramToken();
      const live = oracleCloudState.metricsSource === 'live_host' ? oracleCloudState.metrics : null;
      const localHost = getLocalHostIdentity();
      return {
        linkedin: {
          configured: Boolean(linkedInToken),
          authorUrnConfigured: Boolean(
            (memoryState.linkedInConnection?.connected && memoryState.linkedInConnection?.authorUrn) ||
              process.env.LINKEDIN_AUTHOR_URN
          ),
          status: linkedInToken ? 'CONFIGURED_LIVE' : 'STANDBY_MISSING_CREDENTIALS',
          reachability: 'NOT_PROBED',
        },
        telegram: {
          configured: Boolean(telegramToken),
          status: telegramConfig.isLiveConnected ? 'CONNECTED' : 'STANDBY',
          mode: telegramConfig.mode,
        },
        oracleCloud: {
          executionHost: localHost.isOracleLike ? 'Oracle Cloud ARM instance (hostname matched)' : 'unverified — hostname not matched',
          hostname: localHost.hostname,
          metricsSource: oracleCloudState.metricsSource,
          // Instance run state / public address come from the OCI control plane,
          // which this server never queries. `status` is only non-null when the
          // hostname proved this process runs on the instance (a lower bound),
          // and the address stays null until an operator supplies an observation.
          instanceStatus: oracleCloudState.status,
          instanceStatusObservedAt: oracleCloudState.statusObservedAt,
          publicIp: oracleCloudState.publicIp,
          cpuUsage: live?.cpuUsage ?? null,
          ramUsedGb: live?.ramUsedGb ?? null,
          sampledAt: oracleCloudState.metricsSampledAt,
          note: 'Values observed from the local host. Cloud control-plane status and the instance public IP are not queried by this server.',
        },
      };
    })(),
    recentAuditLogs: memoryState.auditLogs.slice(0, 15),
  });
});

// Master Blueprint APIs
app.get('/api/blueprint', (req: Request, res: Response) => {
  const completedDeliverables = blueprintPhases.reduce(
    (acc, p) => acc + p.deliverables.filter((d) => d.done).length,
    0
  );
  const totalDeliverables = blueprintPhases.reduce((acc, p) => acc + p.deliverables.length, 0);
  const completionPercentage = Math.round((completedDeliverables / totalDeliverables) * 100);

  res.json({
    phases: blueprintPhases,
    stats: {
      totalPhases: blueprintPhases.length,
      completedPhases: blueprintPhases.filter((p) => p.status === 'completed').length,
      inProgressPhases: blueprintPhases.filter((p) => p.status === 'in_progress').length,
      completionPercentage,
    },
  });
});

app.post('/api/blueprint/toggle-item', (req: Request, res: Response) => {
  const { phaseId, itemIndex } = req.body ?? {};
  const verdict = applyBlueprintToggle(blueprintPhases, phaseId, itemIndex);
  if (!verdict.applied) {
    // A malformed request used to answer `success: true` for a toggle that
    // touched nothing. Refuse it and name the reason instead.
    return res.status(400).json({ success: false, applied: false, error: verdict.message });
  }

  // The toggle is only real once it is durable: the phases list is persisted
  // with the rest of the memory state, so a restart keeps the operator's tick.
  if (!persistBlueprintPhases()) {
    // Roll the tick back rather than report a save that did not reach disk.
    applyBlueprintToggle(blueprintPhases, phaseId, itemIndex);
    return res.status(500).json({
      success: false,
      applied: false,
      persisted: false,
      error: 'Blueprint change could not be written to durable storage; it was not saved.',
    });
  }

  res.json({
    success: true,
    applied: true,
    persisted: true,
    phase: verdict.phase,
    done: verdict.done,
  });
});

app.get('/api/blueprint/report', (req: Request, res: Response) => {
  const reportMarkdown = `# 🤖 Mobile-Controlled HERMES JARVIS — Master Blueprint & Implementation Report

**Generated By**: HERMES JARVIS Autonomous Core  
**Timestamp**: ${new Date().toISOString()}  
**Target Platform**: Android Phone (Telegram + Web Panel) ➔ Oracle Cloud Always Free (ARM64) ➔ HERMES Agent ➔ Projects / Web / Social / Freelancing  
**Total Architecture Cost**: **₹0.00 declared plan (${describeBillingCost(oracleCloudState.billingEntitlement)})**

---

## 🎯 1. Final Vision & Architecture (अंतिम लक्ष्य)

\`\`\`text
📱 ANDROID MOBILE (YOU)
       │
 Telegram Bot ✅ | Web Panel HUD ✅
       │
       ▼
 ☁️ FREE CLOUD (Oracle Cloud Always Free)
    • Shape: VM.Standard.A1.Flex (ARM Ampere A1)
    • 4 OCPUs | 24 GB RAM | 200 GB Storage | Ubuntu 24.04
       │
       ▼
 🤖 HERMES AGENT DAEMON (Autonomous Orchestrator)
       │
 ┌─────┴──────────────────┬──────────────────┐
 ▼                        ▼                  ▼
🧠 AI Brain Engine    🛠️ Real-World Tools   💾 Multi-Tier Memory
(Gemini 2.5/3.7 Flash +  (Files, Git, Web,   (Preferences, Projects,
 Hardware-Optimized)     Scheduler, Shell)   Zero Credential Leaks)
 └─────┬──────────────────┴──────────────────┘
       │
       ▼
 ┌─────┴──────────────────┬──────────────────┐
 ▼                        ▼                  ▼
💻 Projects & Git      🌐 Live Web        📱 Social Media & CRM
(Bug audit, inspection) (Research & search) (Human Approval Mode)
 └─────┬──────────────────┴──────────────────┘
       │
       ▼
 📊 Proactive Reports (Morning 9 AM, Midday Audit, Evening Social, Night Summary)
       │
       ▼
 📱 YOU (Android Phone Notification & Interactive Approval)
\`\`\`

---

## 🗺️ 2. Comprehensive 10-Phase Roadmap (चरणबद्ध योजना)

${blueprintPhases.map((p) => `### 📌 ${p.code}: ${p.titleEn}
**हिन्दी**: ${p.titleHi}  
**Status**: ${p.status.toUpperCase()} | **Cost**: ${p.cost}  
**Overview**: ${p.description}  
**Key Deliverables**:
${p.deliverables.map((d) => `- [${d.done ? 'x' : ' '}] ${d.text}`).join('\n')}
**Voice / Telegram Command Sample**: \`${p.commandSample}\`
`).join('\n---\n\n')}

---

## 🔐 3. Security Blueprint (सुरक्षा ढांचा)
- **Level 1 (Read-Only)**: Files, repo inspect, system diagnostics. Safe passive operations.
- **Level 2 (Create)**: Local file generation, quotation drafting, social media post creation.
- **Level 3 (Modify)**: Controlled updates to workspace scripts and task trackers.
- **Level 4 (External Actions)**: Social publishing, client emails, remote push. **ALWAYS requires Human-in-the-loop Approval ("Post तैयार है। Publish करूँ? -> YES")**.
- **Credential Protection**: Passwords, SSH keys, and secret API tokens are strictly isolated from general LLM chat memory.
- **Strict Verification Engine**: Never claims "published" without verified provider response.

---

## 💰 4. Declared Zero-Cost Blueprint (लागत विश्लेषण)

Every figure below is the **declared plan**, not a billing observation: this
process queries no provider billing or entitlement API, so it cannot confirm that
a component is actually free.

| Component | Target Solution | Monthly Cost |
| :--- | :--- | :--- |
| **Cloud Computing** | Oracle Cloud Always Free ARM Ampere A1 (4 OCPU, 24 GB) | ${declaredCostCell('₹0')} |
| **Mobile Gateway** | Telegram Bot API (@HermesJarvisBot) | ${declaredCostCell('₹0')} |
| **Agent Framework** | Hermes Autonomous Open-Source Agent | ${declaredCostCell('₹0')} |
| **AI Brain** | Gemini 2.5/3.7 Flash + Smart Heuristic Fallback | ${declaredCostCell('₹0')} |
| **Web Panel UI** | Single-page Responsive React + Tailwind Dashboard | ${declaredCostCell('₹0')} |
| **Freelance CRM** | Integrated Quotation & Requirement Engine | ${declaredCostCell('₹0')} |
| **Scheduler** | Server-side Crontab / NodeJS Timer Engine | ${declaredCostCell('₹0')} |
| **Total** | **All Subsystems** | **${describeDeclaredCost('₹0', oracleCloudState.billingEntitlement)}** |

---
*Report generated and validated by HERMES JARVIS Core.*
`;

  res.json({
    title: 'Mobile-Controlled HERMES JARVIS — Master Plan Report',
    markdown: reportMarkdown,
    generatedAt: new Date().toISOString(),
  });
});

// Telegram Gateway Webhook Route
app.post('/api/telegram/webhook', async (req: Request, res: Response) => {
  try {
    const update = req.body;
    if (update.update_id) {
      if (memoryState.processedTelegramUpdates.includes(update.update_id)) {
        return res.json({ ok: true, duplicate: true });
      }
      memoryState.processedTelegramUpdates.push(update.update_id);
    }

    if (update.message) {
      const msg = update.message;
      const chatId = msg.chat?.id;
      const text = msg.text || msg.caption || '';
      const senderName = msg.from?.username ? `@${msg.from.username}` : (msg.from?.first_name || 'User');

      if (chatId) activeTelegramChatId = chatId;
      if (text) {
        await processMobileCommand(text, senderName, chatId);
      }
    } else if (update.callback_query) {
      await handleTelegramCallback(update.callback_query);
    }
    // The receipt is acknowledged either way, but the caller is told whether the
    // processed-update marker actually reached durable storage, so a read-only
    // volume does not look like a clean, durable receipt.
    const webhookPersisted = persistMemory();
    res.json({ ok: true, persisted: webhookPersisted });
  } catch (err: any) {
    console.error('Webhook error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Telegram Gateway APIs
app.get('/api/telegram/messages', (req: Request, res: Response) => {
  res.json({
    config: telegramConfig,
    messages: telegramMessages,
    activeChatId: activeTelegramChatId,
  });
});

app.get('/api/telegram/status', (req: Request, res: Response) => {
  res.json({
    config: telegramConfig,
    activeChatId: activeTelegramChatId,
    totalMessages: telegramMessages.length,
    lastActivity: telegramConfig.lastActivity,
  });
});

app.post('/api/telegram/test-live', async (req: Request, res: Response) => {
  try {
    const token = getCleanTelegramToken();
    if (!token) {
      return res.json({
        success: false,
        message: 'TELEGRAM_BOT_TOKEN is not defined or is invalid in environment.',
        config: telegramConfig,
      });
    }

    try {
      const botInfo = await callTelegramApi('getMe', undefined, 5000);
      const hadChatId = Boolean(activeTelegramChatId);

      const delivery = await deliverTelegramMessage(
        activeTelegramChatId,
        `🔔 *HERMES JARVIS TEST SIGNAL*\n\nTelegram delivery test from the JARVIS control matrix.\n\n• *Timestamp*: ${new Date().toLocaleTimeString()}\n• *Sent at*: ${new Date().toISOString()}\n\n_If you can read this, the bot token and chat ID are both valid._`,
      );

      return res.json({
        // The bot itself is reachable, but a delivery is only a success when
        // Telegram confirmed it.
        success: delivery.delivered,
        botReachable: true,
        bot: botInfo,
        notificationSent: delivery.delivered,
        deliveryOutcome: delivery.outcome,
        messageId: delivery.messageId,
        message: delivery.errorReason,
        activeChatId: activeTelegramChatId,
        chatIdKnown: hadChatId,
      });
    } catch (apiErr: any) {
      return res.json({
        success: false,
        message: apiErr.message || 'Failed to reach Telegram API.',
        config: telegramConfig,
      });
    }
  } catch (err: any) {
    res.status(200).json({ success: false, error: err?.message || 'Unknown error occurred' });
  }
});

app.post('/api/telegram/send', async (req: Request, res: Response) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'Text command is required' });

    const result = await processMobileCommand(text, 'web_client', activeTelegramChatId || undefined);
    const delivery = gatewaySendResult(result.delivery);
    const notice = telegramGatewayNotice(delivery);
    res.json({
      // Success means Telegram confirmed the outbound reply. A local echo with
      // no delivery is reported as undelivered, not as a sent message.
      success: delivery.delivered,
      delivered: delivery.delivered,
      deliveryOutcome: delivery.outcome,
      messageId: delivery.messageId,
      errorReason: delivery.errorReason,
      userMessage: result.userMsg,
      botMessage: { ...result.botMsg, text: telegramGatewayBubble(result.botMsg.text, delivery) },
      message: notice.message,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/telegram/broadcast', async (req: Request, res: Response) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Message is required' });

    const targetChat = activeTelegramChatId || getCleanAdminChatId();
    const interpretation = await deliverTelegramMessage(targetChat, message);

    const receipt = buildDeliveryReceipt(interpretation, String(targetChat ?? 'unconfigured'));
    return res.json({
      // Only a verified delivery is a success. Anything else is reported with
      // its true outcome so the UI cannot claim the briefing went out.
      // `executed` tracks the same proof: the send was attempted but the
      // message did not reach the target, so executing is not delivering.
      success: interpretation.delivered,
      outcome: interpretation.outcome,
      executed: interpretation.delivered,
      verified: receipt.verified,
      liveSent: interpretation.delivered,
      messageId: interpretation.messageId,
      targetChat,
      errorReason: interpretation.errorReason,
      message: receipt.detailEn,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

// Oracle Cloud VM Telemetry APIs
// Metrics are sampled from the real daemon host on every request. When a value
// cannot be measured it stays null and is reported as unavailable — never
// replaced with a plausible-looking constant.
app.get('/api/oracle-cloud', (req: Request, res: Response) => {
  refreshOracleMetrics();
  res.json(oracleCloudState);
});

// Freelance Pipeline APIs
app.get('/api/freelance/leads', (req: Request, res: Response) => {
  res.json({ leads: memoryState.freelanceLeads });
});

app.post('/api/freelance/create-lead', (req: Request, res: Response) => {
  const { clientName, source, projectType, rawRequirement, budgetAmount } = req.body;

  // A submission that carried no real lead field used to be stored as a record
  // of "not recorded" placeholders and still reported as a created lead. Refuse
  // it instead of announcing a client that was never supplied.
  const intake = classifyNewLeadIntake({ clientName, projectType, rawRequirement, budget: budgetAmount });
  if (!intake.accepted) {
    return res.json({
      success: false,
      stored: false,
      outcome: intake.reason,
      message: intake.message,
    });
  }

  // Store only what the operator actually supplied. A missing budget stays
  // unrecorded (no ₹50,000 default) and no quotation is fabricated from it.
  const newLead = buildNewLeadRecord({
    id: `lead-${Date.now()}`,
    clientName,
    source,
    projectType,
    rawRequirement,
    budget: budgetAmount,
    createdAt: new Date().toISOString(),
  }) as ServerFreelanceLead;
  // The lead is only real once it is on disk. The route previously unshifted
  // the record, discarded persistMemory()'s return value, and answered
  // `stored: true` — so a read-only volume or full disk produced a "created
  // lead" for a write that never reached storage. Gate on the durable write and
  // roll the record back when it fails.
  const leadSnapshot = memoryState.freelanceLeads.slice();
  memoryState.freelanceLeads.unshift(newLead);
  if (!persistMemory()) {
    memoryState.freelanceLeads = leadSnapshot;
    return res.status(500).json({
      success: false,
      stored: false,
      persisted: false,
      outcome: 'NOT_PERSISTED',
      message: 'The lead could not be written to durable storage; it was not saved.',
    });
  }
  res.json({ success: true, stored: true, persisted: true, clientIdentified: intake.hasClientIdentity, lead: newLead, message: intake.message });
});

app.post('/api/freelance/update-status', (req: Request, res: Response) => {
  const { leadId, status } = req.body;
  const lead = memoryState.freelanceLeads.find((l) => l.id === leadId);
  if (!lead) {
    return res.status(404).json({ success: false, outcome: 'LEAD_NOT_FOUND', error: 'Lead not found' });
  }
  // The route used to write any string the caller supplied and report every
  // request as a saved change. Only a recognised status that differs from the
  // stored one is applied and reported as applied.
  const verdict = classifyLeadStatusUpdate(status, lead.status);
  if (!verdict.success) {
    return res.json({
      success: false,
      outcome: verdict.outcome,
      applied: false,
      message: verdict.message,
      lead,
    });
  }
  const previousStatus = lead.status;
  lead.status = verdict.status as string;
  // The status change is only real once it is on disk. The route previously
  // discarded persistMemory()'s return value and reported `applied: true` for a
  // write that could fail, so the pipeline showed a stage the store never kept.
  if (!persistMemory()) {
    lead.status = previousStatus;
    return res.status(500).json({
      success: false,
      outcome: 'NOT_PERSISTED',
      applied: false,
      persisted: false,
      message: 'The status change could not be written to durable storage; it was not applied.',
      lead,
    });
  }
  res.json({ success: true, outcome: verdict.outcome, applied: true, persisted: true, message: verdict.message, lead });
});

// Social Media Engine APIs
app.get('/api/social/posts', (req: Request, res: Response) => {
  res.json({ posts: memoryState.socialPosts });
});

app.post('/api/social/generate', async (req: Request, res: Response) => {
  const { topic, platform = 'LinkedIn' } = req.body;
  let generatedContent = '';
  let hashtags = ['#AI', '#Tech', '#Automation', '#Freelance', '#DevOps'];

  const ai = getGenAI();
  if (ai && topic) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `Write an engaging, high-performing ${platform} post about: "${topic}".
Include a strong hook, 3 key actionable takeaways, and 5 hashtags. Keep it professional yet conversational.`,
              },
            ],
          },
        ],
      });
      generatedContent = response.text?.trim() || '';
    } catch (e) {
      console.warn('Social post gen fallback:', e);
    }
  }

  // Resolve the draft content and its true origin. An empty model output is a
  // fixed local template, disclosed as such rather than presented as AI copy.
  const generation = resolveSocialGeneration({ generatedContent, topic });

  const newPost: ServerSocialPost = {
    id: `post-${Date.now()}`,
    platform: platform as any,
    topic: topic || 'Autonomous AI Architecture',
    content: generation.content,
    generationSource: generation.source,
    aiGenerated: generation.aiGenerated,
    generationNotice: generation.notice,
    hashtags,
    creativePrompt: `Modern aesthetic graphic visualizing ${topic}, sleek cyber-tech gradient.`,
    status: 'pending_approval',
    scheduledTime: 'Today at 07:00 PM IST',
    likesSimulated: 0,
    executionStatus: 'PENDING_APPROVAL',
    verificationStatus: 'STANDBY',
    finalTruthState: 'DRAFT',
  };

  memoryState.socialPosts.unshift(newPost);

  // Level 2 audit log — this route only staged a local draft, so the entry
  // must not claim execution or verification.
  const stagingAudit = stagedDraftAuditEntry({
    platform: String(platform),
    topic: newPost.topic,
    level: 2,
    gate: 'Level-2 draft review',
  });

  // Append the staging audit row before the durable write, then verify the row
  // itself reached disk. The row used to be pushed *after* `persistMemory()`,
  // so it was never written to the memory file and a restart dropped it — yet
  // the route still answered `persisted: true`. Persisting first, then checking
  // the file, proves the row is durable instead of trusting the write boolean.
  const auditRow = pushAuditEntry({
    id: `log-${Date.now()}`,
    timestamp: new Date().toISOString(),
    action: stagingAudit.action,
    levelRequired: 2,
    approvedBy: 'AUTO_RULE',
    status: stagingAudit.status,
    verificationStatus: stagingAudit.verificationStatus,
    finalTruthState: stagingAudit.finalTruthState,
  });

  // A draft is only real once it — and its audit row — are durable. A write that
  // never reaches disk (read-only volume, full disk) leaves this process holding
  // a draft the next boot does not have, so do not answer success for it.
  if (!persistMemory() || !diskHasAuditRow(auditRow.id)) {
    const draftIndex = memoryState.socialPosts.indexOf(newPost);
    if (draftIndex !== -1) memoryState.socialPosts.splice(draftIndex, 1);
    const auditIndex = memoryState.auditLogs.indexOf(auditRow);
    if (auditIndex !== -1) memoryState.auditLogs.splice(auditIndex, 1);
    return res.status(500).json({
      success: false,
      persisted: false,
      error: 'The draft could not be written to durable storage; it was not created.',
    });
  }

  res.json({ success: true, persisted: true, post: newPost });
});

// Level 4 Social Action Endpoint with Strict Verification
app.post('/api/social/action', async (req: Request, res: Response) => {
  const { postId, action } = req.body;
  if (!postId) return res.status(400).json({ error: 'postId is required' });

  const result = await executeApprovedAction(
    postId,
    action === 'approve_and_publish' ? 'approve_and_publish' : 'reject',
    'HUMAN_CONFIRMATION_WEB_PANEL'
  );

  res.json({
    success: result.success,
    post: result.post,
    auditEntry: result.auditEntry,
    persisted: result.persisted,
    message: result.userMessage,
  });
});

// Dedicated Endpoint to Stage a Level-4 YouTube Video Upload (File or Test Video)
app.post('/api/social/youtube/upload-draft', (req: Request, res: Response) => {
  const {
    title,
    description,
    privacyStatus = 'private',
    tags,
    videoFileName,
    videoPayloadBase64,
    isTestUpload = false,
  } = req.body;

  const validTitle = (title || 'JARVIS Autonomous System Overview').trim().slice(0, 100);
  const validPrivacy = (privacyStatus === 'unlisted' || privacyStatus === 'public') ? privacyStatus : 'private';
  const tagList = Array.isArray(tags) && tags.length > 0
    ? tags
    : ['#JARVIS', '#AutonomousAI', '#GoogleCloud', '#YouTubeDataAPI'];

  const defaultDesc = description || `Automated video broadcast from HERMES JARVIS Autonomous Core.\n\n• Video Title: ${validTitle}\n• Privacy Mode: ${validPrivacy.toUpperCase()}\n• Upload Engine: YouTube Data API v3 (videos.insert)\n• Security Layer: Level-4 Human Authorization Gateway`;

  const newPost: ServerSocialPost = {
    id: `post-yt-${Date.now()}`,
    platform: 'YouTube',
    topic: validTitle,
    videoTitle: validTitle,
    content: defaultDesc,
    videoDescription: defaultDesc,
    hashtags: tagList,
    creativePrompt: 'High-tech JARVIS HUD telemetry showing secure cloud authorization and automated upload.',
    status: 'pending_approval',
    privacyStatus: validPrivacy,
    // Stage the channel actually recorded in memory; if none was read, leave it
    // unset so the UI says so instead of displaying an invented channel name.
    targetChannel: recordedChannelTitle(memoryState.youTubeConnection?.channelTitle) ?? undefined,
    isTestUpload: !videoPayloadBase64 || Boolean(isTestUpload),
    videoFileName: videoFileName || (videoPayloadBase64 ? 'uploaded_video.mp4' : 'synthetic_test.mp4'),
    videoPayloadBase64: videoPayloadBase64 || undefined,
    scheduledTime: 'Instant upon Level 4 Authorization',
    likesSimulated: 0,
    executionStatus: 'PENDING_APPROVAL',
    verificationStatus: 'STANDBY',
    finalTruthState: 'DRAFT',
  };

  memoryState.socialPosts.unshift(newPost);

  // Register Level 4 Action in Permission Gateway. The gate can reject the
  // action (finance guard) or refuse it (emergency stop); the reply must reflect
  // that instead of reporting a staged upload that was never queued.
  const uploadGate = createPendingActionRequest({
    exactAction: `YouTube Video Upload (${validPrivacy.toUpperCase()}) - "${validTitle}"`,
    target: `YouTube Channel: ${describeStagedChannel(memoryState.youTubeConnection?.channelTitle)}`,
    contentChanges: `Title: "${validTitle}" | Privacy: ${validPrivacy.toUpperCase()} | Tags: ${tagList.join(', ')} | File: ${newPost.videoFileName}`,
    level: 4,
    source: 'social_hub_youtube_upload',
    platform: 'YouTube',
    actionPayload: { postId: newPost.id, privacyStatus: validPrivacy, videoFileName: newPost.videoFileName },
  });
  const uploadVerdict = classifyStagedDraft(uploadGate, 'YouTube upload');

  // Nothing was published, so the audit row must not read as an executed or
  // verified upload. A rejected/blocked staging is recorded as a refusal.
  const stagingAudit = stagedDraftAuditEntry({
    platform: 'YouTube',
    topic: `${validTitle} (${validPrivacy.toUpperCase()})`,
    level: 4,
    gate: uploadVerdict.success ? 'Level-4 authorization' : uploadVerdict.message,
  });
  const uploadAuditRow = pushAuditEntry({
    id: `log-${Date.now()}`,
    timestamp: new Date().toISOString(),
    action: stagingAudit.action,
    levelRequired: 2,
    approvedBy: 'AUTO_RULE',
    status: stagingAudit.status,
    verificationStatus: stagingAudit.verificationStatus,
    finalTruthState: stagingAudit.finalTruthState,
  });
  // Persist the registry alongside the post/audit rows so the staged Level-4
  // request survives a restart too, not just the draft it refers to.
  const uploadPersisted = persistApprovalRegistry();

  if (!uploadVerdict.success) {
    const code = uploadVerdict.outcome === 'BLOCKED_FINANCE' ? 403 : uploadVerdict.outcome === 'BLOCKED_EMERGENCY' ? 423 : 409;
    return res.status(code).json({
      success: false,
      staged: false,
      outcome: uploadVerdict.outcome,
      message: uploadVerdict.message,
      post: newPost,
    });
  }

  // A staged upload is only real once it is durable. A write that never reached
  // disk (read-only volume, full disk) leaves this process holding a staged
  // upload the next boot does not have, so roll it back and do not claim it.
  if (!uploadPersisted) {
    const postIndex = memoryState.socialPosts.indexOf(newPost);
    if (postIndex !== -1) memoryState.socialPosts.splice(postIndex, 1);
    const auditIndex = memoryState.auditLogs.indexOf(uploadAuditRow);
    if (auditIndex !== -1) memoryState.auditLogs.splice(auditIndex, 1);
    return res.status(500).json({
      success: false,
      staged: false,
      persisted: false,
      error: 'The staged upload could not be written to durable storage; it was not staged.',
    });
  }

  res.json({
    success: true,
    persisted: true,
    post: newPost,
    message: `YouTube video staged for Level-4 Authorization in ${validPrivacy.toUpperCase()} mode.`,
  });
});

// Dedicated Endpoint to Draft a Level-4 YouTube Test Video Upload
app.post('/api/social/youtube/draft-test', (req: Request, res: Response) => {
  const {
    title = 'JARVIS Autonomous System Overview (Test Upload)',
    description,
    privacyStatus = 'private', // Strict default: private
    tags = ['#JARVIS', '#AutonomousAI', '#GoogleCloud', '#YouTubeDataAPI', '#TestMode'],
  } = req.body;

  const validPrivacy = (privacyStatus === 'unlisted' || privacyStatus === 'public') ? privacyStatus : 'private';
  const defaultDesc = description || `Automated end-to-end test upload from HERMES JARVIS Autonomous Core.\n\n• Video Title: ${title}\n• Privacy Mode: ${validPrivacy.toUpperCase()} (Safe Testing)\n• Upload Engine: YouTube Data API v3 (videos.insert)\n• Security Layer: Level-4 Human Authorization Gateway`;

  const newPost: ServerSocialPost = {
    id: `post-yt-${Date.now()}`,
    platform: 'YouTube',
    topic: title,
    videoTitle: title,
    content: defaultDesc,
    videoDescription: defaultDesc,
    hashtags: tags,
    creativePrompt: 'High-tech JARVIS HUD telemetry showing secure cloud authorization and automated upload.',
    status: 'pending_approval',
    privacyStatus: validPrivacy,
    // Stage the channel actually recorded in memory; if none was read, leave it
    // unset so the UI says so instead of displaying an invented channel name.
    targetChannel: recordedChannelTitle(memoryState.youTubeConnection?.channelTitle) ?? undefined,
    isTestUpload: true,
    scheduledTime: 'Instant upon Level 4 Authorization',
    likesSimulated: 0,
    executionStatus: 'PENDING_APPROVAL',
    verificationStatus: 'STANDBY',
    finalTruthState: 'DRAFT',
  };

  memoryState.socialPosts.unshift(newPost);

  // Register Level 4 Action in Permission Gateway. A finance or emergency block
  // must not be reported as a staged test upload.
  const testGate = createPendingActionRequest({
    exactAction: `YouTube Video Upload (Test Mode: ${validPrivacy.toUpperCase()})`,
    target: `YouTube Channel: ${describeStagedChannel(memoryState.youTubeConnection?.channelTitle)}`,
    contentChanges: `Title: "${title}" | Privacy: ${validPrivacy.toUpperCase()} | Tags: ${tags.join(', ')}`,
    level: 4,
    source: 'social_hub_youtube_test',
    platform: 'YouTube',
    actionPayload: { postId: newPost.id, privacyStatus: validPrivacy },
  });
  const testVerdict = classifyStagedDraft(testGate, 'YouTube test upload');

  // Staged for Level-4 test authorization — no upload occurred, so the audit
  // row must not read as an executed/verified upload. A blocked staging is
  // recorded as a refusal.
  const stagingAudit = stagedDraftAuditEntry({
    platform: 'YouTube',
    topic: `${title} (test, ${validPrivacy.toUpperCase()})`,
    level: 4,
    gate: testVerdict.success ? 'Level-4 authorization' : testVerdict.message,
  });
  const testAuditRow = pushAuditEntry({
    id: `log-${Date.now()}`,
    timestamp: new Date().toISOString(),
    action: stagingAudit.action,
    levelRequired: 2,
    approvedBy: 'AUTO_RULE',
    status: stagingAudit.status,
    verificationStatus: stagingAudit.verificationStatus,
    finalTruthState: stagingAudit.finalTruthState,
  });
  // Persist the registry alongside the post/audit rows so the staged Level-4
  // test request survives a restart too, not just the draft it refers to.
  const testPersisted = persistApprovalRegistry();

  if (!testVerdict.success) {
    const code = testVerdict.outcome === 'BLOCKED_FINANCE' ? 403 : testVerdict.outcome === 'BLOCKED_EMERGENCY' ? 423 : 409;
    return res.status(code).json({
      success: false,
      staged: false,
      outcome: testVerdict.outcome,
      message: testVerdict.message,
      post: newPost,
    });
  }

  // A staged test draft is only real once it is durable. A write that never
  // reached disk leaves this process holding a staged draft the next boot does
  // not have, so roll it back and do not claim it.
  if (!testPersisted) {
    const postIndex = memoryState.socialPosts.indexOf(newPost);
    if (postIndex !== -1) memoryState.socialPosts.splice(postIndex, 1);
    const auditIndex = memoryState.auditLogs.indexOf(testAuditRow);
    if (auditIndex !== -1) memoryState.auditLogs.splice(auditIndex, 1);
    return res.status(500).json({
      success: false,
      staged: false,
      persisted: false,
      error: 'The staged test draft could not be written to durable storage; it was not staged.',
    });
  }

  res.json({ success: true, persisted: true, post: newPost, message: 'YouTube test video draft created with Level 4 approval gate.' });
});

// Update an existing draft (e.g. modify title, description, privacyStatus before approval)
app.post('/api/social/youtube/update-draft', (req: Request, res: Response) => {
  const { postId, title, description, privacyStatus, tags } = req.body;
  if (!postId) return res.status(400).json({ error: 'postId is required' });

  const post = memoryState.socialPosts.find((p) => p.id === postId);
  if (!post) return res.status(404).json({ success: false, error: 'Post not found' });

  // The route used to answer success for every matching post, including a
  // request that changed nothing. Only a real difference is applied and
  // reported as applied; a repeat submission reads as a no-op.
  const verdict = classifyYouTubeDraftUpdate(
    { title, description, privacyStatus, tags },
    {
      videoTitle: post.videoTitle,
      videoDescription: post.videoDescription,
      privacyStatus: post.privacyStatus,
      hashtags: post.hashtags,
    }
  );

  if (!verdict.success) {
    return res.json({
      success: false,
      outcome: verdict.outcome,
      applied: false,
      message: verdict.message,
      post,
    });
  }

  const { changes } = verdict;
  // Snapshot the fields this update may touch so a failed durable write can be
  // rolled back. Without this the process holds a metadata change the next boot
  // does not have, while the caller was told the draft was updated.
  const before = {
    videoTitle: post.videoTitle,
    topic: post.topic,
    videoDescription: post.videoDescription,
    content: post.content,
    privacyStatus: post.privacyStatus,
    hashtags: post.hashtags,
  };
  if (changes.videoTitle !== undefined) {
    post.videoTitle = changes.videoTitle;
    post.topic = changes.videoTitle;
  }
  if (changes.videoDescription !== undefined) {
    post.videoDescription = changes.videoDescription;
    post.content = changes.videoDescription;
  }
  if (changes.privacyStatus !== undefined) {
    post.privacyStatus = changes.privacyStatus;
  }
  if (changes.hashtags !== undefined) {
    post.hashtags = changes.hashtags;
  }

  // An update is only real once it is durable. Roll the draft back and refuse to
  // claim the change when the write never reached disk.
  if (!persistMemory()) {
    post.videoTitle = before.videoTitle;
    post.topic = before.topic;
    post.videoDescription = before.videoDescription;
    post.content = before.content;
    post.privacyStatus = before.privacyStatus;
    post.hashtags = before.hashtags;
    return res.status(500).json({
      success: false,
      outcome: verdict.outcome,
      applied: false,
      persisted: false,
      message: verdict.message,
      error: 'The draft update could not be written to durable storage; it was not applied.',
      post,
    });
  }

  res.json({ success: true, outcome: verdict.outcome, applied: true, persisted: true, message: verdict.message, post });
});

/**
 * Helper to determine canonical LinkedIn OAuth Redirect URI
 */
function getLinkedInRedirectUri(req?: Request, explicitUri?: string): string {
  if (explicitUri && explicitUri.trim()) {
    return explicitUri.trim();
  }
  const appBase = (process.env.APP_BASE_URL || process.env.APP_URL || '').trim();
  if (appBase) {
    return `${appBase.replace(/\/$/, '')}/api/auth/linkedin/callback`;
  }
  if (req) {
    const origin = req.headers.origin || (req.headers.host ? `${req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http'}://${req.headers.host}` : '');
    if (origin) {
      return `${origin.replace(/\/$/, '')}/api/auth/linkedin/callback`;
    }
  }
  return 'https://ais-dev-qrqmhpjchdhsgz7e2uxem6-754235044596.asia-southeast1.run.app/api/auth/linkedin/callback';
}

/**
 * Helper to determine canonical YouTube / Google OAuth Redirect URI
 */
function getYouTubeRedirectUri(req?: Request, explicitUri?: string): string {
  if (explicitUri && explicitUri.trim()) {
    return explicitUri.trim();
  }
  const appBase = (process.env.APP_BASE_URL || process.env.APP_URL || '').trim();
  if (appBase) {
    return `${appBase.replace(/\/$/, '')}/api/auth/youtube/callback`;
  }
  if (req) {
    const origin = req.headers.origin || (req.headers.host ? `${req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http'}://${req.headers.host}` : '');
    if (origin) {
      return `${origin.replace(/\/$/, '')}/api/auth/youtube/callback`;
    }
  }
  return 'https://ais-dev-qrqmhpjchdhsgz7e2uxem6-754235044596.asia-southeast1.run.app/api/auth/youtube/callback';
}

/**
 * Multi-Platform Social Integrations Status Engine
 */
function getPlatformIntegrationsStatus(req?: Request): any[] {
  // Credentials being present is not a connection. This endpoint makes no
  // provider call, so it can never certify that a credential still works.
  // A platform with credentials is reported CONFIGURED and a live connection is
  // proven only by `/api/social/platforms/test`. Labelling an unmeasured
  // credential `CONNECTED` is exactly the fabricated success this project forbids.
  const CRED_STATUS = 'CONFIGURED';
  const CRED_MESSAGE = 'Credentials present but not verified. Run "Test connection" to confirm the account.';

  const conn = memoryState.linkedInConnection;
  const isLinkedInOAuthConnected = Boolean(conn && conn.connected && conn.accessToken);
  const staticLinkedInToken = (process.env.LINKEDIN_ACCESS_TOKEN || '').trim();
  const isLinkedInConnected = isLinkedInOAuthConnected || Boolean(staticLinkedInToken);
  const linkedInClientId = (process.env.LINKEDIN_CLIENT_ID || '').trim();
  const linkedInClientSecret = (process.env.LINKEDIN_CLIENT_SECRET || '').trim();
  const linkedInRedirectUri = getLinkedInRedirectUri(req);

  const fbToken = (process.env.FACEBOOK_PAGE_ACCESS_TOKEN || '').trim();
  const fbPageId = (process.env.FACEBOOK_PAGE_ID || '').trim();
  const igToken = (process.env.INSTAGRAM_ACCESS_TOKEN || '').trim();
  const igId = (process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID || '').trim();

  const ytConn = memoryState.youTubeConnection;
  const hasYtOauthToken = Boolean(ytConn?.accessToken || ytConn?.accessTokenEncrypted || ytConn?.refreshToken || ytConn?.refreshTokenEncrypted);
  const isYouTubeOAuthConnected = Boolean(ytConn && ytConn.connected && hasYtOauthToken);
  const ytKey = (process.env.YOUTUBE_API_KEY || '').trim();
  const ytAccess = (process.env.YOUTUBE_ACCESS_TOKEN || '').trim();
  const ytRefresh = (process.env.YOUTUBE_REFRESH_TOKEN || '').trim();
  const hasValidYtCredentials = isYouTubeOAuthConnected || Boolean(ytAccess || ytRefresh);
  const ytClientId = (process.env.YOUTUBE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '').trim();
  const ytClientSecret = (process.env.YOUTUBE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || '').trim();
  const ytRedirectUri = getYouTubeRedirectUri(req);

  const twitterBearer = (process.env.TWITTER_BEARER_TOKEN || '').trim();
  const twitterAccess = (process.env.TWITTER_ACCESS_TOKEN || '').trim();

  return [
    {
      id: 'linkedin',
      name: 'LinkedIn Personal Profile (Member Posts API)',
      category: 'Professional',
      status: isLinkedInConnected ? CRED_STATUS : 'NOT_CONFIGURED',
      errorMessage: isLinkedInConnected ? CRED_MESSAGE : undefined,
      authType: isLinkedInOAuthConnected ? 'OAUTH_2_0' : staticLinkedInToken ? 'STATIC_TOKEN' : 'OAUTH_2_0',
      accountName: conn?.name || (staticLinkedInToken ? 'Configured Member (Env Token)' : undefined),
      accountIdentifier: conn?.authorUrn || process.env.LINKEDIN_AUTHOR_URN || (conn?.memberSub ? `urn:li:person:${conn.memberSub}` : undefined),
      avatarUrl: conn?.picture || undefined,
      lastVerifiedAt: conn?.connectedAt || undefined,
      oauthStatus: {
        connected: isLinkedInOAuthConnected,
        authType: isLinkedInOAuthConnected ? 'OAUTH_2_0' : staticLinkedInToken ? 'STATIC_ENV_TOKEN' : undefined,
        name: conn?.name || (staticLinkedInToken ? 'Configured Personal Member' : undefined),
        memberSub: conn?.memberSub,
        authorUrn: conn?.authorUrn || (staticLinkedInToken ? process.env.LINKEDIN_AUTHOR_URN || 'urn:li:person:self' : undefined),
        email: conn?.email,
        picture: conn?.picture,
        connectedAt: conn?.connectedAt,
        expiresAt: conn?.expiresAt,
        // A scope list the server never recorded is reported as empty, not as
        // the scopes the app intended to request — those are a request, not a grant.
        scopes: conn?.scopes ?? [],
        hasClientId: Boolean(linkedInClientId),
        hasClientSecret: Boolean(linkedInClientSecret),
        redirectUri: linkedInRedirectUri,
      },
      developerPortalUrl: 'https://developer.linkedin.com',
      setupInstructions: [
        '1. Go to LinkedIn Developer Portal (developer.linkedin.com/apps) and create or select your App.',
        '2. In the "Products" tab, request: "Share on LinkedIn" (w_member_social) and "Sign In with LinkedIn using OpenID Connect" (openid, profile, email).',
        '3. In the "Auth" tab, under "OAuth 2.0 settings", add Authorized Redirect URL:',
        `   ${linkedInRedirectUri}`,
        '4. Add LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET in AI Studio Settings (⚙️).',
        '5. Click the "Connect LinkedIn" button to authorize your Personal Profile in 1-Click!',
      ],
      requiredEnvVars: [
        { key: 'LINKEDIN_CLIENT_ID', label: 'OAuth 2.0 Client ID (Primary)', configured: Boolean(linkedInClientId), isSecret: false, placeholder: '77...' },
        { key: 'LINKEDIN_CLIENT_SECRET', label: 'OAuth 2.0 Client Secret (Primary)', configured: Boolean(linkedInClientSecret), isSecret: true, placeholder: 'WPL_AP1...' },
        { key: 'LINKEDIN_ACCESS_TOKEN', label: 'Static Access Token (Fallback)', configured: Boolean(staticLinkedInToken), isSecret: true, placeholder: 'AQV...' },
      ],
      capabilities: ['Personal Member Profile Posts', 'OpenID Authentication', '1-Click OAuth Connect', 'REST Posts API (2025/v2)', 'Live Member Verification'],
    },
    {
      id: 'facebook',
      name: 'Facebook Page Graph API',
      category: 'Social',
      status: (fbToken && fbPageId) ? CRED_STATUS : 'NOT_CONFIGURED',
      errorMessage: (fbToken && fbPageId) ? CRED_MESSAGE : undefined,
      accountName: fbPageId ? `Page ID: ${fbPageId}` : undefined,
      accountIdentifier: fbPageId || undefined,
      developerPortalUrl: 'https://developers.facebook.com',
      setupInstructions: [
        '1. Open Meta for Developers (developers.facebook.com) and create a Business App.',
        '2. Add "Graph API" and generate a Page Access Token with `pages_manage_posts` and `pages_read_engagement`.',
        '3. Obtain your Facebook Page ID from Page settings or Graph API Explorer.',
        '4. Set FACEBOOK_PAGE_ACCESS_TOKEN and FACEBOOK_PAGE_ID in environment variables.',
      ],
      requiredEnvVars: [
        { key: 'FACEBOOK_PAGE_ACCESS_TOKEN', label: 'Page Access Token', configured: Boolean(fbToken), isSecret: true, placeholder: 'EAAB...' },
        { key: 'FACEBOOK_PAGE_ID', label: 'Page ID', configured: Boolean(fbPageId), isSecret: false, placeholder: '109823471982' },
      ],
      capabilities: ['Page Feed Publishing', 'Media Attachments', 'Automated Post Queue', 'Engagement Tracking'],
    },
    {
      id: 'instagram',
      name: 'Instagram Professional / Business API',
      category: 'Visual',
      status: (igToken && igId) ? CRED_STATUS : 'NOT_CONFIGURED',
      errorMessage: (igToken && igId) ? CRED_MESSAGE : undefined,
      accountName: igId ? `IG ID: ${igId}` : undefined,
      accountIdentifier: igId || undefined,
      developerPortalUrl: 'https://developers.facebook.com/docs/instagram-api',
      setupInstructions: [
        '1. Switch your Instagram account to Professional/Business and link it to your Facebook Page.',
        '2. In Meta for Developers App, request `instagram_basic` and `instagram_content_publish` permissions.',
        '3. Query `GET /me/accounts?fields=instagram_business_account` to find your Instagram Business Account ID.',
        '4. Set INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_BUSINESS_ACCOUNT_ID in environment variables.',
      ],
      requiredEnvVars: [
        { key: 'INSTAGRAM_ACCESS_TOKEN', label: 'User / Page Access Token', configured: Boolean(igToken), isSecret: true, placeholder: 'EAAB...' },
        { key: 'INSTAGRAM_BUSINESS_ACCOUNT_ID', label: 'IG Business Account ID', configured: Boolean(igId), isSecret: false, placeholder: '17841400...' },
      ],
      capabilities: ['Carousel & Single Publishing', 'Caption & Hashtags', 'Two-Step Container Pipeline'],
    },
    {
      id: 'youtube',
      name: 'YouTube Data API v3 (Google Cloud OAuth 2.0)',
      category: 'Video',
      status: hasValidYtCredentials ? CRED_STATUS : (ytClientId || ytKey) ? 'AUTH_REQUIRED' : 'NOT_CONFIGURED',
      errorMessage: hasValidYtCredentials ? CRED_MESSAGE : undefined,
      authType: isYouTubeOAuthConnected ? 'OAUTH_2_0' : (ytAccess || ytRefresh) ? 'STATIC_TOKEN' : ytKey ? 'API_KEY' : 'OAUTH_2_0',
      accountName: ytConn?.channelTitle || (ytAccess || ytRefresh ? 'Configured Channel (Env Token)' : ytKey ? 'Google API Key (Metadata Only)' : undefined),
      accountIdentifier: ytConn?.channelId || process.env.YOUTUBE_CHANNEL_ID || undefined,
      avatarUrl: ytConn?.avatarUrl || undefined,
      lastVerifiedAt: ytConn?.connectedAt || undefined,
      youTubeOAuthStatus: {
        connected: isYouTubeOAuthConnected,
        status: isYouTubeOAuthConnected ? 'API_VERIFIED' : 'CONFIGURED',
        authType: isYouTubeOAuthConnected ? 'OAUTH_2_0' : (ytAccess || ytRefresh) ? 'STATIC_ENV_TOKEN' : ytKey ? 'API_KEY' : undefined,
        channelTitle: ytConn?.channelTitle || (ytAccess || ytRefresh ? 'Configured Channel' : ytKey ? 'Google API Key (Metadata Only)' : undefined),
        channelId: ytConn?.channelId || process.env.YOUTUBE_CHANNEL_ID || undefined,
        customUrl: ytConn?.customUrl || undefined,
        avatarUrl: ytConn?.avatarUrl || undefined,
        connectedAt: ytConn?.connectedAt || undefined,
        expiresAt: ytConn?.expiresAt || undefined,
        // See LinkedIn: an unrecorded grant is unknown, so report no scopes.
        scopes: ytConn?.scopes ?? [],
        hasClientId: Boolean(ytClientId),
        hasClientSecret: Boolean(ytClientSecret),
        hasApiKey: Boolean(ytKey),
        canPublish: false,
        message: 'Credentials present but not verified. Run "Test connection" to confirm the channel before publishing.',
        redirectUri: ytRedirectUri,
      },
      developerPortalUrl: 'https://console.cloud.google.com/apis/credentials',
      setupInstructions: [
        '1. Go to Google Cloud Console (console.cloud.google.com) and enable "YouTube Data API v3".',
        '2. Configure OAuth Consent Screen and create an OAuth 2.0 Client ID (Web Application).',
        '3. Under Authorized Redirect URIs, add: ' + ytRedirectUri,
        '4. In OAuth Consent Screen ➔ Test Users, add your Google account email (avoids 403 access_denied in Testing mode).',
        '5. Add YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET in AI Studio Settings (⚙️).',
        '6. Click "Connect YouTube" to authorize your Channel in 1-Click with Level-4 security!',
      ],
      requiredEnvVars: [
        { key: 'YOUTUBE_CLIENT_ID', label: 'OAuth 2.0 Client ID (Primary)', configured: Boolean(ytClientId), isSecret: false, placeholder: '123456...apps.googleusercontent.com' },
        { key: 'YOUTUBE_CLIENT_SECRET', label: 'OAuth 2.0 Client Secret (Primary)', configured: Boolean(ytClientSecret), isSecret: true, placeholder: 'GOCSPX-...' },
        { key: 'YOUTUBE_API_KEY', label: 'Google API Key (Read-only Fallback)', configured: Boolean(ytKey), isSecret: true, placeholder: 'AIzaSy...' },
        { key: 'YOUTUBE_ACCESS_TOKEN', label: 'Static Access Token (Fallback)', configured: Boolean(ytAccess), isSecret: true, placeholder: 'ya29...' },
        { key: 'YOUTUBE_REFRESH_TOKEN', label: 'OAuth Refresh Token (Offline)', configured: Boolean(ytRefresh), isSecret: true, placeholder: '1//0...' },
        { key: 'YOUTUBE_CHANNEL_ID', label: 'YouTube Channel ID', configured: Boolean(process.env.YOUTUBE_CHANNEL_ID), isSecret: false, placeholder: 'UC_...' },
      ],
      capabilities: ['1-Click Google OAuth 2.0 Connect', 'YouTube Data API v3', 'Automated Token Refresh', 'Channel Telemetry & Community Posts', 'Video Metadata Dispatch'],
    },
    {
      id: 'twitter',
      name: 'X / Twitter API v2 (Pay-per-use Tier)',
      category: 'Microblog',
      status: (twitterBearer || twitterAccess) ? CRED_STATUS : 'NOT_CONFIGURED',
      errorMessage: (twitterBearer || twitterAccess) ? CRED_MESSAGE : undefined,
      accountName: (twitterBearer || twitterAccess) ? 'Configured Dev Tier' : undefined,
      developerPortalUrl: 'https://developer.x.com',
      setupInstructions: [
        '1. Register on Twitter Developer Portal (developer.x.com) with Basic ($100/mo) or Pro Tier.',
        '2. Create a Project and App with OAuth 1.0a / OAuth 2.0 User Context enabled.',
        '3. Generate Bearer Token, API Key/Secret, and User Access Token/Secret with `tweet.read` and `tweet.write`.',
        '4. Set TWITTER_BEARER_TOKEN or TWITTER_ACCESS_TOKEN in environment variables.',
      ],
      requiredEnvVars: [
        { key: 'TWITTER_BEARER_TOKEN', label: 'App Bearer Token', configured: Boolean(twitterBearer), isSecret: true, placeholder: 'AAAAAAAAAAAAAAAA...' },
        { key: 'TWITTER_ACCESS_TOKEN', label: 'User Access Token', configured: Boolean(twitterAccess), isSecret: true, placeholder: '12345678-...' },
      ],
      capabilities: ['Architecture Ready', 'v2 Tweet Creation', 'Idempotent Broadcast', 'Pay-per-use Gate'],
    },
  ];
}

// ------------------------------------------------------------------------------
// LINKEDIN 3-LEGGED OAUTH 2.0 ROUTES (Personal Member Profile Targeting)
// ------------------------------------------------------------------------------

/**
 * 1. Generate LinkedIn OAuth Authorization URL
 */
app.get('/api/auth/linkedin/url', (req: Request, res: Response) => {
  const clientId = (process.env.LINKEDIN_CLIENT_ID || '').trim();
  const clientSecret = (process.env.LINKEDIN_CLIENT_SECRET || '').trim();
  const reqRedirectUri = req.query.redirect_uri as string;
  const redirectUri = getLinkedInRedirectUri(req, reqRedirectUri);

  if (!clientId) {
    return res.json({
      success: false,
      configured: false,
      hasClientId: false,
      hasClientSecret: Boolean(clientSecret),
      redirectUri,
      message: 'LINKEDIN_CLIENT_ID is not configured in environment variables. Please add LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET in AI Studio Settings (⚙️).',
    });
  }

  const state = 'hermes_li_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
  const scope = 'w_member_social openid profile email';
  const authUrl = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}&scope=${encodeURIComponent(scope)}`;

  res.json({
    success: true,
    configured: true,
    hasClientId: true,
    hasClientSecret: Boolean(clientSecret),
    url: authUrl,
    redirectUri,
    state,
  });
});

/**
 * 2. LinkedIn OAuth 2.0 Authorization Callback Handler
 */
app.get(['/api/auth/linkedin/callback', '/api/auth/linkedin/callback/'], async (req: Request, res: Response) => {
  const { code, state, error, error_description } = req.query;
  const clientId = (process.env.LINKEDIN_CLIENT_ID || '').trim();
  const clientSecret = (process.env.LINKEDIN_CLIENT_SECRET || '').trim();
  const redirectUri = getLinkedInRedirectUri(req);

  if (error || !code) {
    const errMsg = (error_description as string) || (error as string) || 'LinkedIn Authorization was cancelled or denied.';
    res.send(`<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>LinkedIn Auth Cancelled</title></head>
<body style="font-family: system-ui, -apple-system, sans-serif; background: #020617; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; padding: 20px; box-sizing: border-box;">
  <div style="max-width: 440px; text-align: center; padding: 28px; border: 1px solid #7f1d1d; border-radius: 16px; background: #450a0a;">
    <h3 style="color: #fca5a5; margin: 0 0 10px 0; font-size: 18px;">⚠️ LinkedIn Connection Cancelled</h3>
    <p style="color: #fecaca; font-size: 13px; line-height: 1.5; margin-bottom: 20px;">${errMsg}</p>
    <button onclick="window.close()" style="background: #991b1b; color: white; border: none; padding: 10px 20px; border-radius: 8px; font-weight: 600; cursor: pointer;">Close Window</button>
  </div>
  <script>
    if (window.opener) {
      window.opener.postMessage({ type: 'LINKEDIN_OAUTH_ERROR', error: ${JSON.stringify(errMsg)} }, '*');
    }
  </script>
</body>
</html>`);
    return;
  }

  if (!clientId || !clientSecret) {
    res.send(`<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Missing OAuth Credentials</title></head>
<body style="font-family: system-ui, -apple-system, sans-serif; background: #020617; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; padding: 20px; box-sizing: border-box;">
  <div style="max-width: 460px; text-align: center; padding: 28px; border: 1px solid #854d0e; border-radius: 16px; background: #422006;">
    <h3 style="color: #fde047; margin: 0 0 10px 0; font-size: 18px;">⚠️ Missing LinkedIn Client Secret</h3>
    <p style="color: #fef08a; font-size: 13px; line-height: 1.5; margin-bottom: 20px;">LINKEDIN_CLIENT_SECRET is required to complete the OAuth exchange. Please configure it in AI Studio Settings.</p>
    <button onclick="window.close()" style="background: #a16207; color: white; border: none; padding: 10px 20px; border-radius: 8px; font-weight: 600; cursor: pointer;">Close Window</button>
  </div>
  <script>
    if (window.opener) {
      window.opener.postMessage({ type: 'LINKEDIN_OAUTH_ERROR', error: 'Missing LINKEDIN_CLIENT_SECRET' }, '*');
    }
  </script>
</body>
</html>`);
    return;
  }

  try {
    // Exchange authorization code for OAuth access token
    const tokenParams = new URLSearchParams({
      grant_type: 'authorization_code',
      code: code as string,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    });

    const tokenRes = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: tokenParams.toString(),
    });

    const tokenData: any = await tokenRes.json().catch(() => null);

    if (!tokenRes.ok || !tokenData?.access_token) {
      const errDetail = tokenData?.error_description || tokenData?.error || `HTTP ${tokenRes.status}`;
      res.send(`<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>OAuth Exchange Failed</title></head>
<body style="font-family: system-ui, -apple-system, sans-serif; background: #020617; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; padding: 20px; box-sizing: border-box;">
  <div style="max-width: 480px; text-align: center; padding: 28px; border: 1px solid #7f1d1d; border-radius: 16px; background: #450a0a;">
    <h3 style="color: #fca5a5; margin: 0 0 10px 0; font-size: 18px;">❌ Token Exchange Failed</h3>
    <p style="color: #fecaca; font-size: 13px; line-height: 1.5; margin-bottom: 20px;">LinkedIn rejected authorization code: ${errDetail}. Verify your Client ID, Secret, and Redirect URI.</p>
    <button onclick="window.close()" style="background: #991b1b; color: white; border: none; padding: 10px 20px; border-radius: 8px; font-weight: 600; cursor: pointer;">Close Window</button>
  </div>
  <script>
    if (window.opener) {
      window.opener.postMessage({ type: 'LINKEDIN_OAUTH_ERROR', error: ${JSON.stringify(errDetail)} }, '*');
    }
  </script>
</body>
</html>`);
      return;
    }

    const accessToken = tokenData.access_token;
    const expiresIn = tokenData.expires_in || 5184000;
    // A token response without a scope field means the grant is unmeasured; an
    // empty list is the honest record, not the scopes the app asked for.
    const grantedScopes = grantedScopesFromTokenResponse(tokenData) ?? [];

    // Fetch authenticated member personal profile
    const userinfoRes = await fetch('https://api.linkedin.com/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    // The authenticated name, or null when LinkedIn did not return one. Never
    // fall back to the invented 'LinkedIn Member'.
    let memberName: string | null = null;
    let memberSub = '';
    let authorUrn = 'urn:li:person:self';
    let memberEmail = '';
    let memberPicture = '';

    if (userinfoRes.ok) {
      const uData: any = await userinfoRes.json().catch(() => null);
      if (uData) {
        memberSub = uData.sub || '';
        memberName = observedAccountName(uData.name) ?? observedAccountName(`${uData.given_name || ''} ${uData.family_name || ''}`.trim());
        authorUrn = memberSub ? `urn:li:person:${memberSub}` : 'urn:li:person:self';
        memberEmail = uData.email || '';
        memberPicture = uData.picture || '';
      }
    }

    const memberDisplay = describeVerifiedAccount('linkedin', memberName, authorUrn);

    // Persist securely in server state
    memoryState.linkedInConnection = {
      connected: true,
      authType: 'OAUTH_2_0',
      memberSub,
      authorUrn,
      name: memberName ?? undefined,
      email: memberEmail,
      picture: memberPicture,
      connectedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
      scopes: grantedScopes,
      accessToken,
    };
    // A connection is real only once the credential is durable. A write that
    // never reaches disk (read-only volume, full disk) leaves this process
    // "connected" while the next boot has no account — so the route used to
    // discard persistMemory()'s return value and always render the "Connected!"
    // popup for a grant that was silently lost on restart. Gate on the durable
    // write, drop the unpersisted credential, and render the failure popup so
    // the UI is told the connection did not persist.
    if (!persistMemory()) {
      memoryState.linkedInConnection = undefined;
      const persistErr = 'The LinkedIn connection could not be written to durable storage; it was not saved.';
      res.send(`<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>LinkedIn Not Saved</title></head>
<body style="font-family: system-ui, -apple-system, sans-serif; background: #020617; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; padding: 20px; box-sizing: border-box;">
  <div style="max-width: 480px; text-align: center; padding: 28px; border: 1px solid #7f1d1d; border-radius: 16px; background: #450a0a;">
    <h3 style="color: #fca5a5; margin: 0 0 10px 0; font-size: 18px;">❌ LinkedIn Not Saved</h3>
    <p style="color: #fecaca; font-size: 13px; line-height: 1.5; margin-bottom: 20px;">${persistErr}</p>
    <button onclick="window.close()" style="background: #991b1b; color: white; border: none; padding: 10px 20px; border-radius: 8px; font-weight: 600; cursor: pointer;">Close Window</button>
  </div>
  <script>
    if (window.opener) {
      window.opener.postMessage({ type: 'LINKEDIN_OAUTH_ERROR', error: ${JSON.stringify(persistErr)} }, '*');
    }
  </script>
</body>
</html>`);
      return;
    }

    // Log security audit entry
    addAuditLog(
      `LinkedIn Personal Profile Connected via OAuth 2.0 (${memberDisplay} - ${authorUrn})`,
      1,
      'HUMAN_CONFIRMATION',
      'VERIFIED'
    );

    res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>LinkedIn Connected</title>
</head>
<body style="font-family: system-ui, -apple-system, sans-serif; background: #020617; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; padding: 20px; box-sizing: border-box;">
  <div style="max-width: 440px; width: 100%; text-align: center; padding: 32px 24px; border: 1px solid #166534; border-radius: 20px; background: #052e16; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);">
    <div style="width: 56px; height: 56px; margin: 0 auto 16px; border-radius: 50%; background: #15803d; display: flex; align-items: center; justify-content: center; font-size: 28px; color: #f0fdf4;">
      ✓
    </div>
    <h2 style="color: #4ade80; margin: 0 0 8px 0; font-size: 20px; font-weight: 700;">LinkedIn Connected!</h2>
    <p style="color: #bbf7d0; font-size: 14px; margin: 0 0 6px 0;">Authenticated as <strong>${memberDisplay}</strong></p>
    <p style="color: #86efac; font-size: 12px; font-family: monospace; margin: 0 0 20px 0;">${authorUrn}</p>
    <div style="padding: 10px; background: rgba(0,0,0,0.25); border-radius: 8px; color: #86efac; font-size: 12px; margin-bottom: 20px;">
      Target: Personal Member Profile (Real UGC Posts API Ready)
    </div>
    <button onclick="window.close()" style="background: #16a34a; color: white; border: none; padding: 10px 24px; border-radius: 8px; font-weight: 600; cursor: pointer;">Done</button>
  </div>
  <script>
    if (window.opener) {
      window.opener.postMessage({
        type: 'LINKEDIN_OAUTH_SUCCESS',
        member: {
          name: ${JSON.stringify(memberName)},
          authorUrn: ${JSON.stringify(authorUrn)},
          picture: ${JSON.stringify(memberPicture)},
          email: ${JSON.stringify(memberEmail)}
        }
      }, '*');
      setTimeout(() => {
        window.close();
      }, 1500);
    } else {
      setTimeout(() => {
        window.location.href = '/';
      }, 2000);
    }
  </script>
</body>
</html>`);
  } catch (ex: any) {
    res.send(`<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>OAuth Error</title></head>
<body style="font-family: system-ui, -apple-system, sans-serif; background: #020617; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; padding: 20px; box-sizing: border-box;">
  <div style="max-width: 480px; text-align: center; padding: 28px; border: 1px solid #7f1d1d; border-radius: 16px; background: #450a0a;">
    <h3 style="color: #fca5a5; margin: 0 0 10px 0; font-size: 18px;">❌ Authentication Exception</h3>
    <p style="color: #fecaca; font-size: 13px; line-height: 1.5; margin-bottom: 20px;">${ex.message}</p>
    <button onclick="window.close()" style="background: #991b1b; color: white; border: none; padding: 10px 20px; border-radius: 8px; font-weight: 600; cursor: pointer;">Close Window</button>
  </div>
  <script>
    if (window.opener) {
      window.opener.postMessage({ type: 'LINKEDIN_OAUTH_ERROR', error: ${JSON.stringify(ex.message)} }, '*');
    }
  </script>
</body>
</html>`);
  }
});

/**
 * 3. LinkedIn Connection Status Engine
 */
app.get('/api/auth/linkedin/status', (req: Request, res: Response) => {
  const clientId = (process.env.LINKEDIN_CLIENT_ID || '').trim();
  const clientSecret = (process.env.LINKEDIN_CLIENT_SECRET || '').trim();
  const staticToken = (process.env.LINKEDIN_ACCESS_TOKEN || '').trim();
  const staticUrn = (process.env.LINKEDIN_AUTHOR_URN || '').trim();
  const redirectUri = getLinkedInRedirectUri(req);

  if (memoryState.linkedInConnection && memoryState.linkedInConnection.connected) {
    const conn = memoryState.linkedInConnection;
    return res.json({
      connected: true,
      authType: conn.authType || 'OAUTH_2_0',
      name: conn.name,
      memberSub: conn.memberSub,
      authorUrn: conn.authorUrn,
      email: conn.email,
      picture: conn.picture,
      connectedAt: conn.connectedAt,
      expiresAt: conn.expiresAt,
      scopes: conn.scopes ?? [],
      hasClientId: Boolean(clientId),
      hasClientSecret: Boolean(clientSecret),
      redirectUri,
    });
  }

  // A static env token has not been probed against LinkedIn, so it is
  // configured — never a live connection. The canonical `/api/social/platforms`
  // card already labels it CONFIGURED; this endpoint answering connected: true
  // was the fabricated success this project forbids, and it contradicted the one
  // endpoint the UI trusts. Only `/api/social/platforms/test` can confirm it.
  if (staticToken) {
    return res.json({
      connected: false,
      status: 'CONFIGURED',
      configured: true,
      authType: 'STATIC_ENV_TOKEN',
      name: 'Configured Personal Member (Env Token)',
      authorUrn: staticUrn || 'urn:li:person:self',
      hasClientId: Boolean(clientId),
      hasClientSecret: Boolean(clientSecret),
      redirectUri,
      message:
        'A static LINKEDIN_ACCESS_TOKEN is present but has not been verified against LinkedIn. Run "Test connection" to confirm the account before publishing.',
    });
  }

  return res.json({
    connected: false,
    hasClientId: Boolean(clientId),
    hasClientSecret: Boolean(clientSecret),
    redirectUri,
    message: 'LinkedIn is not connected. Connect via OAuth 2.0 or configure credentials.',
  });
});

/**
 * 4. Disconnect LinkedIn OAuth Account
 */
app.post('/api/auth/linkedin/disconnect', (req: Request, res: Response) => {
  // A disconnect can only succeed if something was connected. The route used to
  // answer success:true unconditionally, so the UI announced a disconnection
  // that removed no credential.
  if (!memoryState.linkedInConnection) {
    return res.json({
      success: false,
      outcome: 'NOT_CONNECTED',
      message: 'No LinkedIn account is connected; nothing was disconnected.',
    });
  }

  // The NAME must be the one that was recorded, never the `'LinkedIn User'`
  // placeholder the route used to print when memory held no name.
  const prevMember = disconnectAccountLabel(memoryState.linkedInConnection.name);
  const connectionBefore = memoryState.linkedInConnection;
  memoryState.linkedInConnection = undefined;

  // The disconnect is only real once the credential removal is durable. A write
  // that never reaches disk leaves this process "disconnected" while the next
  // boot reloads the connection — so the route used to log a VERIFIED
  // "Disconnected" row and answer success:true for a removal that reverted on
  // restart. Restore the connection and report the failure honestly instead.
  if (!persistMemory()) {
    memoryState.linkedInConnection = connectionBefore;
    return res.status(500).json({
      success: false,
      persisted: false,
      error: 'The disconnect could not be written to durable storage; the account is still connected.',
    });
  }

  addAuditLog(
    `LinkedIn Personal Profile Disconnected (${prevMember})`,
    1,
    'HUMAN_CONFIRMATION',
    'VERIFIED'
  );

  res.json({ success: true, message: 'LinkedIn disconnected successfully.' });
});

// ------------------------------------------------------------------------------
// YOUTUBE / GOOGLE 3-LEGGED OAUTH 2.0 ROUTES
// ------------------------------------------------------------------------------

/**
 * 1. Generate YouTube OAuth Authorization URL (Offline Access for Refresh Token)
 */
app.get('/api/auth/youtube/url', (req: Request, res: Response) => {
  const clientId = (process.env.YOUTUBE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '').trim();
  const clientSecret = (process.env.YOUTUBE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || '').trim();
  const reqRedirectUri = req.query.redirect_uri as string;
  const redirectUri = getYouTubeRedirectUri(req, reqRedirectUri);

  if (!clientId) {
    return res.json({
      success: false,
      configured: false,
      hasClientId: false,
      hasClientSecret: Boolean(clientSecret),
      redirectUri,
      message: 'YOUTUBE_CLIENT_ID (or GOOGLE_CLIENT_ID) is not configured. Please add YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET in AI Studio Settings (⚙️).',
    });
  }

  const state = 'hermes_yt_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
  const scope = [
    'https://www.googleapis.com/auth/youtube.readonly',
    'https://www.googleapis.com/auth/youtube.upload',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/userinfo.email',
    'openid',
  ].join(' ');

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?response_type=code&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=consent&state=${encodeURIComponent(state)}`;

  res.json({
    success: true,
    configured: true,
    hasClientId: true,
    hasClientSecret: Boolean(clientSecret),
    url: authUrl,
    redirectUri,
    state,
  });
});

/**
 * 2. YouTube OAuth 2.0 Authorization Callback Handler
 */
app.get(['/api/auth/youtube/callback', '/api/auth/youtube/callback/'], async (req: Request, res: Response) => {
  const { code, state, error, error_description } = req.query;
  const clientId = (process.env.YOUTUBE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '').trim();
  const clientSecret = (process.env.YOUTUBE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || '').trim();
  const redirectUri = getYouTubeRedirectUri(req);

  if (error || !code) {
    const rawError = (error as string) || '';
    const rawDesc = (error_description as string) || '';
    const isAccessDenied = rawError === 'access_denied' || rawDesc.toLowerCase().includes('access_denied') || rawDesc.toLowerCase().includes('verification');
    const errMsg = rawDesc || rawError || 'YouTube / Google Authorization was cancelled or denied.';

    const helpHtml = isAccessDenied
      ? `<div style="text-align: left; background: rgba(0,0,0,0.4); padding: 16px; border-radius: 12px; margin: 16px 0; border: 1px solid #991b1b;">
          <h4 style="color: #fca5a5; margin: 0 0 8px 0; font-size: 14px; font-weight: 700;">Why did this 403 Access Denied happen?</h4>
          <p style="color: #fecaca; font-size: 12px; line-height: 1.5; margin: 0 0 10px 0;">
            Your Google Cloud Project OAuth Consent Screen is currently in <strong>"Testing"</strong> publishing status. Google blocks logins from accounts that are not on the <strong>Test Users</strong> list.
          </p>
          <div style="color: #fed7aa; font-size: 12px; line-height: 1.6;">
            <strong>Quick 1-Minute Fix in Google Cloud Console:</strong>
            <ol style="margin: 6px 0 0 18px; padding: 0;">
              <li>Go to <a href="https://console.cloud.google.com/apis/credentials/consent" target="_blank" style="color: #38bdf8; text-decoration: underline;">Google Cloud Console ➔ OAuth Consent Screen</a>.</li>
              <li>Scroll down to the <strong>Test users</strong> section.</li>
              <li>Click <strong>+ ADD USERS</strong> and enter your Google account email.</li>
              <li>Click <strong>SAVE</strong>, then retry "Connect YouTube" in JARVIS.</li>
            </ol>
          </div>
        </div>`
      : `<p style="color: #fecaca; font-size: 13px; line-height: 1.5; margin-bottom: 20px;">${errMsg}</p>`;

    return res.send(`<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>YouTube Auth: 403 / Access Denied</title></head>
<body style="font-family: system-ui, -apple-system, sans-serif; background: #020617; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box;">
  <div style="max-width: 520px; width: 100%; text-align: center; padding: 28px; border: 1px solid #7f1d1d; border-radius: 16px; background: #450a0a; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.6);">
    <div style="font-size: 32px; margin-bottom: 12px;">⚠️</div>
    <h3 style="color: #fca5a5; margin: 0 0 10px 0; font-size: 18px; font-weight: 700;">Google OAuth: ${isAccessDenied ? 'Access Denied (403 Testing Mode)' : 'Connection Cancelled'}</h3>
    ${helpHtml}
    <button onclick="window.close()" style="background: #dc2626; color: white; border: none; padding: 10px 24px; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 13px;">Close Window & Return</button>
  </div>
  <script>
    if (window.opener) {
      window.opener.postMessage({
        type: 'YOUTUBE_OAUTH_ERROR',
        error: ${JSON.stringify(errMsg)},
        isGoogleTestingModeBlocked: ${Boolean(isAccessDenied)}
      }, '*');
    }
  </script>
</body>
</html>`);
  }

  try {
    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: code as string,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
    });

    const tokenData: any = await tokenResp.json().catch(() => null);
    if (!tokenResp.ok || !tokenData?.access_token) {
      const errReason = tokenData?.error_description || tokenData?.error || `HTTP status ${tokenResp.status}`;
      return res.send(`<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>YouTube Token Exchange Failed</title></head>
<body style="font-family: system-ui, -apple-system, sans-serif; background: #020617; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; padding: 20px; box-sizing: border-box;">
  <div style="max-width: 480px; text-align: center; padding: 28px; border: 1px solid #7f1d1d; border-radius: 16px; background: #450a0a;">
    <h3 style="color: #fca5a5; margin: 0 0 10px 0; font-size: 18px;">❌ Token Exchange Failed</h3>
    <p style="color: #fecaca; font-size: 13px; line-height: 1.5; margin-bottom: 20px;">${errReason}</p>
    <button onclick="window.close()" style="background: #991b1b; color: white; border: none; padding: 10px 20px; border-radius: 8px; font-weight: 600; cursor: pointer;">Close Window</button>
  </div>
  <script>
    if (window.opener) {
      window.opener.postMessage({ type: 'YOUTUBE_OAUTH_ERROR', error: ${JSON.stringify(errReason)} }, '*');
    }
  </script>
</body>
</html>`);
    }

    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token || (memoryState.youTubeConnection?.refreshToken);
    const expiresIn = tokenData.expires_in || 3600;
    const grantedScopes = grantedScopesFromTokenResponse(tokenData) ?? [];

    // The authenticated channel title, or null when the API did not return one.
    // Never fall back to the invented 'YouTube Channel'.
    let channelId = '';
    let channelTitle: string | null = null;
    let customUrl = '';
    let avatarUrl = '';

    try {
      const ytResp = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails&mine=true', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const ytData: any = await ytResp.json().catch(() => null);
      if (ytResp.ok && ytData?.items?.length > 0) {
        const item = ytData.items[0];
        channelId = item.id || '';
        channelTitle = observedAccountName(item.snippet?.title);
        customUrl = item.snippet?.customUrl || '';
        avatarUrl = item.snippet?.thumbnails?.default?.url || item.snippet?.thumbnails?.high?.url || '';
      }
    } catch (chErr) {
      console.warn('Could not fetch YouTube channel snippet:', chErr);
    }

    // Fallback if channel snippet not returned
    if (!channelId || !channelTitle) {
      try {
        const userResp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const userData: any = await userResp.json().catch(() => null);
        if (userResp.ok && userData) {
          if (!channelTitle) channelTitle = observedAccountName(userData.name) ?? observedAccountName(userData.email);
          if (!avatarUrl) avatarUrl = userData.picture || '';
        }
      } catch (uErr) {
        console.warn('Could not fetch Google userinfo:', uErr);
      }
    }

    const channelDisplay = describeVerifiedAccount('youtube', channelTitle, channelId);

    // Persist securely in memory and encrypted disk
    memoryState.youTubeConnection = {
      connected: true,
      authType: 'OAUTH_2_0',
      channelId,
      channelTitle: channelTitle ?? undefined,
      customUrl,
      avatarUrl,
      connectedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
      scopes: grantedScopes,
      accessToken,
      refreshToken,
    };
    // A connection is real only once the credential is durable. A write that
    // never reaches disk (read-only volume, full disk) leaves this process
    // "connected" while the next boot has no channel — so the route used to
    // discard persistMemory()'s return value and always render the "Connected!"
    // popup for a grant that was silently lost on restart. Gate on the durable
    // write, drop the unpersisted credential, and render the failure popup so
    // the UI is told the connection did not persist.
    if (!persistMemory()) {
      memoryState.youTubeConnection = undefined;
      const persistErr = 'The YouTube connection could not be written to durable storage; it was not saved.';
      res.send(`<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>YouTube Not Saved</title></head>
<body style="font-family: system-ui, -apple-system, sans-serif; background: #020617; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; padding: 20px; box-sizing: border-box;">
  <div style="max-width: 480px; text-align: center; padding: 28px; border: 1px solid #7f1d1d; border-radius: 16px; background: #450a0a;">
    <h3 style="color: #fca5a5; margin: 0 0 10px 0; font-size: 18px;">❌ YouTube Not Saved</h3>
    <p style="color: #fecaca; font-size: 13px; line-height: 1.5; margin-bottom: 20px;">${persistErr}</p>
    <button onclick="window.close()" style="background: #991b1b; color: white; border: none; padding: 10px 20px; border-radius: 8px; font-weight: 600; cursor: pointer;">Close Window</button>
  </div>
  <script>
    if (window.opener) {
      window.opener.postMessage({ type: 'YOUTUBE_OAUTH_ERROR', error: ${JSON.stringify(persistErr)} }, '*');
    }
  </script>
</body>
</html>`);
      return;
    }

    addAuditLog(
      `YouTube Channel Connected via OAuth 2.0 (${channelDisplay} - ${channelId || 'Authenticated'})`,
      1,
      'HUMAN_CONFIRMATION',
      'VERIFIED'
    );

    res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>YouTube Connected</title>
</head>
<body style="font-family: system-ui, -apple-system, sans-serif; background: #020617; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; padding: 20px; box-sizing: border-box;">
  <div style="max-width: 440px; width: 100%; text-align: center; padding: 32px 24px; border: 1px solid #166534; border-radius: 20px; background: #052e16; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);">
    <div style="width: 56px; height: 56px; margin: 0 auto 16px; border-radius: 50%; background: #dc2626; display: flex; align-items: center; justify-content: center; font-size: 28px; color: #fef2f2;">
      ▶
    </div>
    <h2 style="color: #4ade80; margin: 0 0 8px 0; font-size: 20px; font-weight: 700;">YouTube Connected!</h2>
    <p style="color: #bbf7d0; font-size: 14px; margin: 0 0 6px 0;">Channel: <strong>${channelDisplay}</strong></p>
    <p style="color: #86efac; font-size: 12px; font-family: monospace; margin: 0 0 20px 0;">${channelId ? 'ID: ' + channelId : 'OAuth 2.0 Token Active'}</p>
    <div style="padding: 10px; background: rgba(0,0,0,0.25); border-radius: 8px; color: #86efac; font-size: 12px; margin-bottom: 20px;">
      Google Cloud & YouTube Data API v3 Ready
    </div>
    <button onclick="window.close()" style="background: #16a34a; color: white; border: none; padding: 10px 24px; border-radius: 8px; font-weight: 600; cursor: pointer;">Done</button>
  </div>
  <script>
    if (window.opener) {
      window.opener.postMessage({
        type: 'YOUTUBE_OAUTH_SUCCESS',
        channel: {
          channelTitle: ${JSON.stringify(channelTitle ?? channelDisplay)},
          channelId: ${JSON.stringify(channelId)},
          avatarUrl: ${JSON.stringify(avatarUrl)}
        }
      }, '*');
      setTimeout(() => {
        window.close();
      }, 1500);
    } else {
      setTimeout(() => {
        window.location.href = '/';
      }, 2000);
    }
  </script>
</body>
</html>`);
  } catch (ex: any) {
    res.send(`<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>OAuth Error</title></head>
<body style="font-family: system-ui, -apple-system, sans-serif; background: #020617; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; padding: 20px; box-sizing: border-box;">
  <div style="max-width: 480px; text-align: center; padding: 28px; border: 1px solid #7f1d1d; border-radius: 16px; background: #450a0a;">
    <h3 style="color: #fca5a5; margin: 0 0 10px 0; font-size: 18px;">❌ Authentication Exception</h3>
    <p style="color: #fecaca; font-size: 13px; line-height: 1.5; margin-bottom: 20px;">${ex.message}</p>
    <button onclick="window.close()" style="background: #991b1b; color: white; border: none; padding: 10px 20px; border-radius: 8px; font-weight: 600; cursor: pointer;">Close Window</button>
  </div>
  <script>
    if (window.opener) {
      window.opener.postMessage({ type: 'YOUTUBE_OAUTH_ERROR', error: ${JSON.stringify(ex.message)} }, '*');
    }
  </script>
</body>
</html>`);
  }
});

/**
 * 3. YouTube Connection Status Engine (Truthful Zero Fake Probe)
 */
app.get('/api/auth/youtube/status', async (req: Request, res: Response) => {
  const clientId = (process.env.YOUTUBE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '').trim();
  const clientSecret = (process.env.YOUTUBE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || '').trim();
  const apiKey = (process.env.YOUTUBE_API_KEY || '').trim();
  const staticToken = (process.env.YOUTUBE_ACCESS_TOKEN || '').trim();
  const staticChannelId = (process.env.YOUTUBE_CHANNEL_ID || '').trim();
  const redirectUri = getYouTubeRedirectUri(req);

  // 1. If OAuth Token is active, run an authenticated probe
  const tokenCheck = await ensureValidYouTubeToken();
  if (tokenCheck.valid) {
    try {
      const probeRes = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails&mine=true', {
        headers: { Authorization: `Bearer ${tokenCheck.token}` },
      });
      const probeData: any = await probeRes.json().catch(() => null);

      if (probeRes.ok && probeData?.items?.length > 0) {
        const item = probeData.items[0];
        // Never invent 'YouTube Channel' when the API omitted the title; fall
        // back to the real channel id, mirroring the connect callback.
        const title = observedAccountName(item.snippet?.title);
        const chId = item.id || '';
        const customUrl = item.snippet?.customUrl || '';
        const avatarUrl = item.snippet?.thumbnails?.default?.url || item.snippet?.thumbnails?.high?.url || '';

        if (memoryState.youTubeConnection) {
          if (title) memoryState.youTubeConnection.channelTitle = title;
          memoryState.youTubeConnection.channelId = chId;
          memoryState.youTubeConnection.customUrl = customUrl;
          if (avatarUrl) memoryState.youTubeConnection.avatarUrl = avatarUrl;
          persistMemory();
        }

        const conn = memoryState.youTubeConnection;
        // channels.list proves read access to the channel, not the upload scope.
        // canPublish therefore follows the recorded grant: true only when the
        // upload scope is on record, false when it is absent or unrecorded.
        const uploadScopeGranted = publishScopeGranted('youtube', conn?.scopes) === true;
        return res.json({
          connected: true,
          status: 'API_VERIFIED',
          canPublish: uploadScopeGranted,
          authType: 'OAUTH_2_0',
          channelTitle: title ?? chId ?? undefined,
          channelId: chId,
          customUrl,
          avatarUrl,
          connectedAt: conn?.connectedAt || new Date().toISOString(),
          expiresAt: conn?.expiresAt,
          scopes: conn?.scopes ?? [],
          hasClientId: Boolean(clientId),
          hasClientSecret: Boolean(clientSecret),
          hasApiKey: Boolean(apiKey),
          redirectUri,
          message: uploadScopeGranted
            ? undefined
            : `Channel confirmed read-only. The upload scope (${PLATFORM_PUBLISH_SCOPES.youtube}) is not on record for this connection, so publishing is not confirmed — reconnect to grant upload access.`,
        });
      } else {
        const is403 = probeRes.status === 403;
        const errDetail = probeData?.error?.message || `HTTP status ${probeRes.status}`;
        return res.json({
          connected: false,
          status: is403 ? 'ERROR' : 'TOKEN_INVALID',
          canPublish: false,
          authType: 'OAUTH_2_0',
          isGoogleTestingModeBlocked: is403,
          diagnosticError: errDetail,
          hasClientId: Boolean(clientId),
          hasClientSecret: Boolean(clientSecret),
          hasApiKey: Boolean(apiKey),
          redirectUri,
          message: is403
            ? 'YouTube API returned 403: Google Cloud OAuth app is in "Testing" mode. Add your Google account under OAuth Consent Screen -> Test Users.'
            : `YouTube API probe failed: ${errDetail}`,
        });
      }
    } catch (probeEx: any) {
      return res.json({
        connected: false,
        status: 'ERROR',
        canPublish: false,
        authType: 'OAUTH_2_0',
        diagnosticError: probeEx.message,
        hasClientId: Boolean(clientId),
        hasClientSecret: Boolean(clientSecret),
        hasApiKey: Boolean(apiKey),
        redirectUri,
        message: `Network exception during YouTube probe: ${probeEx.message}`,
      });
    }
  }

  // 2. If static env token is present, it has not been probed against Google,
  //    so it is configured — never a verified connection or a publishing grant.
  if (staticToken) {
    return res.json({
      connected: false,
      status: 'CONFIGURED',
      canPublish: false,
      authType: 'STATIC_ENV_TOKEN',
      channelTitle: 'Configured Channel (Env Token)',
      channelId: staticChannelId || undefined,
      hasClientId: Boolean(clientId),
      hasClientSecret: Boolean(clientSecret),
      hasApiKey: Boolean(apiKey),
      redirectUri,
      message: 'A static YOUTUBE_ACCESS_TOKEN is present but has not been verified against Google. Run "Test connection" to confirm the channel before publishing.',
    });
  }

  // 3. If OAuth Client ID & Secret configured (needs authorization)
  if (clientId && clientSecret) {
    return res.json({
      connected: false,
      status: 'CONFIGURED',
      canPublish: false,
      authType: 'OAUTH_2_0',
      hasClientId: true,
      hasClientSecret: true,
      hasApiKey: Boolean(apiKey),
      redirectUri,
      message: 'Google Cloud OAuth credentials configured. Click "Connect YouTube" to authorize your channel.',
    });
  }

  // 4. If only API Key configured
  if (apiKey) {
    return res.json({
      connected: false,
      status: 'CONFIGURED',
      canPublish: false,
      authType: 'API_KEY',
      channelTitle: staticChannelId ? `Channel ID: ${staticChannelId}` : 'Google API Key Active',
      channelId: staticChannelId || undefined,
      hasClientId: Boolean(clientId),
      hasClientSecret: Boolean(clientSecret),
      hasApiKey: true,
      redirectUri,
      message: 'Google API Key is active (Read-only metadata). OAuth 2.0 Connection is required for video uploads.',
    });
  }

  return res.json({
    connected: false,
    status: 'NOT_CONFIGURED',
    canPublish: false,
    hasClientId: Boolean(clientId),
    hasClientSecret: Boolean(clientSecret),
    hasApiKey: Boolean(apiKey),
    redirectUri,
    message: 'YouTube is not connected. Add YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET in Settings (⚙️) then connect via OAuth 2.0.',
  });
});

/**
 * 4. Disconnect YouTube OAuth Account
 */
app.post('/api/auth/youtube/disconnect', (req: Request, res: Response) => {
  // Same guard as LinkedIn: report a real disconnection only when a channel was
  // actually linked and its stored credentials were removed.
  if (!memoryState.youTubeConnection) {
    return res.json({
      success: false,
      outcome: 'NOT_CONNECTED',
      message: 'No YouTube channel is connected; nothing was disconnected.',
    });
  }

  // The NAME must be the recorded channel title, never the `'YouTube Account'`
  // placeholder the route used to print when the channel was unnamed.
  const prevChannel = disconnectAccountLabel(memoryState.youTubeConnection.channelTitle);
  const connectionBefore = memoryState.youTubeConnection;
  memoryState.youTubeConnection = undefined;

  // Same durability rule as LinkedIn: the removal is only real once it reaches
  // disk. A dropped write reverted on the next boot while the audit log already
  // claimed a VERIFIED disconnection. Restore and report failure honestly.
  if (!persistMemory()) {
    memoryState.youTubeConnection = connectionBefore;
    return res.status(500).json({
      success: false,
      persisted: false,
      error: 'The disconnect could not be written to durable storage; the channel is still connected.',
    });
  }

  addAuditLog(
    `YouTube Channel Disconnected (${prevChannel})`,
    1,
    'HUMAN_CONFIRMATION',
    'VERIFIED'
  );

  res.json({ success: true, message: 'YouTube disconnected successfully.' });
});

app.get('/api/social/platforms', (req: Request, res: Response) => {
  const platforms = getPlatformIntegrationsStatus(req);
  res.json({ success: true, platforms });
});

app.post('/api/social/platforms/test', async (req: Request, res: Response) => {
  const { platform } = req.body;
  if (!platform) return res.status(400).json({ error: 'Platform identifier is required' });

  const result = await testPlatformConnection(platform);
  res.json(result);
});

// Proactive Routines APIs
app.get('/api/routines', (req: Request, res: Response) => {
  // Rebuild on read so the counts reflect current memory, never a boot-time snapshot.
  proactiveReports = buildProactiveReports();
  res.json({ routines: proactiveReports });
});

app.post('/api/routines/trigger', async (req: Request, res: Response) => {
  const { timeSlot } = req.body || {};
  // The store is rebuilt on read so a trigger matches the current reports. An
  // unknown slot used to fall back to the first report in the store, and an
  // empty store returned `undefined` — both still reported as a triggered
  // briefing.
  proactiveReports = buildProactiveReports();
  const request = resolveRoutineTrigger(timeSlot);
  if (!request.ok) {
    return res.status(400).json({ success: false, error: request.reason, triggered: false });
  }
  const routine = proactiveReports.find((r) => r.timeSlot === request.slot);
  if (!routine) {
    return res.status(404).json({
      success: false,
      error: `No routine is stored for slot "${request.slot}".`,
      triggered: false,
    });
  }
  // Compose and actually push the briefing, then report what Telegram observed.
  // The route used to answer `triggered: true` for a briefing that was only
  // built in memory, so a server with no configured chat still read as a
  // delivered routine.
  const delivery = await routineTriggerDelivery(
    activeTelegramChatId,
    routine.titleEn,
    routine.contentEn,
    deliverTelegramMessage
  );
  res.json({
    success: delivery.delivered,
    triggered: delivery.triggered,
    delivered: delivery.delivered,
    outcome: delivery.outcome,
    message: delivery.message,
    routine,
  });
});

// ==============================================================================
// PRODUCTION HARDENING APIs (backlog items 51, 52, 54, 59)
// ==============================================================================

/** Permission matrix as the running system applies it. */
app.get('/api/security/permission-matrix', (req: Request, res: Response) => {
  res.json({
    success: true,
    currentLevel: securityMatrixState.currentLevel,
    emergencyPaused: getEmergencyState().emergencyPaused,
    matrix: PERMISSION_MATRIX,
    unknownActionPolicy: UNKNOWN_ACTION_DECISION,
  });
});

/**
 * Self-check of the finance-exclusion lock. Runs the real probe corpus through
 * the two enforcement engines and reports what they actually did, so the
 * Finance Guard panel never displays "100% EXCLUDED" from a constant.
 */
app.get('/api/security/finance-guard', (req: Request, res: Response) => {
  res.json({ success: true, report: runFinanceGuardSelfCheck() });
});

/** Dry-run: classify an action and say whether it would be permitted. */
app.post('/api/security/evaluate', (req: Request, res: Response) => {
  const command = typeof req.body?.command === 'string' ? req.body.command : '';
  if (!command.trim()) {
    return res.status(400).json({ success: false, error: 'command is required.' });
  }

  // The kill switch outranks the level check: while paused, nothing autonomous
  // runs regardless of how safe the action looks.
  if (isBlockedByKillSwitch(getEmergencyState().emergencyPaused)) {
    return res.json({
      success: true,
      decision: {
        allowed: false,
        requiredLevel: 4,
        requiresApproval: true,
        category: 'kill_switch',
        reason: 'Emergency stop is engaged; all autonomous actions are paused.',
      },
    });
  }

  const decision = evaluatePermission(
    command,
    securityMatrixState.currentLevel,
    req.body?.approvedBy
  );
  res.json({ success: true, decision });
});

/** Secret scan over this repository's own tracked files. */
app.get('/api/security/audit-secrets', async (req: Request, res: Response) => {
  try {
    const { readFile } = await import('fs/promises');
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const run = promisify(execFile);

    const { stdout } = await run('git', ['ls-files'], { cwd: process.cwd(), maxBuffer: 10 * 1024 * 1024 });
    const paths = stdout.split('\n').map((p) => p.trim()).filter(Boolean);

    const files = [];
    for (const path of paths) {
      // Only text files up to a sane size; a binary blob is not scan-worthy.
      if (/\.(png|jpe?g|gif|ico|woff2?|ttf|eot|pdf|zip|cjs|map)$/i.test(path)) continue;
      try {
        const content = await readFile(path, 'utf8');
        if (content.length > 2_000_000) continue;
        files.push({ path, content, tracked: true });
      } catch {
        // Unreadable file: skip rather than fail the audit.
      }
    }

    const report = runSecurityAudit(files);
    const summary = summariseAudit(report);

    res.json({
      success: true,
      clean: isAuditClean(report),
      summary,
      findings: report.findings.slice(0, 100),
      scannedFiles: report.scannedFiles,
      note: 'Scans tracked text files for credential patterns. A clean result means these patterns were absent, not that the system is proven secure.',
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Secret audit failed.' });
  }
});

/** Create a validated, redacted memory backup. */
app.get('/api/backup', (req: Request, res: Response) => {
  const backup = createBackup(memoryState as unknown as Record<string, unknown>);
  const integrity = verifyBackup(backup);
  if (!integrity.ok) {
    return res.status(500).json({
      success: false,
      error: 'Backup failed its own round-trip verification and was not returned.',
      errors: integrity.errors,
    });
  }
  addAuditLog(
    `Memory backup created and round-trip verified (${backup.keyCount} keys)`,
    3,
    'HUMAN_OPERATOR',
    'VERIFIED'
  );
  persistMemory();
  res.json({ success: true, verified: true, backup });
});

/** Restore a previously created backup. */
app.post('/api/restore', (req: Request, res: Response) => {
  // Snapshot before the merge: restoreBackup only reassigns top-level keys, so a
  // shallow copy of the previous references is enough to undo it on failure.
  const before = { ...memoryState };
  const result = restoreBackup(
    memoryState as unknown as Record<string, unknown>,
    req.body?.backup ?? req.body
  );

  if (!result.ok) {
    return res.status(400).json({ success: false, errors: result.errors });
  }

  // A restore that cannot reach disk has not happened: the running process holds
  // the restored values but the next boot reads the pre-restore file. The route
  // used to answer success:true and write a VERIFIED audit row regardless, so an
  // unwritable volume produced a restore that silently reverted on restart.
  // Match /api/memory: roll the merge back and report the failure honestly.
  if (!persistMemory()) {
    memoryState = before as MemoryData;
    return res.status(500).json({
      success: false,
      persisted: false,
      ...result,
      error: 'The restore could not be written to durable storage; it was not applied.',
    });
  }

  addAuditLog(
    `Memory restored from backup: ${result.restoredKeys.length} keys replaced, ${result.preservedKeys.length} preserved`,
    4,
    'HUMAN_OPERATOR',
    'VERIFIED'
  );
  res.json({ success: true, persisted: true, ...result });
});

/** Deployment readiness check. Observes this process's real configuration. */
app.get('/api/deployment/verify', async (req: Request, res: Response) => {
  try {
    const fsMod = await import('fs/promises');
    const dir = path.dirname(MEMORY_FILE_PATH);

    let dataDirWritable = false;
    try {
      const probe = path.join(dir, `.write-probe-${Date.now()}`);
      await fsMod.writeFile(probe, 'ok');
      await fsMod.unlink(probe);
      dataDirWritable = true;
    } catch {
      dataDirWritable = false;
    }

    const backup = createBackup(memoryState as unknown as Record<string, unknown>);
    const backupCheck = verifyBackup(backup);

    const report = verifyDeployment({
      vaultConfigured: VAULT_CONFIGURED,
      isDevMode: process.env.NODE_ENV !== 'production',
      port: typeof PORT === 'number' ? PORT : null,
      dataDirWritable,
      httpsConfigured: Boolean(process.env.HTTPS_ENABLED || process.env.TLS_CERT_PATH),
      blockingBugs: KNOWN_BLOCKING_BUGS,
      backupVerified: backupCheck.ok,
    });

    res.json({
      success: true,
      ...report,
      blockers: deploymentBlockers(report),
      note: 'A deployment is ready only when every check passes. UNKNOWN checks block readiness rather than being assumed good.',
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Deployment verification failed.' });
  }
});

// Security Matrix APIs
app.get('/api/security', (req: Request, res: Response) => {
  res.json({
    currentLevel: securityMatrixState.currentLevel,
    humanApprovalForExternal: securityMatrixState.humanApprovalForExternal,
    maskSensitiveData: securityMatrixState.maskSensitiveData,
    credentialLeakProtection: securityMatrixState.credentialLeakProtection,
    levels: securityMatrixState.levels,
    auditLogs: memoryState.auditLogs,
    // Never let a client read the raw array length as a count of confirmed work: seed
    // and legacy rows are reported separately from real recorded events.
    auditLogCounts: auditTrailCounts(memoryState.auditLogs),
    auditTrailSummary: describeAuditTrail(memoryState.auditLogs),
  });
});

app.post('/api/security/update', (req: Request, res: Response) => {
  // Only fields that exist in the matrix and carry a valid value are applied.
  // An empty body, an out-of-range level, or an unknown field is answered as a
  // no-op rather than a successful save of the matrix that gates external
  // actions and credential masking.
  const verdict = classifySecurityMatrixUpdate(req.body);

  const securityStateSnapshot = {
    currentLevel: securityMatrixState.currentLevel,
    humanApprovalForExternal: securityMatrixState.humanApprovalForExternal,
    maskSensitiveData: securityMatrixState.maskSensitiveData,
    credentialLeakProtection: securityMatrixState.credentialLeakProtection,
    levels: securityMatrixState.levels,
    auditLogs: memoryState.auditLogs,
  };

  if (!verdict.accepted) {
    return res.status(400).json({
      success: false,
      applied: false,
      reason: verdict.reason,
      rejected: verdict.rejected,
      message: verdict.message,
      securityState: securityStateSnapshot,
    });
  }

  // The matrix gates live outside `memoryState`, so `persistMemory()` alone never
  // wrote them. `persistSecurityMatrixState()` copies the live gates into the
  // persisted snapshot and writes it; only a durable write may read as a save.
  const preGates = persistedSecurityMatrix();

  if (verdict.applied.currentLevel !== undefined) securityMatrixState.currentLevel = verdict.applied.currentLevel;
  if (verdict.applied.humanApprovalForExternal !== undefined) securityMatrixState.humanApprovalForExternal = verdict.applied.humanApprovalForExternal;
  if (verdict.applied.maskSensitiveData !== undefined) securityMatrixState.maskSensitiveData = verdict.applied.maskSensitiveData;

  if (!persistSecurityMatrixState()) {
    // The write did not reach disk. Roll the in-memory matrix back to the
    // pre-request gates so the running matrix and the durable file agree, and
    // refuse to report a save the disk never received.
    securityMatrixState.currentLevel = preGates.currentLevel;
    securityMatrixState.humanApprovalForExternal = preGates.humanApprovalForExternal;
    securityMatrixState.maskSensitiveData = preGates.maskSensitiveData;
    memoryState.securityMatrix = persistedSecurityMatrix();
    return res.status(500).json({
      success: false,
      applied: false,
      persisted: false,
      rejected: verdict.rejected,
      message: 'The security-matrix change could not be written to durable storage; it was not applied.',
      securityState: {
        ...preGates,
        levels: securityMatrixState.levels,
        auditLogs: memoryState.auditLogs,
      },
    });
  }

  // Echo the state *after* the classified fields are applied. The previous
  // snapshot was captured before the assignments above, so a successful toggle
  // handed the client the value it had just replaced — success:true next to a
  // stale gate. A UI that trusts the response (rather than refetching) rendered
  // the un-applied value and reported a change that had not taken effect.
  const appliedState = applySecurityMatrixUpdate(
    {
      currentLevel: securityMatrixState.currentLevel,
      humanApprovalForExternal: securityMatrixState.humanApprovalForExternal,
      maskSensitiveData: securityMatrixState.maskSensitiveData,
      credentialLeakProtection: securityMatrixState.credentialLeakProtection,
    },
    verdict.applied
  );

  res.json({
    success: true,
    applied: true,
    persisted: true,
    rejected: verdict.rejected,
    message: verdict.message,
    securityState: {
      ...appliedState,
      levels: securityMatrixState.levels,
      auditLogs: memoryState.auditLogs,
    },
  });
});

// Audit Trail API
app.get('/api/actions/audit', (req: Request, res: Response) => {
  res.json({
    auditLogs: memoryState.auditLogs,
    totalLogs: memoryState.auditLogs.length,
    // `totalLogs` may include carried-over legacy rows; `recordedLogs` counts
    // only entries this process appended, so a client never reads the array
    // length as a count of confirmed events.
    recordedLogs: auditTrailCounts(memoryState.auditLogs).recorded,
    summary: describeAuditTrail(memoryState.auditLogs),
    timestamp: new Date().toISOString(),
  });
});

// Intent classification API
app.post('/api/intent', async (req: Request, res: Response) => {
  try {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'Text prompt is required' });
    }

    const local = classifyIntentLocally(text);
    const ai = getGenAI();
    if (ai && local.intent === 'chat') {
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: `You are the routing brain of Jarvis voice assistant. Classify the user input into exactly ONE of these categories:
- 'open_chrome'
- 'open_notepad'
- 'open_calculator'
- 'open_paint'
- 'take_screenshot'
- 'create_file'
- 'volume_up'
- 'volume_down'
- 'pc_shutdown'
- 'pc_restart'
- 'open_google'
- 'open_youtube'
- 'open_gmail'
- 'open_chatgpt'
- 'google_search'
- 'set_name'
- 'get_name'
- 'check_project'
- 'create_social_post'
- 'find_document'
- 'schedule_morning_report'
- 'generate_quotation'
- 'cloud_telemetry'
- 'security_audit'
- 'chat'

User Input: "${text}"
Respond with ONLY the exact category string.`,
                },
              ],
            },
          ],
        });

        const category = response.text?.trim().toLowerCase().replace(/['"]/g, '');
        if (category && category !== 'chat') {
          return res.json({ intent: category, confidence: 0.92 });
        }
      } catch (geminiErr) {
        console.warn('Gemini intent categorization fallback:', geminiErr);
      }
    }

    res.json(local);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Intent detection failed' });
  }
});

// ==============================================================================
// 8.5. AUTONOMOUS PERMISSION GATE, EMERGENCY STOP & REAL TOOLS APIs
// ==============================================================================

// Emergency Stop Controls
app.get('/api/emergency/status', (req: Request, res: Response) => {
  res.json(getEmergencyState());
});

app.post('/api/emergency/toggle', async (req: Request, res: Response) => {
  const { requestedBy = 'HUMAN_OPERATOR', reason, action } = req.body;
  const pre = getEmergencyState();

  // `toggleEmergencyStop` flips the flag, so a repeated stop would RELEASE the
  // freeze and a resume while nothing was paused would ENGAGE it — each read as
  // success. The action is derived from the pre-transition state; when the
  // pre-state does not support the requested transition the request is a no-op
  // and nothing is logged, notified, or reported as executed.
  const resolvedAction: 'stop' | 'resume' =
    action === 'stop' || action === 'resume' ? action : pre.emergencyPaused ? 'resume' : 'stop';
  const gate = emergencyTogglePreAction(resolvedAction, pre);
  const verdict = emergencyToggleVerdict(resolvedAction, { ...pre });

  if (!verdict.actionExecuted) {
    persistEmergencyState();
    return res.json({
      success: false,
      actionExecuted: false,
      action: resolvedAction,
      title: verdict.title,
      message: verdict.replyEn,
      emergencyState: getEmergencyState(),
    });
  }

  if (gate.flip) {
    toggleEmergencyStop(requestedBy, reason);
  }
  const updated = getEmergencyState();
  const engaged = updated.emergencyPaused === true;

  // The freeze must be durable: a safety stop that evaporates on reboot is worse
  // than none, because the operator still believes it holds. The write result is
  // honored — a transition that cannot reach disk is reported as persisted:false
  // rather than a durable success. The transitioned state is kept in memory (a
  // disk error must never silently un-freeze the system); the response names the
  // durability gap so the operator can act.
  const statePersisted = persistEmergencyState() && emergencyStateOnDisk(engaged);

  // The engagement claim and its audit row share one durability verdict: the
  // row is appended, then persisted, then read back from disk with
  // `diskHasAuditRow` — `persistMemory()` can return true without writing. A
  // freeze reported as held whose row is not durable is refused.
  const auditRow: AuditLogEntry = {
    id: `log-emerg-${Date.now()}`,
    timestamp: new Date().toISOString(),
    action: engaged
      ? `🚨 EMERGENCY STOP ACTIVATED by ${requestedBy}: All autonomous external actions and modifications PAUSED.`
      : `🟢 EMERGENCY STOP DEACTIVATED by ${requestedBy}: Autonomous subsystem operations RESUMED.`,
    levelRequired: 4,
    approvedBy: requestedBy,
    status: 'EXECUTED',
    verificationStatus: 'VERIFIED',
    finalTruthState: 'VERIFIED',
  };
  pushAuditEntry(auditRow);
  const auditPersisted = persistMemory() && diskHasAuditRow(auditRow.id);
  const persisted = statePersisted && auditPersisted;

  if (engaged && !persisted) {
    // A hard stop that is reported held but is not on disk would silently
    // release on the next boot. Roll the row back and report the durability gap
    // instead of a clean success. (The release direction keeps reporting the
    // gap through `persisted: false` without a spurious 500.)
    memoryState.auditLogs = memoryState.auditLogs.filter((e) => e.id !== auditRow.id);
    return res.status(500).json({
      success: false,
      actionExecuted: true,
      action: resolvedAction,
      title: verdict.title,
      persisted: false,
      emergencyState: getEmergencyState(),
      error: 'Emergency freeze could not be written to durable storage.',
    });
  }

  // Notify Telegram Admin if connected
  if (activeTelegramChatId && getCleanTelegramToken()) {
    const alertMsg = engaged
      ? `🚨 *HERMES JARVIS: EMERGENCY STOP ACTIVATED*\n\nAll autonomous external actions, drafts, code modifications, and background tasks are now **HARD PAUSED** by ${requestedBy}.\n\n• *Timestamp*: ${new Date().toLocaleTimeString()}\n• *Status*: SYSTEM FROZEN`
      : `🟢 *HERMES JARVIS: SYSTEM RESUMED*\n\nEmergency stop released by ${requestedBy}. Normal permission-gated operations are now active.\n\n• *Timestamp*: ${new Date().toLocaleTimeString()}\n• *Status*: STANDBY`;
    sendRealTelegramMessage(activeTelegramChatId, alertMsg).catch(() => {});
  }

  res.json({ success: true, actionExecuted: true, action: resolvedAction, title: verdict.title, persisted, ...updated });
});

// Global Kill Switch API (HUD & System Level)
app.post('/api/system/kill-switch', async (req: Request, res: Response) => {
  const { requestedBy = 'HUD_GLOBAL_KILL_SWITCH', reason = 'Global Kill Switch Triggered by Operator' } = req.body;

  // The transition verdict is derived from the state observed *before* the
  // activation, so a kill switch that was already engaged is reported as a
  // no-op rather than a fresh termination of the queue.
  const preKillState = getEmergencyState();

  // 1. Activate hard emergency stop & clear pending queue
  const killResult = activateEmergencyKillSwitch(requestedBy, reason);
  const killVerdict = killSwitchVerdict(preKillState, killResult.clearedTasksCount);

  // 2. Terminate active Telegram long-polling loop & background routines
  const wasTelegramPolling = telegramPollingActive;
  telegramPollingActive = false;
  telegramConfig.mode = 'simulator';
  telegramConfig.webhookStatus = 'waiting_token';

  // 3. Log the Level 4 audit event only when the engagement actually did the
  // work it claims; an already-engaged (or unobserved) kill switch must not
  // write a "terminated all background tasks" row. The row is appended before
  // the durable write below so it is serialized with the latch, then read back
  // from disk to confirm it landed.
  const killAuditRow: AuditLogEntry | null = killVerdict.actionExecuted
    ? pushAuditEntry({
        id: `log-killswitch-${Date.now()}`,
        timestamp: new Date().toISOString(),
        action: `🚨 GLOBAL KILL SWITCH TRIGGERED by ${requestedBy}: Terminated all background tasks, paused polling, and cleared ${killVerdict.clearedTasksCount} pending PermissionGateway item(s).`,
        levelRequired: 4,
        approvedBy: requestedBy,
        status: 'EXECUTED',
        verificationStatus: 'VERIFIED',
        finalTruthState: 'VERIFIED',
      })
    : null;

  // 4. Durably hold the latch and its audit row. A kill switch that is reported
  // engaged but is not on disk would silently release on the next boot — the
  // most dangerous kind of false success. `persistEmergencyState()` returns the
  // `persistMemory()` boolean, which can be true without writing when the file
  // already holds the identical bytes, so the latch is read back from disk
  // (`emergencyStateOnDisk`) and the appended row is confirmed present
  // (`diskHasAuditRow`). `persisted` is the conjunction, not the write boolean.
  const statePersisted = persistEmergencyState() && emergencyStateOnDisk(true);
  const auditPersisted =
    killAuditRow === null ? true : persistMemory() && diskHasAuditRow(killAuditRow.id);
  const persisted = statePersisted && auditPersisted;

  // A real engagement whose latch or row is not durable must not be reported as
  // held. Roll the phantom row back and answer honestly; the latch is kept in
  // memory so a disk error never silently un-freezes the system.
  if (killVerdict.actionExecuted && !persisted) {
    if (killAuditRow) {
      memoryState.auditLogs = memoryState.auditLogs.filter((e) => e.id !== killAuditRow.id);
    }
    return res.status(500).json({
      success: false,
      outcome: killVerdict.outcome,
      actionExecuted: true,
      persisted: false,
      headline: killVerdict.headline,
      message: killVerdict.message,
      clearedTasksCount: killVerdict.clearedTasksCount,
      wasTelegramPolling,
      emergencyState: killResult.emergencyState,
      error: 'The kill switch freeze could not be written to durable storage.',
    });
  }

  // 5. Send the Emergency Telegram Notice only for a real, durably held
  // engagement — never for a freeze that did not reach disk.
  if (killVerdict.actionExecuted && persisted && activeTelegramChatId && getCleanTelegramToken()) {
    const alertMsg = `🚨 *HERMES JARVIS: GLOBAL KILL SWITCH EXECUTED*\n\nAll active background processes have been terminated, active polling loops suspended, and ${killVerdict.clearedTasksCount} pending queue task(s) cancelled.\n\n• *Triggered By*: ${requestedBy}\n• *Timestamp*: ${new Date().toLocaleTimeString()}\n• *Status*: HARD PAUSE ACTIVE`;
    sendRealTelegramMessage(activeTelegramChatId, alertMsg).catch(() => {});
  }

  res.status(killVerdict.outcome === 'UNKNOWN' ? 503 : 200).json({
    success: killVerdict.actionExecuted,
    outcome: killVerdict.outcome,
    actionExecuted: killVerdict.actionExecuted,
    persisted,
    headline: killVerdict.headline,
    message: killVerdict.message,
    clearedTasksCount: killVerdict.clearedTasksCount,
    wasTelegramPolling,
    emergencyState: killResult.emergencyState,
  });
});

app.post('/api/system/resume', async (req: Request, res: Response) => {
  const { requestedBy = 'HUD_OPERATOR' } = req.body;

  // A resume is real only when a freeze was actually in force. The verdict is
  // read from the pre-transition state so a resume while nothing was paused —
  // or while a latched hard kill switch still holds autonomy frozen — cannot be
  // reported or audited as a release.
  const verdict = emergencyResumeVerdict(getEmergencyState());

  if (!verdict.actionExecuted) {
    persistEmergencyState();
    return res.json({
      success: false,
      released: false,
      outcome: verdict.outcome,
      message: verdict.message,
      emergencyState: getEmergencyState(),
    });
  }

  const resumedState = resumeSystemOperation(requestedBy);

  // The release must be durable too: a "resumed" report that is not on disk
  // would re-freeze on the next boot, so the cleared latch is read back from
  // disk (`emergencyStateOnDisk(false)`) rather than trusting
  // `persistEmergencyState()`'s boolean, which can return true without writing
  // when the file already holds the identical bytes.
  const statePersisted = persistEmergencyState() && emergencyStateOnDisk(false);

  // The release claim and its audit row share one durability verdict: the row
  // is appended, then persisted, then read back from disk with
  // `diskHasAuditRow`. A release reported as durable whose row never landed is
  // refused and the phantom row rolled back. The release itself is kept in
  // memory so a disk error does not leave the system looking frozen.
  const auditRow: AuditLogEntry = {
    id: `log-resume-${Date.now()}`,
    timestamp: new Date().toISOString(),
    action: `🟢 SYSTEM RESUMED by ${requestedBy}: Subsystems returned to standard Level 1-4 permission mode.`,
    levelRequired: 4,
    approvedBy: requestedBy,
    status: 'EXECUTED',
    verificationStatus: 'VERIFIED',
    finalTruthState: 'VERIFIED',
  };
  pushAuditEntry(auditRow);
  const auditPersisted = persistMemory() && diskHasAuditRow(auditRow.id);
  const persisted = statePersisted && auditPersisted;

  if (!persisted) {
    memoryState.auditLogs = memoryState.auditLogs.filter((e) => e.id !== auditRow.id);
    return res.status(500).json({
      success: false,
      released: false,
      persisted: false,
      outcome: verdict.outcome,
      message: verdict.message,
      emergencyState: resumedState,
      error: 'The resume could not be written to durable storage.',
    });
  }

  // Re-enable telegram live polling only for a durable release
  if (getCleanTelegramToken() && !telegramPollingActive) {
    startTelegramPolling().catch((err: any) => {
      console.warn('[Telegram Bot] Resumption notice:', err.message);
    });
  }

  res.json({
    success: true,
    released: true,
    persisted,
    outcome: verdict.outcome,
    message: verdict.message,
    emergencyState: resumedState,
  });
});

// Approvals & Action Requests Registry
app.get('/api/approvals/pending', (req: Request, res: Response) => {
  res.json({ pending: getPendingApprovals(), emergencyState: getEmergencyState() });
});

app.get('/api/approvals/all', (req: Request, res: Response) => {
  res.json({ requests: getAllActionRequests(), emergencyState: getEmergencyState() });
});

app.post('/api/approvals/create', (req: Request, res: Response) => {
  const { exactAction, target, contentChanges, level = 4, source = 'web_terminal', platform, actionPayload } = req.body;

  if (!exactAction || !target) {
    return res.status(400).json({ error: 'exactAction and target are required' });
  }

  const registryBefore = getAllActionRequests();

  const result = createPendingActionRequest({
    exactAction,
    target,
    contentChanges: contentChanges || 'Execution parameters specified in payload',
    level,
    source,
    platform,
    actionPayload,
  });

  // Success is derived from whether the request actually reached
  // PENDING_APPROVAL — not from the route merely producing a request object.
  // A finance or emergency block, or any other terminal status, is a no-op.
  const verdict = classifyApprovalCreate(result);

  if (result.blockedByFinance) {
    return res.status(403).json({
      success: false,
      blocked: true,
      outcome: verdict.outcome,
      reason: result.financeReason,
      request: result.request,
    });
  }

  if (result.blockedByEmergency) {
    return res.status(423).json({
      success: false,
      blocked: true,
      outcome: verdict.outcome,
      reason: 'Emergency Stop is active. Action creation paused.',
      request: result.request,
    });
  }

  if (!verdict.staged) {
    // Defensive: a request that did not reach PENDING_APPROVAL must never be
    // reported as a successful staging, and no Telegram card is sent for it.
    return res.status(409).json({
      success: false,
      staged: false,
      outcome: verdict.outcome,
      reason: verdict.message,
      request: result.request,
    });
  }

  // The staged approval must be durable: the queue lives outside `memoryState`,
  // so a discarded write silently emptied it on the next restart and the
  // operator's later decision resolved nothing. The write result is honored — a
  // request that cannot reach disk is not reported as a staged approval.
  const persisted = persistApprovalRegistry();
  if (!persisted) {
    // The write failed, so roll the live registry back to what it held before
    // this request. `persistApprovalRegistry` copies the request into
    // `memoryState.permissionRequests` before writing, so both that field and
    // the live registry must be restored — otherwise a later successful persist
    // (for any other reason) writes the phantom request to disk and the next
    // boot resurrects an approval that was reported as not staged.
    hydrateActionRequests(registryBefore);
    memoryState.permissionRequests = registryBefore;
    return res.status(500).json({
      success: false,
      staged: false,
      persisted: false,
      outcome: 'NOT_DURABLE',
      reason: 'Approval request could not be written to durable storage; it was not reported as staged.',
      request: result.request,
    });
  }

  // If source is Telegram or requested with notification, send approval card to Telegram
  if (activeTelegramChatId && getCleanTelegramToken()) {
    const cardText = `⚠️ *PERMISSION LEVEL ${level} ACTION REQUEST*\n\n• *EXACT ACTION*: ${exactAction}\n• *TARGET*: \`${target}\`\n• *CHANGES / PAYLOAD*: ${contentChanges}\n• *REQUIRED PERMISSION*: LEVEL ${level} (Human Confirmation)\n\nReply with *YES / APPROVE* or *NO / REJECT*.`;
    const keyboard = {
      inline_keyboard: [
        [
          { text: '✅ YES / APPROVE', callback_data: `approve_perm_${result.request.id}` },
          { text: '❌ NO / REJECT', callback_data: `reject_perm_${result.request.id}` },
        ],
      ],
    };
    sendRealTelegramMessage(activeTelegramChatId, cardText, keyboard).catch(() => {});
  }

  res.json({ success: true, staged: true, persisted, outcome: verdict.outcome, request: result.request });
});

app.post('/api/approvals/resolve', async (req: Request, res: Response) => {
  const { id, decision, approver = 'HUMAN_OPERATOR' } = req.body;
  if (!id || !decision) {
    return res.status(400).json({ error: 'id and decision (APPROVE | REJECT) are required' });
  }

  const emergency = getEmergencyState();
  if (emergency.emergencyPaused && decision === 'APPROVE') {
    return res.status(423).json({
      success: false,
      error: 'Cannot approve action while Emergency Stop is active. Release emergency stop first.',
    });
  }

  if (decision === 'REJECT') {
    const updated = updateActionRequestStatus(id, 'REJECTED', { resolvedBy: approver });
    if (!updated) {
      // No such pending action — there is nothing to reject, so do not log an
      // audit entry or answer success for a resolution that never happened.
      return res.status(404).json({ success: false, error: `No pending action request with id ${id}.` });
    }
    const rejectAuditRow: AuditLogEntry = {
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      action: `REJECTED Action "${updated?.exactAction || id}" by ${approver}`,
      levelRequired: updated?.level || 4,
      approvedBy: approver,
      status: 'REJECTED',
      verificationStatus: 'STANDBY',
      finalTruthState: 'REJECTED',
    };
    pushAuditEntry(rejectAuditRow);
    // The decision must survive a restart, or a reboot would resurrect the
    // rejected request as pending again. The registry lives outside `memoryState`,
    // and `persistMemory()` can return true without writing when the file already
    // holds identical bytes, so the REJECTED status is read back from disk rather
    // than trusting the write boolean. A decision that cannot reach disk is
    // refused (HTTP 500) and rolled back — the request is restored to
    // PENDING_APPROVAL and the phantom audit row removed, so a later successful
    // persist (for any other reason) cannot write a rejection that was reported
    // as failed to disk.
    const persisted = persistApprovalRegistry() && actionRequestStatusOnDisk(id, 'REJECTED');
    if (!persisted) {
      const liveReq = getAllActionRequests().find((r) => r.id === id);
      if (liveReq) liveReq.status = 'PENDING_APPROVAL';
      // `persistApprovalRegistry` copied the rejected snapshot into
      // `memoryState.permissionRequests` before the write failed, so resync it
      // from the restored live registry — otherwise a later unrelated
      // `persistMemory()` would write the phantom rejection to disk.
      memoryState.permissionRequests = persistedActionRequests();
      memoryState.auditLogs = memoryState.auditLogs.filter((e) => e.id !== rejectAuditRow.id);
      return res.status(500).json({
        success: false,
        persisted: false,
        request: updated,
        error: 'The rejection could not be written to durable storage; it was not recorded.',
      });
    }
    return res.json({
      success: true,
      persisted: true,
      request: updated,
      message: 'Action rejected and cancelled safely.',
    });
  }

  // APPROVE & EXECUTE
  const allReqs = getAllActionRequests();
  const targetReq = allReqs.find((r) => r.id === id);
  if (!targetReq) {
    return res.status(404).json({ error: 'Action request not found' });
  }

  // A request that already carries a terminal decision must not be dispatched
  // again. Re-running the execution branches for an already-approved request
  // could create a duplicate GitHub issue or re-attempt a publish, and the
  // response would report a fresh success for work that had already happened.
  if (!canTransitionActionStatus(targetReq.status, 'EXECUTED')) {
    return res.status(409).json({
      success: false,
      outcome: 'ALREADY_DECIDED',
      request: targetReq,
      error: `Action request ${id} was already decided (${targetReq.status}); it was not executed again.`,
    });
  }

  // Finance check
  const fin = isFinanceBlocked(`${targetReq.exactAction} ${targetReq.target} ${targetReq.contentChanges}`);
  if (fin.blocked) {
    updateActionRequestStatus(id, 'REJECTED', { errorReason: fin.reason, resolvedBy: 'FINANCE_SECURITY_GUARD' });
    return res.status(403).json({ success: false, error: fin.reason });
  }

  try {
    // No default "executed: true" — a request whose execution branch never runs
    // must not be recorded as executed. An unmatched request leaves this null
    // and resolves as UNVERIFIED.
    let executionResult: any = null;

    // Execute based on platform / payload
    if (targetReq.platform === 'YouTube' || targetReq.exactAction.toLowerCase().includes('youtube')) {
      const targetPostId = targetReq.actionPayload?.postId;
      const post = targetPostId
        ? memoryState.socialPosts.find((p) => p.id === targetPostId)
        : memoryState.socialPosts.find((p) => (p.platform || '').toLowerCase().includes('youtube'));
      if (post) {
        const publishRes = await executeApprovedAction(post.id, 'approve_and_publish', approver);
        executionResult = publishRes;
      }
    } else if (targetReq.platform === 'LinkedIn' || targetReq.exactAction.toLowerCase().includes('linkedin')) {
      // Find matching social post or execute direct payload
      const post = memoryState.socialPosts[0];
      if (post) {
        const publishRes = await executeApprovedAction(post.id, 'approve_and_publish', approver);
        executionResult = publishRes;
      }
    } else if (targetReq.exactAction.toLowerCase().includes('github issue')) {
      const { repo, title, body } = targetReq.actionPayload || {};
      if (repo && title) {
        const ghRes = await realGithubCreateIssue(repo, title, body || '');
        executionResult = ghRes;
      }
    }

    const resolution = classifyApprovalOutcome(executionResult);

    const updated = updateActionRequestStatus(id, resolution.executed ? 'EXECUTED' : 'FAILED', {
      resultUrn: resolution.evidenceRef,
      errorReason: resolution.executed ? undefined : resolution.errorReason,
      resolvedBy: approver,
    });

    const auditRow = pushAuditEntry({
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      action: `${resolution.executed ? 'EXECUTED' : 'UNCONFIRMED'} Approved Action: ${targetReq.exactAction} on ${targetReq.target}`,
      levelRequired: targetReq.level,
      approvedBy: approver,
      status: resolution.outcome,
      verificationStatus: resolution.outcome === 'VERIFIED' ? 'VERIFIED' : 'UNVERIFIED',
      providerUrn: resolution.evidenceRef,
      errorReason: resolution.executed ? undefined : resolution.errorReason,
      finalTruthState: resolution.outcome,
    });

    // The terminal decision must be durable; an unpersisted approval would let a
    // reboot re-offer the same request for execution. As with the REJECT branch,
    // the registry lives outside `memoryState` and `persistMemory()` can return
    // true without writing, so the request's terminal status is read back from
    // disk rather than trusting the write boolean. If the terminal decision
    // cannot be confirmed on disk, the response must not present it as recorded:
    // the status reverts to PENDING_APPROVAL (the pre-decision state), the
    // phantom audit row is removed, and the outcome is reported as UNPERSISTED
    // with HTTP 500 — so the operator is never told a decision landed that the
    // next boot would discard. The external action itself, if any, already ran
    // and is reported by `executionResult`; only the durability claim is refused.
    const terminalStatus = resolution.executed ? 'EXECUTED' : 'FAILED';
    const persisted = persistApprovalRegistry() && actionRequestStatusOnDisk(id, terminalStatus);
    if (!persisted) {
      const liveReq = getAllActionRequests().find((r) => r.id === id);
      if (liveReq) liveReq.status = 'PENDING_APPROVAL';
      // Resync the persisted copy, which `persistApprovalRegistry` set to the
      // terminal snapshot before the failed write.
      memoryState.permissionRequests = persistedActionRequests();
      memoryState.auditLogs = memoryState.auditLogs.filter((e) => e.id !== auditRow.id);
      return res.status(500).json({
        success: false,
        persisted: false,
        recorded: false,
        request: getAllActionRequests().find((r) => r.id === id) ?? updated,
        executionResult,
        outcome: 'UNPERSISTED',
        error: 'The decision could not be written to durable storage; it was not recorded as a terminal decision.',
      });
    }
    res.json({
      success: resolution.executed,
      persisted: true,
      request: updated,
      executionResult,
      outcome: resolution.outcome,
      message: resolution.message,
      error: resolution.executed ? undefined : resolution.errorReason,
    });
  } catch (err: any) {
    const updated = updateActionRequestStatus(id, 'FAILED', { errorReason: err.message, resolvedBy: approver });
    res.status(500).json({ success: false, request: updated, error: err.message });
  }
});

// Integrations Diagnostics Audit API
app.get('/api/tools/integrations/audit', (req: Request, res: Response) => {
  res.json(getIntegrationsAuditReport());
});

// Real Filesystem Tools APIs
app.post('/api/tools/fs/list', (req: Request, res: Response) => {
  const { path: subPath = '.' } = req.body;
  res.json(realFsList(subPath));
});

// Recursive workspace filename search. The same `realFsSearch` the voice
// `find_document` intent uses, so a routed search surfaces exactly what was
// spoken — real relative paths and byte sizes, never invented matches.
app.post('/api/tools/fs/search', (req: Request, res: Response) => {
  const { query = '', maxResults } = req.body;
  res.json(realFsSearch(String(query), typeof maxResults === 'number' ? maxResults : 10));
});

app.post('/api/tools/fs/read', (req: Request, res: Response) => {
  const { path: filePath } = req.body;
  if (!filePath) return res.status(400).json({ error: 'path is required' });
  res.json(realFsRead(filePath));
});

app.post('/api/tools/fs/write', (req: Request, res: Response) => {
  const { path: filePath, content } = req.body;
  if (!filePath || content === undefined) {
    return res.status(400).json({ error: 'path and content are required' });
  }
  const result = realFsWrite(filePath, content);
  if (result.success) {
    // The file write already happened; the audit row that records it as VERIFIED
    // is only trustworthy once it is durable. Push it, persist, and read the row
    // back from disk rather than trusting `persistMemory()`'s boolean, which is
    // true even when the file already held identical bytes. A row that does not
    // reach storage is rolled back and the response states the record is not on
    // disk instead of claiming a durable write.
    const auditPersisted = recordDurableAuditRow({
      id: `log-fs-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      action: `Modified Workspace File: "${filePath}" (${result.bytesWritten} bytes)`,
      levelRequired: 3,
      approvedBy: 'HUMAN_OR_AGENT_WORKSPACE',
      status: 'EXECUTED',
      verificationStatus: 'VERIFIED',
      finalTruthState: 'VERIFIED',
    });
    return res.json({
      ...result,
      auditPersisted,
      auditRecorded: auditPersisted,
      ...(auditPersisted
        ? {}
        : {
            error:
              'The file was written, but the audit record could not be persisted to durable storage.',
          }),
    });
  }
  res.json(result);
});

app.post('/api/tools/fs/delete', (req: Request, res: Response) => {
  const { path: filePath } = req.body;
  if (!filePath) return res.status(400).json({ error: 'path is required' });
  const result = realFsDelete(filePath);
  if (result.success) {
    // Same durability rule as the write route: the deletion happened, but the
    // VERIFIED audit row is only real once it is on disk. Read it back and roll
    // a phantom row back instead of trusting `persistMemory()`'s boolean.
    const auditPersisted = recordDurableAuditRow({
      id: `log-fs-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      action: `Deleted Workspace Resource: "${filePath}"`,
      levelRequired: 3,
      approvedBy: 'HUMAN_OPERATOR',
      status: 'EXECUTED',
      verificationStatus: 'VERIFIED',
      finalTruthState: 'VERIFIED',
    });
    return res.json({
      ...result,
      auditPersisted,
      auditRecorded: auditPersisted,
      ...(auditPersisted
        ? {}
        : {
            error:
              'The resource was deleted, but the audit record could not be persisted to durable storage.',
          }),
    });
  }
  res.json(result);
});

// Real Git Tools APIs
app.post('/api/tools/git/status', (req: Request, res: Response) => {
  res.json(realGitStatus());
});

app.post('/api/tools/git/log', (req: Request, res: Response) => {
  const { count = 5 } = req.body;
  res.json(realGitLog(Number(count) || 5));
});

app.post('/api/tools/git/diff', (req: Request, res: Response) => {
  res.json(realGitDiff());
});

// Real GitHub Tools APIs
app.post('/api/tools/github/status', async (req: Request, res: Response) => {
  const status = await realGithubStatus();
  res.json(status);
});

app.post('/api/tools/github/repos', async (req: Request, res: Response) => {
  const repos = await realGithubRepos();
  res.json(repos);
});

app.post('/api/tools/github/create-issue', async (req: Request, res: Response) => {
  const { repo, title, body } = req.body;
  if (!repo || !title) {
    return res.status(400).json({ error: 'repo and title are required' });
  }
  const result = await realGithubCreateIssue(repo, title, body || '');
  res.json(result);
});

// Controlled Web Research API
app.post('/api/tools/web/fetch', async (req: Request, res: Response) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url is required' });
  const result = await realWebFetch(url);
  res.json(result);
});

// Real Email Status API
app.post('/api/tools/email/status', (req: Request, res: Response) => {
  res.json(realEmailStatus());
});

// ==============================================================================
// 8.5. COMPUTER OPERATOR & SCREEN RESEARCHER APIS
// ==============================================================================
app.post('/api/computer-operator/execute', async (req: Request, res: Response) => {
  try {
    const { objective, mode = 'hybrid' } = req.body;
    if (!objective) {
      return res.status(400).json({ error: 'Objective is required' });
    }
    const curEmergencyState = getEmergencyState();
    const task = await ComputerOperatorEngine.executeTask(objective, mode, curEmergencyState.emergencyPaused);
    // The engine returns terminal states other than COMPLETED — FAILED, BLOCKED,
    // NEEDS_APPROVAL, CANCELLED, or a run that never reached a terminal state.
    // A flat `success: true` here read every one of them as performed host work.
    res.json({
      success: operatorTaskExecuted(task),
      outcome: task.status,
      task,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/computer-operator/observe', async (req: Request, res: Response) => {
  try {
    const { preferredApp, includeScreenshot = true } = req.body;
    const observation = await ScreenObserver.observeScreen({ preferredApp, includeScreenshot });
    const interpretation = ScreenInterpreter.interpret(observation, preferredApp);
    // An illustrative view or an unreachable host still returns an observation,
    // so a flat `success: true` claimed the screen had been inspected when
    // nothing was read. The flag follows the same host-backed, non-ambiguous
    // predicate the `inspect_screen` chat reply uses, and `observed` names the
    // honest outcome.
    const observed = observationPerformed(observation, ScreenObserver.isHostBacked());
    res.json({ success: observed, observed, observation, interpretation });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/computer-operator/cancel', (req: Request, res: Response) => {
  try {
    const { reason = 'User requested stop' } = req.body;
    const result = TaskTracker.cancelActiveTask(reason);
    // A cancel only succeeded if a task was actually running; an idle tracker
    // returns cancelled:false and must not be reported as a successful stop.
    res.json({ success: result.cancelled, ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/computer-operator/tasks', (req: Request, res: Response) => {
  try {
    const tasks = TaskTracker.getRecentTasks();
    const active = TaskTracker.getActiveTask();
    res.json({ success: true, activeTaskId: active?.taskId, tasks });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/computer-operator/tasks/:id', (req: Request, res: Response) => {
  try {
    const task = TaskTracker.getTask(req.params.id);
    if (!task) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }
    res.json({ success: true, task });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Real Screenshot Capture API (backlog 8/9): captures through the OS, then
// verifies the file on disk before reporting anything.
app.post('/api/computer-operator/screenshot', async (req: Request, res: Response) => {
  try {
    const { label, directory, probeOnly } = req.body || {};
    const result = await captureScreenshot({ label, directory, probeOnly });

    const statusForOutcome: Record<string, number> = {
      VERIFIED: 200,
      NOT_AVAILABLE: 501,
      NOT_CONFIGURED: 503,
      PERMISSION_REQUIRED: 403,
      FAILED: 500,
    };

    res.status(statusForOutcome[result.receipt.outcome] || 500).json({
      success: result.receipt.outcome === 'VERIFIED',
      outcome: result.receipt.outcome,
      verified: result.receipt.verified,
      method: result.method,
      file: result.file,
      receipt: result.receipt,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, outcome: 'FAILED', error: err.message });
  }
});

// Executes a single computer action on the real host and returns its receipt.
app.post('/api/computer-operator/execute-action', async (req: Request, res: Response) => {
  try {
    const action = req.body?.action;
    if (!action || typeof action !== 'object' || !action.type) {
      return res.status(400).json({ success: false, outcome: 'FAILED', error: 'A computer action object is required.' });
    }

    const curEmergencyState = getEmergencyState();
    if (curEmergencyState.emergencyPaused) {
      return res.status(423).json({
        success: false,
        outcome: 'BLOCKED',
        error: 'Global Emergency Stop is active. No computer actions will be executed.',
      });
    }

    const execution = await hostActionExecutor.execute(action as ComputerAction);
    const statusForOutcome: Record<string, number> = {
      VERIFIED: 200,
      DISPATCHED: 202,
      BLOCKED: 403,
      PERMISSION_REQUIRED: 403,
      NOT_AVAILABLE: 501,
      NOT_CONFIGURED: 503,
      SIMULATION_ONLY: 501,
      FAILED: 500,
    };

    res.status(statusForOutcome[execution.receipt.outcome] || 500).json({
      success: execution.receipt.verified,
      outcome: execution.receipt.outcome,
      receipt: execution.receipt,
      output: execution.output,
      exitCode: execution.exitCode ?? null,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, outcome: 'FAILED', error: err.message });
  }
});

// Reports what this host can genuinely do, so the UI can disable what it cannot.
app.get('/api/computer-operator/host-capabilities', (_req: Request, res: Response) => {
  const host = describeHost();
  const operatorActions = hostActionCapabilities();
  res.json({
    success: true,
    host,
    captureAvailable: getCaptureAvailability(),
    operatorActions,
    screenshotRoot: resolveScreenshotRoot(),
    // Synthetic mouse/keyboard input is not wired up on any platform yet.
    syntheticInputAvailable: false,
  });
});

// ==============================================================================
// 8.5. GITHUB / PROJECT AUTOMATION APIs (backlog items 14-24)
// ==============================================================================

/** Resolves the token used for repository automation. */
function resolveGithubToken(): string {
  return (
    process.env.GITHUB_AUTOMATION_TOKEN ||
    process.env.GITHUB_TOKEN ||
    ''
  );
}

const githubFetchOptions = () => ({ token: resolveGithubToken() });

/** Approval queue backing /api/github/approvals. */
const githubApprovalQueue = new ApprovalQueue();

/** Lightweight nightly-run history, persisted in memory state. */
function getNightlyRuns(): NightlyRunRecord[] {
  const anyState = memoryState as unknown as { nightlyGithubRuns?: NightlyRunRecord[] };
  return anyState.nightlyGithubRuns ?? [];
}

/**
 * True only when the memory file on disk carries a nightly run with `runId`.
 * `persistMemory()` can return true without writing when the file already holds
 * the identical bytes, so the manual-run route must read the record back rather
 * than trust the boolean before reporting the run as recorded.
 */
function nightlyRunOnDisk(runId: string): boolean {
  try {
    const onDisk = JSON.parse(fs.readFileSync(MEMORY_FILE_PATH, 'utf-8'));
    const runs: NightlyRunRecord[] = Array.isArray(onDisk.nightlyGithubRuns)
      ? onDisk.nightlyGithubRuns
      : [];
    return runs.some((r) => r?.runId === runId);
  } catch {
    return false;
  }
}

/**
 * Record a nightly-run history entry and report whether it reached disk. Like
 * the audit log, `persistMemory()` can return true without writing, so the
 * record is read back with `nightlyRunOnDisk`; when the write did not land the
 * run is dropped from the in-memory history so the process never reports a run
 * the next boot will not have.
 */
function recordNightlyRun(record: NightlyRunRecord): boolean {
  const anyState = memoryState as unknown as { nightlyGithubRuns?: NightlyRunRecord[] };
  const runs = [record, ...(anyState.nightlyGithubRuns ?? [])].slice(0, 30);
  anyState.nightlyGithubRuns = runs;
  if (persistMemory() && nightlyRunOnDisk(record.runId)) return true;
  anyState.nightlyGithubRuns = runs.filter((r) => r.runId !== record.runId);
  return false;
}

// Reports whether GitHub automation is usable, without making a network call.
app.get('/api/github/status', (_req: Request, res: Response) => {
  const token = githubTokenStatus(resolveGithubToken());
  const runs = getNightlyRuns();
  const history = nightlyHistory(runs, DEFAULT_NIGHTLY_CONFIG);
  res.json({
    success: true,
    configured: token.configured,
    reason: token.reason,
    nightly: {
      schedule: `${String(DEFAULT_NIGHTLY_CONFIG.hour).padStart(2, '0')}:${String(DEFAULT_NIGHTLY_CONFIG.minute).padStart(2, '0')} local`,
      nextRunAt: history.nextRunAt,
      lastRunAt: history.lastRunAt,
      missedRun: history.missedRun,
      runCount: runs.length,
    },
    protectedBranches: Array.from(PROTECTED_BRANCH_NAMES),
    // A push or PR is only ever permitted after an explicit human approval.
    humanApprovalRequired: true,
  });
});

// Discovers repositories the configured token can reach.
app.get('/api/github/repositories', async (_req: Request, res: Response) => {
  try {
    const result = await listRepositories(githubFetchOptions());
    const statusForOutcome: Record<string, number> = {
      VERIFIED: 200,
      NOT_CONFIGURED: 503,
      FAILED: 502,
    };
    res.status(statusForOutcome[result.receipt.outcome] || 200).json({
      success: result.receipt.verified,
      outcome: result.receipt.outcome,
      count: result.repos.length,
      repositories: result.repos,
      receipt: result.receipt,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, outcome: 'FAILED', error: err.message });
  }
});

// Scans one repository or every reachable repository.
app.post('/api/github/scan', async (req: Request, res: Response) => {
  try {
    const { repository, all } = req.body || {};
    const options = githubFetchOptions();

    if (!all && typeof repository === 'string' && repository.trim()) {
      const scan = await scanRepository(repository.trim(), options);
      return res.status(scan.reachable ? 200 : 502).json({
        success: scan.reachable,
        outcome: scan.receipt.outcome,
        scan,
        receipt: scan.receipt,
      });
    }

    const result = await scanAllRepositories(options);
    const statusForOutcome: Record<string, number> = {
      VERIFIED: 200,
      DISPATCHED: 200,
      NOT_CONFIGURED: 503,
      FAILED: 502,
    };
    res.status(statusForOutcome[result.receipt.outcome] || 200).json({
      success: result.receipt.verified,
      outcome: result.receipt.outcome,
      reachableCount: result.reachableCount,
      unreachableCount: result.unreachableCount,
      reposWithFailingCi: result.reposWithFailingCi,
      reposWithOpenPrs: result.reposWithOpenPrs,
      scans: result.scans.map((s) => ({
        fullName: s.fullName,
        reachable: s.reachable,
        reason: s.reason,
        defaultBranch: s.defaultBranch,
        headSha: s.headSha,
        headCommitMessage: s.headCommitMessage,
        headCommitAgeHours: s.headCommitAgeHours,
        openPullRequests: s.openPullRequests,
        failingWorkflowRuns: s.failingWorkflowRuns,
        abortedWorkflowRuns: s.abortedWorkflowRuns,
        ciConfigured: s.ciConfigured,
        unmergedBranchCount: s.unmergedBranchCount,
        outcome: s.receipt.outcome,
      })),
      receipt: result.receipt,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, outcome: 'FAILED', error: err.message });
  }
});

// Runs the real lint/test/build checks against this checkout.
app.post('/api/github/health-check', async (req: Request, res: Response) => {
  try {
    const requested = Array.isArray(req.body?.checks) ? (req.body.checks as string[]) : undefined;
    const valid: CheckKind[] = ['lint', 'test', 'build'];
    const checks = requested
      ? (requested.filter((c): c is CheckKind => valid.includes(c as CheckKind)))
      : undefined;

    if (requested && (!checks || checks.length === 0)) {
      return res.status(400).json({
        success: false,
        outcome: 'FAILED',
        error: `checks must be a non-empty subset of: ${valid.join(', ')}`,
      });
    }

    const report = await runHealthChecks({
      workspace: req.body?.workspace || process.cwd(),
      checks,
      timeoutMs: typeof req.body?.timeoutMs === 'number' ? req.body.timeoutMs : undefined,
    });

    res.status(report.receipt.outcome === 'NOT_CONFIGURED' ? 503 : 200).json({
      success: report.allPassed,
      outcome: report.receipt.outcome,
      allPassed: report.allPassed,
      checks: report.checks.map((c) => ({
        kind: c.kind,
        command: c.command,
        passed: c.passed,
        exitCode: c.exitCode,
        durationMs: c.durationMs,
        timedOut: c.timedOut,
        notConfiguredReason: c.notConfiguredReason,
        stdoutTail: c.stdoutTail,
        stderrTail: c.stderrTail,
      })),
      lint: report.lint,
      tests: report.tests,
      buildErrors: report.buildErrors,
      receipt: report.receipt,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, outcome: 'FAILED', error: err.message });
  }
});

// Produces a reviewable fix plan from real scan and health signals.
app.post('/api/github/fix-plan', async (req: Request, res: Response) => {
  try {
    const { repository, includeLocalHealth } = req.body || {};
    const options = githubFetchOptions();

    let multiRepoScan;
    if (typeof repository === 'string' && repository.trim()) {
      const scan = await scanRepository(repository.trim(), options);
      multiRepoScan = {
        scans: [scan],
        reachableCount: scan.reachable ? 1 : 0,
        unreachableCount: scan.reachable ? 0 : 1,
        reposWithFailingCi: (scan.failingWorkflowRuns?.length ?? 0) > 0 ? [scan.fullName] : [],
        reposWithOpenPrs: (scan.openPullRequests?.length ?? 0) > 0 ? [scan.fullName] : [],
        scannedAt: scan.scannedAt,
        receipt: scan.receipt,
      };
    } else {
      multiRepoScan = await scanAllRepositories(options);
    }

    const localHealth = includeLocalHealth
      ? await runHealthChecks({ workspace: process.cwd(), checks: ['lint', 'test'] })
      : undefined;

    // `nothingToDo` from the planner only knows about the steps it could build.
    // A scan that returned no repositories — or returned every repository
    // unreachable — produces zero steps and would be reported as an all-clear
    // the plan never established. Reconcile the flag with the real coverage.
    const coverage = assessFixPlanCoverage({ multiRepoScan, localHealth });
    const { plan } = reconcileFixPlanWithCoverage(
      buildFixPlan({ multiRepoScan, localHealth }),
      coverage
    );

    res.json({
      success: true,
      outcome: plan.receipt.outcome,
      nothingToDo: plan.nothingToDo,
      highestRisk: plan.highestRisk,
      requiresCodeChange: plan.requiresCodeChange,
      steps: plan.steps,
      coverage,
      receipt: plan.receipt,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, outcome: 'FAILED', error: err.message });
  }
});

// Lists pending human approvals, and lets a human decide one.
app.get('/api/github/approvals', (_req: Request, res: Response) => {
  res.json({
    success: true,
    pending: githubApprovalQueue.listPending(),
    history: githubApprovalQueue.list().filter((a) => a.state !== 'PENDING').slice(0, 50),
  });
});

app.post('/api/github/approvals/:id/decision', (req: Request, res: Response) => {
  const { approved, decidedBy, reason } = req.body || {};
  if (typeof approved !== 'boolean') {
    return res.status(400).json({ success: false, error: 'approved must be a boolean.' });
  }
  if (!decidedBy || typeof decidedBy !== 'string' || !decidedBy.trim()) {
    return res.status(400).json({
      success: false,
      error: 'decidedBy is required: an approval must carry the name of the human who gave it.',
    });
  }

  const before = githubApprovalQueue.get(req.params.id);
  const updated = githubApprovalQueue.decide(req.params.id, approved, decidedBy.trim(), reason);
  // `decide` returns the record unchanged for an id that is already settled or
  // expired, so a duplicate or late click previously re-reported success and
  // logged a decision it did not make. Classify from the state transition.
  const verdict = classifyApprovalDecision(before?.state ?? null, updated?.state ?? null);
  if (verdict.outcome === 'NOT_FOUND') {
    return res.status(404).json({ success: false, error: verdict.message });
  }
  if (!verdict.recorded) {
    return res.json({
      success: false,
      recorded: false,
      outcome: verdict.outcome,
      approval: updated,
      error: verdict.message,
    });
  }

  // The decision is only real once its audit row is durable. `addAuditLog`
  // routes through the durable writer, which reads the row back from disk
  // (`persistMemory()` can return true without writing when the file already
  // holds identical bytes) and drops a phantom row on a non-durable write. The
  // route previously discarded that verdict and always answered
  // `{ success: true, recorded: true }`, so a read-only volume or full disk
  // reported a recorded human approval the next boot would not have. Gate the
  // success reply on the durable write.
  const auditRecorded = addAuditLog(
    `${approved ? 'APPROVED' : 'REJECTED'} GitHub automation action "${updated!.summary}" (${updated!.id}) by ${decidedBy}`,
    4,
    decidedBy.trim(),
    approved ? 'VERIFIED' : 'BLOCKED'
  );

  if (!auditRecorded) {
    return res.status(500).json({
      success: false,
      recorded: false,
      outcome: verdict.outcome,
      persisted: false,
      approval: updated,
      error: 'The decision could not be written to durable storage; it was not recorded.',
    });
  }

  res.json({ success: true, recorded: true, persisted: true, outcome: verdict.outcome, approval: updated });
});

// Reports the nightly schedule and recent runs.
app.get('/api/github/nightly', (_req: Request, res: Response) => {
  const runs = getNightlyRuns();
  const history = nightlyHistory(runs, DEFAULT_NIGHTLY_CONFIG);
  res.json({
    success: true,
    schedule: DEFAULT_NIGHTLY_CONFIG,
    nextRunAt: history.nextRunAt,
    lastRunAt: history.lastRunAt,
    missedRun: history.missedRun,
    runs,
  });
});

// Runs the nightly check immediately. Read-only: it scans and plans, never edits.
app.post('/api/github/nightly/run', async (_req: Request, res: Response) => {
  try {
    const result = await runNightlyCheck({ github: githubFetchOptions() });
    // Consume the durability verdict: on a read-only volume or a full disk the
    // run-history write never lands, so the caller must not be told the run was
    // recorded when the next boot would not find it.
    const runRecorded = recordNightlyRun(result.record);

    addAuditLog(
      `GitHub nightly check ${result.record.outcome}: ${result.record.scannedRepositories} scanned, ${result.record.reposWithFailingCi.length} with failing CI, ${result.record.plannedSteps} planned step(s)`,
      1,
      'AUTOMATED_SCHEDULE',
      result.record.outcome === 'COMPLETED' ? 'VERIFIED' : 'FAILED'
    );

    res.status(result.receipt.verified || result.record.outcome === 'COMPLETED' ? 200 : 502).json({
      success: result.record.outcome === 'COMPLETED',
      outcome: result.receipt.outcome,
      recorded: runRecorded,
      record: result.record,
      plan: result.plan
        ? {
            stepCount: result.plan.steps.length,
            highestRisk: result.plan.highestRisk,
            requiresCodeChange: result.plan.requiresCodeChange,
            steps: result.plan.steps,
          }
        : undefined,
      receipt: result.receipt,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, outcome: 'FAILED', error: err.message });
  }
});

// ==============================================================================
// 8.6. YOUTUBE TRANSCRIPT EXTRACTION & AUTONOMOUS SUMMARIZER APIs
// ==============================================================================
interface YouTubeSummaryFailure {
  success: false;
  error: string;
}

async function summarizeYouTubeVideoCore(options: {
  url?: string;
  videoId?: string;
  detailLevel?: 'concise' | 'balanced' | 'detailed';
  language?: string;
}): Promise<YouTubeSummaryResult | YouTubeSummaryFailure> {
  const target = (options.url || options.videoId || '').trim();
  if (!target) {
    return {
      success: false,
      error: 'Please provide a valid YouTube URL (e.g., https://www.youtube.com/watch?v=...) or Video ID.',
    };
  }

  const transcriptRes = await fetchYouTubeTranscriptData(target, options.language || 'en');

  if (!transcriptRes.success || !transcriptRes.videoInfo) {
    return {
      success: false,
      error: transcriptRes.error || 'Unable to fetch video details or transcript from YouTube.',
    };
  }

  const { videoInfo, transcript = '', segments = [] } = transcriptRes;
  const ai = getGenAI();

  if (ai) {
    try {
      const systemInstruction = `You are HERMES JARVIS Autonomous AI Video Intelligence, running on a 24/7 Oracle ARM Cloud Node.
Your task is to analyze and summarize the provided YouTube video transcript and metadata.
Provide a clear, high-density, structured, and insightful synthesis for the user.

Format Output with these exact markdown sections:
### 📌 Executive Overview
(2-3 sentences explaining core premise, context, and the creator's key thesis)

### ⏱️ Key Takeaways & Milestones
(5-8 high-impact bullet points highlighting core insights, milestones, or timestamps)

### 📝 Comprehensive Synthesis
(Thorough explanation of core arguments, technical mechanisms, and findings)

### 💡 Actionable Insights & Practical Value
(Practical steps or key learnings the viewer should retain)`;

      const prompt = `Please summarize this YouTube Video:
Title: ${videoInfo.title}
Creator/Channel: ${videoInfo.channel}
Duration: ${videoInfo.durationFormatted}
URL: ${videoInfo.url}
Preferred Language: ${options.language || 'English'}
Detail Level: ${options.detailLevel || 'balanced'}

--- TRANSCRIPT / CONTENT ---
${transcript.slice(0, 35000)}
--- END TRANSCRIPT ---`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
        config: {
          systemInstruction,
          temperature: 0.35,
          maxOutputTokens: 1400,
        },
      });

      const rawSummary = response.text?.trim() || '';
      const result = buildYouTubeSummary({
        videoInfo,
        segments,
        transcript,
        description: videoInfo.description || '',
        geminiRawSummary: rawSummary,
      });
      if (!result.summary) {
        // Generation returned nothing usable — fall through to the honest path.
        throw new Error('Gemini returned an empty summary');
      }

      pushAuditEntry({
        id: `log-yt-${Date.now()}`,
        timestamp: new Date().toISOString(),
        action: `🎥 Summarized YouTube Video: "${videoInfo.title}" (${videoInfo.channel}) via Gemini 2.5 Flash`,
        levelRequired: 2,
        approvedBy: 'JARVIS_AUTONOMOUS_RESEARCH',
        status: 'EXECUTED',
        verificationStatus: 'VERIFIED',
        finalTruthState: 'VERIFIED',
      });
      persistMemory();

      return result;
    } catch (geminiErr: any) {
      console.warn('[YouTube Summarize] Gemini API notice, falling back to extractive mode:', geminiErr?.message);
    }
  }

  // Extractive fallback — quotes only what the transcript/description actually
  // contains. It never invents content, and when there is nothing to quote the
  // result reports PARTIAL with an empty summary rather than a fabricated one.
  const geminiConfigured = Boolean(ai);
  const result = buildYouTubeSummary({
    videoInfo,
    segments,
    transcript,
    description: videoInfo.description || '',
    geminiRawSummary: null,
    geminiFailed: geminiConfigured,
  });

  pushAuditEntry({
    id: `log-yt-${Date.now()}`,
    timestamp: new Date().toISOString(),
    action: result.source === 'extractive'
      ? `🎥 Extracted key lines for YouTube video: "${videoInfo.title}" (no AI synthesis applied)`
      : `🎥 YouTube summarization for "${videoInfo.title}" produced no content (no transcript or description available)`,
    levelRequired: 2,
    approvedBy: 'JARVIS_AUTONOMOUS_RESEARCH',
    status: 'EXECUTED',
    verificationStatus: result.verificationStatus === 'VERIFIED'
      ? 'VERIFIED'
      : geminiConfigured
        ? 'PROVIDER_ERROR'
        : 'MISSING_CREDENTIALS',
    finalTruthState: result.verificationStatus === 'VERIFIED' ? 'VERIFIED' : 'PARTIAL',
  });
  persistMemory();

  return result;
}

// REST APIs for YouTube Summarizer
app.post('/api/tools/youtube/summarize', async (req: Request, res: Response) => {
  try {
    const { url, videoId, detailLevel = 'balanced', language = 'en' } = req.body;
    const result = await summarizeYouTubeVideoCore({ url, videoId, detailLevel, language });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'YouTube summarization failed' });
  }
});

app.post('/api/tools/youtube/transcript', async (req: Request, res: Response) => {
  try {
    const { url, videoId, language = 'en' } = req.body;
    const target = (url || videoId || '').trim();
    if (!target) {
      return res.status(400).json({ success: false, error: 'url or videoId is required' });
    }
    const result = await fetchYouTubeTranscriptData(target, language);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to fetch transcript' });
  }
});

// ==============================================================================
// 7.5 PUBLIC LEGAL & GOOGLE OAUTH COMPLIANCE ROUTES
// ==============================================================================
app.get(['/privacy', '/privacy-policy'], (req: Request, res: Response) => {
  const protocol = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
  const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || '';
  const baseUrl = host ? `${protocol}://${host}` : '';
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(renderPrivacyPolicyHtml(baseUrl));
});

app.get(['/terms', '/terms-of-service'], (req: Request, res: Response) => {
  const protocol = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
  const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || '';
  const baseUrl = host ? `${protocol}://${host}` : '';
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(renderTermsOfServiceHtml(baseUrl));
});

// Memory API
app.get('/api/memory', (req: Request, res: Response) => {
  res.json({
    name: memoryState.name,
    notes: memoryState.notes,
    customKeyValues: memoryState.customKeyValues,
    stats: memoryState.stats,
  });
});

/**
 * Reconcile an offline snapshot with the server. Returns the merged result and
 * every conflict that was detected, so the client can show a human what was
 * kept from each side instead of silently overwriting.
 */
app.post('/api/memory/sync', (req: Request, res: Response) => {
  try {
    const local = req.body?.local;
    if (!local || typeof local !== 'object') {
      return res.status(400).json({ success: false, error: 'A local memory snapshot is required.' });
    }

    const remote = {
      name: memoryState.name,
      notes: memoryState.notes,
      customKeyValues: memoryState.customKeyValues,
    };

    const result = mergeMemorySnapshots(
      {
        name: local.name,
        notes: Array.isArray(local.notes) ? local.notes : [],
        customKeyValues: local.customKeyValues || {},
        keyTimestamps: local.keyTimestamps,
      },
      remote,
    );

    // Only merge what the resolver accepted. Conflicts are reported, never
    // silently applied over the authoritative server copy.
    const verdict = classifyMemorySync(result, remote);

    // Snapshot the pre-change values so a failed disk write can be rolled back
    // rather than reported as a completed sync.
    const before = {
      name: memoryState.name,
      notes: memoryState.notes,
      customKeyValues: memoryState.customKeyValues,
    };

    memoryState.notes = result.merged.notes;
    // A name that differs on both sides is a flagged conflict, not a value to
    // write. Applying it here overwrote the authoritative name while the
    // response still reported it as merged — a silent overwrite read as success.
    if (verdict.nameApplied) memoryState.name = result.merged.name as string;
    memoryState.customKeyValues = result.merged.customKeyValues;

    // The merge is only real once it is on disk; a write failure must not read
    // as a completed sync.
    if (!persistMemory()) {
      memoryState.name = before.name;
      memoryState.notes = before.notes;
      memoryState.customKeyValues = before.customKeyValues;
      return res.status(500).json({
        success: false,
        stored: false,
        persisted: false,
        outcome: verdict.outcome,
        error: 'Memory sync could not be written to durable storage; the merge was not saved.',
      });
    }

    res.json({
      success: true,
      persisted: true,
      stored: verdict.stored,
      nameApplied: verdict.nameApplied,
      outcome: verdict.outcome,
      message: verdict.message,
      merged: {
        name: memoryState.name,
        notes: memoryState.notes,
        customKeyValues: memoryState.customKeyValues,
      },
      conflicts: result.conflicts,
      requiresAttention: verdict.requiresAttention,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Memory sync failed' });
  }
});

// ==============================================================================
// AUTONOMOUS GOAL RUNNER (backlog items 40-45)
// ==============================================================================

export interface ScheduledGoalSpec {
  id: string;
  name: string;
  atMinuteOfDay: number;
  steps: Array<Record<string, unknown>>;
  requiresApproval?: boolean;
  enabled: boolean;
}

/**
 * Recurring autonomous goals. Restored from the persisted memory file at
 * startup: an operator-registered task must survive a restart, otherwise the
 * register route would be reporting success for a task the process drops.
 * Nothing runs on a schedule until the operator registers something.
 */
let scheduledGoals: ScheduledGoalSpec[] = [];
const scheduledGoalRuns: ScheduledGoalRecord[] = [];

/** Minimal shape check for a persisted goal, so a corrupt file cannot crash boot. */
function isPersistedGoal(value: unknown): value is ScheduledGoalSpec {
  if (!value || typeof value !== 'object') return false;
  const g = value as Record<string, unknown>;
  return (
    typeof g.id === 'string' &&
    typeof g.name === 'string' &&
    typeof g.atMinuteOfDay === 'number' &&
    Array.isArray(g.steps)
  );
}

/**
 * Reconcile the in-memory registry with what is on disk. Called after the
 * memory file is loaded. Goals present in memory but absent on disk are pushed
 * to disk, so a task registered before this feature existed is persisted too.
 */
function loadScheduledGoals(): void {
  const persisted = memoryState.schedulerState?.scheduledGoals;
  const restored = Array.isArray(persisted) ? persisted.filter(isPersistedGoal) : [];
  const byId = new Map<string, ScheduledGoalSpec>();
  for (const goal of restored) byId.set(goal.id, goal);
  for (const goal of scheduledGoals) byId.set(goal.id, goal);
  scheduledGoals = Array.from(byId.values());
  memoryState.schedulerState.scheduledGoals = scheduledGoals;
}

/** Persist the current registry. Returns whether the state actually reached disk. */
function persistScheduledGoals(): boolean {
  memoryState.schedulerState.scheduledGoals = scheduledGoals;
  return persistMemory();
}

// memoryState is already loaded by this point; restore the operator's schedule
// so a restart does not silently drop registered tasks.
loadScheduledGoals();

/** Bounded in-memory audit trail of autonomous runs, newest first. */
const goalRunHistory: Array<{
  goal: string;
  outcome: ExecutionOutcome;
  verified: boolean;
  steps: Array<{ id: string; status: string; detail: string }>;
  audit: unknown[];
  startedAt: string;
  finishedAt: string;
}> = [];

app.get('/api/autonomous/goals', (req: Request, res: Response) => {
  res.json({
    success: true,
    runs: goalRunHistory.slice(0, 20),
  });
});

/**
 * Run a goal through the plan → execute → verify loop.
 *
 * Steps are supplied by the caller as declarative descriptors. Only a small set
 * of built-in, verifiable step kinds is accepted: an arbitrary code payload from
 * the network is never executed. A step that needs approval pauses the run and
 * reports `awaitingApproval` instead of proceeding.
 */
app.post('/api/autonomous/goals/run', async (req: Request, res: Response) => {
  const goal = typeof req.body?.goal === 'string' ? req.body.goal.trim() : '';
  if (!goal) {
    return res.status(400).json({ success: false, error: 'A goal description is required.' });
  }

  if (emergencyActive()) {
    bridgeGateway.recordAudit('ACTION_DENIED', 'Autonomous goal blocked by Global Kill Switch', 'BLOCKED');
    return res.status(423).json({
      success: false,
      outcome: 'BLOCKED',
      error: 'Global Kill Switch is active. Autonomous execution is frozen.',
    });
  }

  const requestedSteps = Array.isArray(req.body?.steps) ? req.body.steps : [];
  if (requestedSteps.length === 0) {
    return res.status(400).json({ success: false, error: 'At least one step is required.' });
  }

  const { buildGoalSteps } = await import('./src/utils/autonomous/stepLibrary');
  const { steps, rejected } = buildGoalSteps(requestedSteps);
  if (rejected.length > 0) {
    return res.status(400).json({
      success: false,
      outcome: 'BLOCKED',
      error: `Unsupported step kind(s): ${rejected.join(', ')}`,
      supported: 'See GET /api/autonomous/goals/step-kinds',
    });
  }

  const startedAt = new Date().toISOString();
  const runner = new AutonomousGoalRunner({
    // Approval must arrive from the request, and must name the approver. An
    // anonymous `approved: true` is not a human decision.
    approve: req.body?.approver
      ? () => req.body?.approved === true
      : undefined,
  });

  const result = await runner.run(goal, steps);
  const finishedAt = new Date().toISOString();

  if (result.verified) {
    memoryState.stats.actionsExecuted += 1;
  }

  goalRunHistory.unshift({
    goal,
    outcome: result.outcome,
    verified: result.verified,
    steps: result.steps.map((s) => ({ id: s.id, status: s.status, detail: s.detail })),
    audit: result.audit,
    startedAt,
    finishedAt,
  });
  if (goalRunHistory.length > 50) goalRunHistory.length = 50;

  // The completion audit row is the durable record of the run. `addAuditLog`
  // routes through the durable writer and returns whether the row reached disk;
  // this route used to append the row, discard that verdict, and call a bare
  // `persistMemory()` whose boolean nobody read — so a write that never landed
  // (read-only volume, full disk) was still reported to the caller as recorded.
  // Surface the durability of the audit row instead of hiding it.
  const auditPersisted = addAuditLog(
    `Autonomous goal "${goal}" finished ${result.outcome} (${result.steps.filter((s) => s.status === 'DONE').length}/${result.steps.length} steps)`,
    2,
    req.body?.approver ? `HUMAN:${String(req.body.approver).slice(0, 40)}` : 'AUTONOMOUS',
    result.outcome === 'VERIFIED' ? 'VERIFIED' : result.outcome === 'FAILED' ? 'FAILED' : 'PENDING'
  );

  return res.json({
    success: result.verified,
    goal,
    outcome: result.outcome,
    verified: result.verified,
    awaitingApproval: result.awaitingApproval ?? false,
    persisted: auditPersisted,
    steps: result.steps,
    audit: result.audit,
    receipt: result.receipt,
  });
});

app.get('/api/autonomous/goals/step-kinds', async (_req: Request, res: Response) => {
  const { SUPPORTED_STEP_KINDS } = await import('./src/utils/autonomous/stepLibrary');
  res.json({ success: true, kinds: SUPPORTED_STEP_KINDS });
});

// ==============================================================================
// SCHEDULED AUTONOMOUS TASKS (backlog item 43)
// ==============================================================================

app.get('/api/autonomous/schedule', (req: Request, res: Response) => {
  const lastRuns = (memoryState.schedulerState as unknown as {
    lastAutonomousGoalRuns?: Record<string, string>;
  }).lastAutonomousGoalRuns || {};
  const istParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const part = (type: string) => istParts.find((p) => p.type === type)?.value || '0';
  const clock = {
    minuteOfDay: Number(part('hour')) * 60 + Number(part('minute')),
    date: `${part('year')}-${part('month')}-${part('day')}`,
  };

  res.json({
    success: true,
    timezone: 'Asia/Kolkata',
    goals: scheduledGoals.map((g) => {
      const { nextRunAt, missedRun } = nextScheduledOccurrence(
        g as ScheduledGoal,
        lastRuns[g.id],
        clock
      );
      return { ...g, lastRunDate: lastRuns[g.id] || null, nextRunAt, missedRun };
    }),
    runs: scheduledGoalRuns.slice(0, 20),
  });
});

app.post('/api/autonomous/schedule', (req: Request, res: Response) => {
  const id = typeof req.body?.id === 'string' ? req.body.id.trim() : '';
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const atMinuteOfDay = Number(req.body?.atMinuteOfDay);

  if (!id || !name) {
    return res.status(400).json({ success: false, error: 'id and name are required.' });
  }
  if (!Number.isInteger(atMinuteOfDay) || atMinuteOfDay < 0 || atMinuteOfDay > 1439) {
    return res.status(400).json({
      success: false,
      error: 'atMinuteOfDay must be an integer between 0 and 1439.',
    });
  }
  if (!Array.isArray(req.body?.steps) || req.body.steps.length === 0) {
    return res.status(400).json({ success: false, error: 'At least one step is required.' });
  }

  const spec: ScheduledGoalSpec = {
    id,
    name,
    atMinuteOfDay,
    steps: req.body.steps,
    requiresApproval: req.body?.requiresApproval === true,
    enabled: req.body?.enabled !== false,
  };

  const existing = scheduledGoals.findIndex((g) => g.id === id);
  const previous = existing >= 0 ? scheduledGoals[existing] : undefined;
  if (existing >= 0) scheduledGoals[existing] = spec;
  else scheduledGoals.push(spec);

  // Success must mean the task is durable, not merely held in this process's
  // memory. Report failure (and roll back) when the registry cannot be written.
  const persisted = persistScheduledGoals();
  if (!persisted) {
    if (existing >= 0 && previous) scheduledGoals[existing] = previous;
    else if (existing < 0) scheduledGoals.pop();
    memoryState.schedulerState.scheduledGoals = scheduledGoals;
    return res.status(500).json({
      success: false,
      persisted: false,
      error: 'Scheduled task could not be written to durable storage; it was not registered.',
    });
  }

  // The audit row is part of the registration's durable record. A row that
  // never reached disk means the task's provenance is gone on the next boot, so
  // report failure and roll the registry entry back rather than claiming a
  // registration whose audit trail cannot be kept.
  const auditPersisted = addAuditLog(
    `Scheduled autonomous task "${name}" (${id}) ${existing >= 0 ? 'updated' : 'registered'} to run daily at minute ${atMinuteOfDay}`,
    3,
    'HUMAN_OPERATOR',
    'VERIFIED'
  );
  if (!auditPersisted) {
    if (existing >= 0 && previous) scheduledGoals[existing] = previous;
    else if (existing < 0) scheduledGoals.pop();
    memoryState.schedulerState.scheduledGoals = scheduledGoals;
    persistScheduledGoals();
    return res.status(500).json({
      success: false,
      persisted: false,
      error: 'The registration audit trail could not be written to durable storage; the task was not registered.',
    });
  }

  res.status(existing >= 0 ? 200 : 201).json({ success: true, persisted: true, goal: spec });
});

app.delete('/api/autonomous/schedule/:id', (req: Request, res: Response) => {
  const index = scheduledGoals.findIndex((g) => g.id === req.params.id);
  if (index < 0) {
    return res.status(404).json({ success: false, error: 'No such scheduled task.' });
  }
  const [removed] = scheduledGoals.splice(index, 1);
  // The removal is only real once it is durable. Restore the task and fail if
  // the registry cannot be written.
  const persisted = persistScheduledGoals();
  if (!persisted) {
    scheduledGoals.splice(index, 0, removed);
    memoryState.schedulerState.scheduledGoals = scheduledGoals;
    return res.status(500).json({
      success: false,
      persisted: false,
      error: 'Scheduled task could not be removed from durable storage; it is still registered.',
    });
  }
  // The removal itself is already durable (checked above). The audit row is the
  // provenance for it; when that row cannot reach disk the removal still holds,
  // so report `auditRecorded` truthfully rather than dropping the boolean and
  // implying the trail was written.
  const auditRecorded = addAuditLog(
    `Scheduled autonomous task "${removed.name}" (${removed.id}) removed`,
    3,
    'HUMAN_OPERATOR',
    'VERIFIED'
  );
  res.json({ success: true, persisted: true, auditRecorded, removed: removed.id });
});

// Mobile Personal Status & Morning Briefing Telemetry Endpoints
app.get('/api/mobile/telemetry', (req: Request, res: Response) => {
  const device = bridgeGateway.getDevice();
  res.json({
    success: true,
    serverTime: new Date().toISOString(),
    // Ambient weather has no source in this process. It used to return a fixed
    // temperature/humidity snapshot labelled 'New Delhi' that callers could read
    // as a live reading; the absence is reported explicitly instead.
    weatherSnapshot: {
      available: false,
      reason: 'No weather source is connected to this server process.',
    },
    systemScheduler: {
      ...schedulerTruth(
        (memoryState.schedulerState as { lastMorningRunDate?: string }).lastMorningRunDate,
        scheduledGoals.length
      ),
    },
    privacyMatrix: {
      ...privacyMatrixTruth(securityMatrixState.humanApprovalForExternal, [
        'battery',
        'weather',
        'notifications',
        'calendar',
        'email',
        'device_health',
      ]),
    },
    connectedDevice: device ? { deviceId: device.deviceId, model: device.model } : null,
  });
});

app.post('/api/mobile/briefing/generate', async (req: Request, res: Response) => {
  try {
    const { language = 'hindi', mobileData } = req.body;
    const ai = getGenAI();

    if (ai && mobileData) {
      try {
        const prompt = `You are HERMES JARVIS. Generate a crisp, articulate, high-density ${language === 'hindi' ? 'Hindi / Hinglish' : 'English'} Morning Briefing for Sir.
Current time: ${new Date().toLocaleTimeString('hi-IN', { hour: '2-digit', minute: '2-digit' })}.
Mobile telemetry data:
- Battery: ${mobileData.battery?.levelPercent != null ? `${mobileData.battery.levelPercent}% (${mobileData.battery?.isCharging ? 'Charging' : 'Discharging'})` : 'not reported by device'}
- Weather: ${mobileData.weather?.temperatureC != null ? `${mobileData.weather.temperatureC}°C, ${mobileData.weather?.condition ?? 'condition not reported'}` : 'not reported by device'}
- Notifications: ${mobileData.notifications?.unreadCount != null ? `${mobileData.notifications.unreadCount} unread` : 'not reported by device'}
- Calendar: ${mobileData.calendar?.todayEventsCount != null ? `${mobileData.calendar.todayEventsCount} events today` : 'not reported by device'}
- Email: ${mobileData.email?.unreadCount != null ? `${mobileData.email.unreadCount} important unread` : 'not reported by device'}
- Cloud Node: not probed by this server — do not claim it is online.

Use only the values above. If a field says "not reported by device", say the figure is unavailable; never substitute a plausible number.

Keep it respectful, crisp (3-5 short sentences), in authentic conversational Hindi/Hinglish (e.g. "सुप्रभात सर..."), or concise English if language is english.`;

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
        });

        const generatedText = response.text?.trim();
        if (generatedText) {
          return res.json({
            success: true,
            spokenText: generatedText,
            source: 'gemini-2.5-flash',
            timestamp: new Date().toISOString(),
          });
        }
      } catch (err: any) {
        console.warn('[Briefing Gen] AI generation warning, using fallback:', err.message);
      }
    }

    // Default bilingual briefing fallback. Reports only what the device actually
    // sent; absent fields are named as unavailable instead of defaulted.
    const batteryLvl = mobileData?.battery?.levelPercent;
    const temp = mobileData?.weather?.temperatureC;
    const notifs = mobileData?.notifications?.unreadCount;
    const cal = mobileData?.calendar?.todayEventsCount;
    const mail = mobileData?.email?.unreadCount;
    const anyTelemetry = [batteryLvl, temp, notifs, cal, mail].some((v) => v != null);

    if (!anyTelemetry) {
      const spokenText = language === 'hindi'
        ? `सुप्रभात सर। इस समय कोई मोबाइल डिवाइस जुड़ा नहीं है, इसलिए बैटरी, मौसम, notifications, कैलेंडर और ईमेल का डेटा उपलब्ध नहीं है।`
        : `Good morning, Sir. No mobile device is currently connected, so battery, weather, notification, calendar and email data are unavailable.`;
      return res.json({
        success: true,
        spokenText,
        source: 'autonomous_local_engine',
        timestamp: new Date().toISOString(),
      });
    }

    const spokenText = language === 'hindi'
      ? `सुप्रभात सर। ${batteryLvl != null ? `आपके मोबाइल की बैटरी ${batteryLvl} प्रतिशत है। ` : 'बैटरी डेटा उपलब्ध नहीं है। '}${temp != null ? `तापमान ${temp} डिग्री है। ` : 'मौसम डेटा उपलब्ध नहीं है। '}${notifs != null ? `${notifs} notifications, ` : ''}${cal != null ? `${cal} शेड्यूल्ड मीटिंग्स, ` : ''}${mail != null ? `और ${mail} नए ईमेल्स पेंडिंग हैं।` : ''}`
      : `Good morning, Sir. ${batteryLvl != null ? `Your device battery is at ${batteryLvl} percent. ` : 'Battery data is unavailable. '}${temp != null ? `The temperature is ${temp} degrees. ` : 'Weather data is unavailable. '}${notifs != null ? `${notifs} notifications, ` : ''}${cal != null ? `${cal} calendar events, ` : ''}${mail != null ? `and ${mail} emails are waiting.` : ''}`;

    res.json({
      success: true,
      spokenText,
      source: 'autonomous_local_engine',
      timestamp: new Date().toISOString(),
    });
  } catch (ex: any) {
    res.status(500).json({ success: false, error: ex.message });
  }
});
// -------------------------------------------------------------
// ANDROID MOBILE BRIDGE — AUTHENTICATED DEVICE GATEWAY
//
// Replaces the previous unauthenticated, client-reported bridge state.
// Nothing here reports a device as connected, telemetry as present, or an
// action as successful unless the device itself supplied the evidence.
// -------------------------------------------------------------

const bridgeGateway = new AndroidBridgeGateway({
  signingSecret:
    process.env.MOBILE_BRIDGE_SECRET ||
    process.env.APP_SECRET ||
    process.env.SESSION_SECRET ||
    'hermes_jarvis_mobile_bridge_dev_secret',
});

/** Fixed-window limiter that counts FAILED auth attempts only, per client IP. */
const bridgeAuthFailures = new Map<string, { count: number; windowStart: number }>();
const BRIDGE_AUTH_WINDOW_MS = 60_000;
const BRIDGE_AUTH_MAX_FAILURES = Number(process.env.MOBILE_BRIDGE_MAX_AUTH_FAILURES) || 25;

function bridgeAuthThrottled(ip: string): boolean {
  const now = Date.now();
  const entry = bridgeAuthFailures.get(ip);
  if (!entry || now - entry.windowStart > BRIDGE_AUTH_WINDOW_MS) return false;
  return entry.count >= BRIDGE_AUTH_MAX_FAILURES;
}

/** Returns true when the caller has now exceeded the failure budget. */
function recordBridgeAuthFailure(ip: string): boolean {
  const now = Date.now();
  const entry = bridgeAuthFailures.get(ip);
  if (!entry || now - entry.windowStart > BRIDGE_AUTH_WINDOW_MS) {
    bridgeAuthFailures.set(ip, { count: 1, windowStart: now });
    return 1 >= BRIDGE_AUTH_MAX_FAILURES;
  }
  entry.count += 1;
  return entry.count >= BRIDGE_AUTH_MAX_FAILURES;
}

/** Clears the failure budget for an IP after a successful authentication. */
function clearBridgeAuthFailures(ip: string): void {
  bridgeAuthFailures.delete(ip);
}

/** Extracts the session token from either supported header. */
function extractBridgeToken(req: Request): string | undefined {
  const header = req.header('x-jarvis-session-token') || req.header('x-jarvis-auth-token');
  if (header) return header.trim();
  const auth = req.header('authorization');
  if (auth && auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return undefined;
}

interface BridgeAuthContext {
  sessionId: string;
}

/**
 * Gate for every bridge endpoint except pairing. Returns null and writes the
 * error response when the caller cannot prove it holds a live session.
 */
function requireBridgeSession(
  req: Request,
  res: Response
): BridgeAuthContext | null {
  const ip = String(req.ip || req.socket?.remoteAddress || 'unknown');
  if (bridgeAuthThrottled(ip)) {
    res.status(429).json({
      success: false,
      outcome: 'BLOCKED',
      error: 'Too many bridge authentication attempts. Retry later.',
    });
    return null;
  }

  const token = extractBridgeToken(req);
  const check = bridgeGateway.verifyToken(token);
  if (!check.valid || !check.session) {
    recordBridgeAuthFailure(ip);
    bridgeGateway.recordAudit(
      'SESSION_REJECTED',
      `Bridge request rejected: ${check.reason}`,
      bridgeFailureOutcome(check.reason)
    );
    res.status(401).json({
      success: false,
      outcome: bridgeFailureOutcome(check.reason),
      reason: check.reason,
      error: 'A valid bridge session token is required. Pair the device first via /api/mobile/bridge/pair.',
    });
    return null;
  }

  clearBridgeAuthFailures(ip);
  return { sessionId: check.session.sessionId };
}

function bridgeFailureOutcome(reason: string): ExecutionOutcome {
  // Session problems are authorization problems, not silent failures.
  if (reason === 'MALFORMED_TOKEN' || reason === 'UNKNOWN_SESSION' || reason === 'TOKEN_MISMATCH') return 'BLOCKED';
  return 'FAILED';
}

function emergencyActive(): boolean {
  // Delegates to the shared helper so the HTTP layer and the host executor
  // cannot drift apart on what "the kill switch is engaged" means.
  return isEmergencyStopActive();
}

// ---- 1. Pairing ------------------------------------------------------------

app.post('/api/mobile/bridge/pair', (req: Request, res: Response) => {
  try {
    const ip = String(req.ip || req.socket?.remoteAddress || 'unknown');
    if (bridgeAuthThrottled(ip)) {
      return res.status(429).json({ success: false, error: 'Too many pairing attempts. Retry later.' });
    }

    const pairingSecret = process.env.MOBILE_BRIDGE_PAIRING_SECRET;
    if (!pairingSecret) {
      return res.status(503).json({
        success: false,
        outcome: 'NOT_CONFIGURED',
        error:
          'MOBILE_BRIDGE_PAIRING_SECRET is not configured on the server. Device pairing is disabled until the operator sets it.',
      });
    }

    const provided = req.header('x-jarvis-pairing-secret') || req.body?.pairingSecret;
    if (!provided || typeof provided !== 'string') {
      recordBridgeAuthFailure(ip);
      return res.status(401).json({ success: false, outcome: 'BLOCKED', error: 'Pairing secret required.' });
    }

    const expected = Buffer.from(pairingSecret, 'utf8');
    const actual = Buffer.from(provided, 'utf8');
    if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
      recordBridgeAuthFailure(ip);
      bridgeGateway.recordAudit('PAIRING_REJECTED', 'Invalid pairing secret presented', 'BLOCKED');
      return res.status(403).json({ success: false, outcome: 'BLOCKED', error: 'Invalid pairing secret.' });
    }

    clearBridgeAuthFailures(ip);

    const deviceId = String(req.body?.deviceId || '').trim();
    if (!deviceId) {
      return res.status(400).json({ success: false, error: 'deviceId is required for pairing.' });
    }

    // Only one device owns the bridge at a time; re-pairing replaces the link.
    const existing = bridgeGateway.getDevice();
    if (existing) {
      bridgeGateway.revoke(existing.sessionId, 'Superseded by new pairing');
    }

    const issued = bridgeGateway.issueSession(deviceId, req.body?.clientLabel || 'Android Bridge');
    // Pairing only mints a session token; the device has not connected and no
    // heartbeat has been seen, so the bridge is still MOBILE_NOT_CONNECTED.
    // Recording this as VERIFIED would be a fake success: the device has done
    // nothing yet.
    bridgeGateway.recordAudit(
      'PAIRING_ACCEPTED',
      `Pairing accepted for ${deviceId}; awaiting device connect and heartbeat`,
      'NOT_CONFIGURED',
      {
        sessionId: issued.session.sessionId,
        deviceId,
      }
    );

    return res.json({
      success: false,
      outcome: 'NOT_CONFIGURED',
      verified: false,
      status: bridgeGateway.getStatus(),
      sessionId: issued.session.sessionId,
      sessionToken: issued.token,
      expiresAt: issued.expiresAt,
      note: 'Pairing stored. This only mints a session token — the device is not connected until it registers and sends a heartbeat. Store this token on the device and present it as X-Jarvis-Session-Token on every bridge call.',
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---- 2. Registration / capability handshake --------------------------------

app.post('/api/mobile/bridge/connect', (req: Request, res: Response) => {
  const auth = requireBridgeSession(req, res);
  if (!auth) return;

  try {
    const { device, capabilities, permissions } = req.body || {};
    if (!device && !capabilities) {
      return res.status(400).json({ success: false, error: 'Device capabilities are required to register.' });
    }
    const caps = capabilities || device || {};
    const deviceId = String(caps.deviceId || device?.deviceId || '').trim();
    if (!deviceId) {
      return res.status(400).json({ success: false, error: 'deviceId is required.' });
    }

    const { device: registered, negotiation } = bridgeGateway.register({
      sessionId: auth.sessionId,
      deviceId,
      deviceName: device?.deviceName,
      model: device?.model || caps.model,
      osVersion: device?.osVersion || caps.osVersion,
      bridgeVersion: device?.bridgeVersion,
      sdkInt: caps.sdkInt,
      capabilities: caps,
      permissions,
    });

    // The handshake only *negotiated* capabilities; it did not prove the device
    // can do the work. A device that landed in PERMISSION_REQUIRED or
    // LIMITED_CAPABILITY, or one that is still SIMULATION_ONLY, must not be
    // reported as a verified connection — only a live, fully-permitted CONNECTED
    // handshake is VERIFIED. This matches the engine and the client adapter,
    // which already derive success from the same status.
    const bridgeStatus = bridgeGateway.getStatus();
    const outcome: ExecutionOutcome =
      bridgeStatus === 'CONNECTED'
        ? 'VERIFIED'
        : bridgeStatus === 'PERMISSION_REQUIRED'
        ? 'PERMISSION_REQUIRED'
        : bridgeStatus === 'LIMITED_CAPABILITY' || bridgeStatus === 'PARTIALLY_CONNECTED'
        ? 'NOT_AVAILABLE'
        : bridgeStatus === 'MOBILE_NOT_CONNECTED'
        ? 'NOT_CONFIGURED'
        : 'UNVERIFIED';

    return res.json({
      success: bridgeStatus === 'CONNECTED',
      outcome,
      verified: outcome === 'VERIFIED',
      status: bridgeStatus,
      device: {
        deviceId: registered.deviceId,
        deviceName: registered.deviceName,
        model: registered.model,
        osVersion: registered.osVersion,
        bridgeVersion: registered.bridgeVersion,
        isSimulation: registered.capabilities.isSimulation,
        registeredAt: registered.registeredAt,
      },
      permissions: registered.permissions,
      capabilities: {
        available: negotiation.available,
        unavailable: negotiation.unavailable,
        verdicts: negotiation.verdicts,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---- 3. Heartbeat + telemetry ---------------------------------------------

app.post('/api/mobile/bridge/heartbeat', (req: Request, res: Response) => {
  const auth = requireBridgeSession(req, res);
  if (!auth) return;

  const telemetry = (req.body?.telemetry || {}) as DeviceTelemetryInput;
  const result = bridgeGateway.heartbeat(auth.sessionId, telemetry);
  if (!result.accepted) {
    return res.status(409).json({
      success: false,
      outcome: 'FAILED',
      reason: result.reason,
      error: 'Device is not registered under this session. Call /api/mobile/bridge/connect first.',
    });
  }

  // A heartbeat is recorded against the device, but a simulated device, or one
  // whose session has lapsed, is not a verified live bridge. Report what the
  // heartbeat actually established instead of a blanket VERIFIED.
  const device = bridgeGateway.getDevice();
  const bridgeStatus = bridgeGateway.getStatus();
  const verdict = classifyBridgeHeartbeat({
    accepted: result.accepted,
    isSimulation: Boolean(device?.capabilities.isSimulation),
    bridgeStatus,
    deviceLive: bridgeGateway.isDeviceLive(),
  });

  return res.json({
    success: verdict.success,
    outcome: verdict.outcome,
    verified: verdict.verified,
    message: verdict.message,
    status: bridgeStatus,
    lastHeartbeatAt: result.lastHeartbeatAt,
    reconnectCount: bridgeGateway.reconnectCount(),
    telemetryAccepted: {
      battery: Boolean(telemetry.battery),
      location: Boolean(telemetry.location),
      notifications: Boolean(telemetry.notifications),
    },
  });
});

// ---- 4. Status -------------------------------------------------------------

app.get('/api/mobile/bridge/status', (req: Request, res: Response) => {
  const device = bridgeGateway.getDevice();
  const live = bridgeGateway.isDeviceLive();
  const status = bridgeGateway.getStatus();
  const session = device ? bridgeGateway.sessions.getSession(device.sessionId) : undefined;

  res.json({
    success: true,
    status,
    /** Only true when the device is paired, live, and not a simulated testbed. */
    deviceLive: live,
    device: device
      ? {
          deviceId: device.deviceId,
          deviceName: device.deviceName,
          model: device.model,
          osVersion: device.osVersion,
          bridgeVersion: device.bridgeVersion,
          isSimulation: device.capabilities.isSimulation,
          registeredAt: device.registeredAt,
          lastHeartbeatAt: device.lastHeartbeatAt,
          heartbeatCount: device.heartbeatCount,
          reconnectCount: session?.reconnectCount ?? 0,
        }
      : null,
    permissions: device?.permissions ?? null,
    capabilities: device
      ? {
          available: device.negotiation.available,
          unavailable: device.negotiation.unavailable,
          verdicts: device.negotiation.verdicts,
        }
      : null,
    telemetryPresence: {
      battery: Boolean(device?.telemetry.battery),
      location: Boolean(device?.telemetry.location),
      notifications: Boolean(device?.telemetry.notifications),
    },
    dispatches: {
      pending: bridgeGateway.getDispatchLedger().filter((d) => d.status === 'DISPATCHED').length,
      confirmed: bridgeGateway.getDispatchLedger().filter((d) => d.status === 'CONFIRMED').length,
      failed: bridgeGateway.getDispatchLedger().filter((d) => d.status === 'FAILED').length,
      expired: bridgeGateway.getDispatchLedger().filter((d) => d.status === 'EXPIRED').length,
    },
    emergencyPaused: emergencyActive(),
    reconnect: {
      disconnectCount: bridgeGateway.getDisconnectCount(),
      reconnectCount: bridgeGateway.reconnectCount(),
      liveWindowSeconds: 45,
    },
  });
});

// ---- 5. Telemetry reads ---------------------------------------------------

const TELEMETRY_KINDS = ['battery', 'location', 'notifications'] as const;

app.get('/api/mobile/bridge/telemetry/:kind', (req: Request, res: Response) => {
  const kind = String(req.params.kind) as (typeof TELEMETRY_KINDS)[number];
  if (!TELEMETRY_KINDS.includes(kind)) {
    return res.status(400).json({
      success: false,
      error: `Unknown telemetry kind "${req.params.kind}". Expected one of: ${TELEMETRY_KINDS.join(', ')}.`,
    });
  }

  const result = bridgeGateway.readTelemetry(kind);
  const httpStatus = result.outcome === 'VERIFIED' ? 200 : result.outcome === 'NOT_CONFIGURED' ? 404 : 400;
  return res.status(httpStatus).json({
    success: result.outcome === 'VERIFIED',
    outcome: result.outcome,
    verified: result.outcome === 'VERIFIED',
    kind,
    data: result.data,
    ageSeconds: result.ageSeconds,
    receipt: result.receipt,
    message: result.receipt.detailEn,
  });
});

// ---- 6. Device events (calls, notifications) ------------------------------

app.post('/api/mobile/bridge/event', (req: Request, res: Response) => {
  const auth = requireBridgeSession(req, res);
  if (!auth) return;

  const session = bridgeGateway.sessions.getSession(auth.sessionId);
  if (!session) {
    return res.status(401).json({ success: false, outcome: 'BLOCKED', error: 'Session no longer exists.' });
  }

  const { eventType, payload, sequence, eventTimestamp } = req.body || {};
  if (!eventType || !payload) {
    return res.status(400).json({ success: false, error: 'eventType and payload are required.' });
  }

  const seqCheck = bridgeGateway.sessions.acceptSequence(session, sequence, eventTimestamp);
  if (!seqCheck.accepted) {
    bridgeGateway.recordAudit('EVENT_REJECTED', `Event rejected: ${seqCheck.reason}`, 'BLOCKED', {
      sessionId: auth.sessionId,
    });
    return res.status(409).json({ success: false, outcome: 'BLOCKED', reason: seqCheck.reason });
  }

  if (emergencyActive()) {
    bridgeGateway.recordAudit('EVENT_BLOCKED_EMERGENCY', `Event ${eventType} refused during emergency stop`, 'BLOCKED', {
      sessionId: auth.sessionId,
    });
    return res.status(423).json({
      success: false,
      outcome: 'BLOCKED',
      error: 'Global Kill Switch is active; device events are not being processed.',
    });
  }

  // Canonical mask (src/utils/androidBridgeEngine.maskPhoneNumber). The previous
  // inline regex left *spaced* numbers completely unmasked (+1 415 890 2134 ->
  // unchanged) and leaked four subscriber digits when it did match.
  const maskedNumber = maskAndroidCallerNumber(payload.callerNumber);

  // A device event is only as real as the device that sent it. An event from a
  // simulated device, or one whose session has lapsed, is not a verified live
  // event — report what the event actually established instead of a blanket
  // VERIFIED, and stamp the audit row with the same verdict so the trail cannot
  // disagree with the reply.
  const eventDevice = bridgeGateway.getDevice();
  const eventVerdict = classifyBridgeEvent({
    accepted: true,
    isSimulation: Boolean(eventDevice?.capabilities.isSimulation),
    bridgeStatus: bridgeGateway.getStatus(),
    deviceLive: bridgeGateway.isDeviceLive(),
    eventType,
  });

  if (eventType === 'INCOMING_CALL') {
    bridgeGateway.recordAudit(
      'CALL_RECEIVED',
      `Incoming call from ${payload.callerName || maskedNumber || 'unknown'} (awaiting approval)`,
      eventVerdict.outcome,
      { sessionId: auth.sessionId, deviceId: session.deviceId }
    );
  } else if (eventType === 'INCOMING_NOTIFICATION') {
    bridgeGateway.recordAudit(
      'NOTIFICATION_RECEIVED',
      `Notification from ${payload.appName || payload.packageName || 'unknown app'}`,
      eventVerdict.outcome,
      { sessionId: auth.sessionId, deviceId: session.deviceId }
    );
  } else {
    bridgeGateway.recordAudit('EVENT_RECEIVED', `Device event ${eventType}`, eventVerdict.outcome, {
      sessionId: auth.sessionId,
      deviceId: session.deviceId,
    });
  }

  return res.json({
    success: eventVerdict.success,
    outcome: eventVerdict.outcome,
    verified: eventVerdict.verified,
    message: eventVerdict.message,
    accepted: true,
    eventType,
    sequence: session.lastSequence,
  });
});

// ---- 7. Action dispatch + device confirmation -----------------------------

app.post('/api/mobile/bridge/call/answer', (req: Request, res: Response) => {
  const auth = requireBridgeSession(req, res);
  if (!auth) return;

  if (emergencyActive()) {
    bridgeGateway.recordAudit('ACTION_DENIED', 'Call answer blocked by Global Kill Switch', 'BLOCKED', {
      sessionId: auth.sessionId,
    });
    return res.status(423).json({ success: false, outcome: 'BLOCKED', error: 'Global Kill Switch is active.' });
  }

  const device = bridgeGateway.getDevice();
  if (!device || !bridgeGateway.isDeviceLive()) {
    return res.status(409).json({
      success: false,
      outcome: 'NOT_CONFIGURED',
      error: 'No live Android device is registered with the bridge.',
    });
  }

  const answerVerdict = device.negotiation.verdicts.find((v) => v.capability === 'CALL_ANSWER');
  if (!answerVerdict?.available) {
    const outcome: ExecutionOutcome = answerVerdict?.requiredGrant ? 'PERMISSION_REQUIRED' : 'NOT_AVAILABLE';
    return res.status(403).json({
      success: false,
      outcome,
      requiredGrant: answerVerdict?.requiredGrant,
      error: answerVerdict?.reason || 'Device cannot answer calls.',
    });
  }

  if (req.body?.approved !== true) {
    return res.status(403).json({
      success: false,
      outcome: 'BLOCKED',
      error: 'Explicit human approval (approved: true) is required to answer a call.',
    });
  }

  const { dispatch, receipt } = bridgeGateway.dispatchAction({
    actionType: 'ANSWER_CALL',
    sessionId: auth.sessionId,
    target: req.body?.callId || 'active call',
    payloadSummary: `Answer call ${req.body?.callId || 'active'}`,
  });

  return res.json({
    success: false,
    outcome: 'DISPATCHED',
    verified: false,
    dispatchId: dispatch.dispatchId,
    receipt,
    message:
      'Answer command dispatched to the device. This is NOT yet confirmed — the device must report the call state back.',
  });
});

app.post('/api/mobile/bridge/message/reply', (req: Request, res: Response) => {
  const auth = requireBridgeSession(req, res);
  if (!auth) return;

  if (emergencyActive()) {
    bridgeGateway.recordAudit('ACTION_DENIED', 'Message reply blocked by Global Kill Switch', 'BLOCKED', {
      sessionId: auth.sessionId,
    });
    return res.status(423).json({ success: false, outcome: 'BLOCKED', error: 'Global Kill Switch is active.' });
  }

  const device = bridgeGateway.getDevice();
  if (!device || !bridgeGateway.isDeviceLive()) {
    return res.status(409).json({
      success: false,
      outcome: 'NOT_CONFIGURED',
      error: 'No live Android device is registered with the bridge.',
    });
  }

  if (req.body?.approved !== true) {
    return res.status(403).json({
      success: false,
      outcome: 'BLOCKED',
      error: 'Explicit human approval (approved: true) is required to send a reply.',
    });
  }

  const replyText = typeof req.body?.replyText === 'string' ? req.body.replyText.trim() : '';
  if (!replyText) {
    return res.status(400).json({ success: false, error: 'replyText is required.' });
  }

  const { dispatch, receipt } = bridgeGateway.dispatchAction({
    actionType: 'SEND_REPLY',
    sessionId: auth.sessionId,
    target: req.body?.notificationId || 'pending notification',
    // Never log message bodies — metadata only.
    payloadSummary: `Reply to ${req.body?.notificationId || 'notification'} (${replyText.length} chars, content withheld)`,
  });

  return res.json({
    success: false,
    outcome: 'DISPATCHED',
    verified: false,
    dispatchId: dispatch.dispatchId,
    receipt,
    message:
      'Reply dispatched to the device for delivery. Delivery is NOT confirmed until the device acknowledges it.',
  });
});

app.post('/api/mobile/bridge/action/confirm', (req: Request, res: Response) => {
  const auth = requireBridgeSession(req, res);
  if (!auth) return;

  const { dispatchId, confirmedStatus, detail } = req.body || {};
  if (!dispatchId || !confirmedStatus) {
    return res.status(400).json({ success: false, error: 'dispatchId and confirmedStatus are required.' });
  }

  const receipt = bridgeGateway.confirmAction({
    dispatchId: String(dispatchId),
    sessionId: auth.sessionId,
    confirmedStatus: String(confirmedStatus),
    detail: detail ? String(detail).slice(0, 300) : undefined,
  });

  return res.status(receipt.outcome === 'VERIFIED' ? 200 : 409).json({
    success: receipt.outcome === 'VERIFIED',
    outcome: receipt.outcome,
    verified: receipt.verified,
    receipt,
  });
});

app.post('/api/mobile/bridge/app/open', (req: Request, res: Response) => {
  const auth = requireBridgeSession(req, res);
  if (!auth) return;

  const { packageName } = req.body || {};
  if (!packageName) {
    return res.status(400).json({ success: false, error: 'packageName is required.' });
  }

  const { dispatch, receipt } = bridgeGateway.dispatchAction({
    actionType: 'OPEN_APP',
    sessionId: auth.sessionId,
    target: String(packageName),
    payloadSummary: `Launch ${packageName}`,
  });

  return res.json({
    success: false,
    outcome: 'DISPATCHED',
    verified: false,
    dispatchId: dispatch.dispatchId,
    receipt,
    message: 'Launch intent dispatched; the device has not confirmed it yet.',
  });
});

// ---- 8. Disconnect ---------------------------------------------------------

app.post('/api/mobile/bridge/disconnect', (req: Request, res: Response) => {
  const auth = requireBridgeSession(req, res);
  if (!auth) return;

  const device = bridgeGateway.getDevice();
  if (!device || device.sessionId !== auth.sessionId) {
    return res.status(409).json({ success: false, outcome: 'FAILED', error: 'This session does not own the device link.' });
  }

  const disconnectsBefore = bridgeGateway.getDisconnectCount();
  bridgeGateway.revoke(auth.sessionId, req.body?.reason || 'Device requested disconnect');
  const verdict = classifyBridgeDisconnect({
    deviceWasLinked: true,
    disconnectsBefore,
    disconnectsAfter: bridgeGateway.getDisconnectCount(),
    bridgeStatus: bridgeGateway.getStatus(),
    reason: req.body?.reason || 'Device requested disconnect',
  });
  return res.json({
    success: verdict.success,
    verified: verdict.verified,
    outcome: verdict.outcome,
    status: verdict.status,
    message: verdict.message,
  });
});

// ---- 9. Diagnostics --------------------------------------------------------

app.get('/api/mobile/bridge/audit', (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query.limit) || 100, 300);
  res.json({ success: true, entries: bridgeGateway.getAudit(limit) });
});

app.get('/api/mobile/bridge/dispatches', (req: Request, res: Response) => {
  res.json({ success: true, dispatches: bridgeGateway.getDispatchLedger() });
});

/**
 * Developer testbed. Every response is explicitly marked SIMULATION_ONLY and the
 * device is refused 'CONNECTED' status, so a simulated device can never be
 * mistaken for a real one in the HUD or in Telegram.
 */
app.post('/api/mobile/bridge/simulate', (req: Request, res: Response) => {
  const { type, callerName, callerNumber, appName, sender, text } = req.body || {};
  bridgeGateway.recordAudit(
    'SIMULATION_EVENT',
    `[SIMULATION_ONLY] synthetic ${type || 'event'} injected for developer testing`,
    'SIMULATION_ONLY'
  );
  res.json({
    success: false,
    outcome: 'SIMULATION_ONLY',
    verified: false,
    simulated: true,
    type: type || null,
    echo: { callerName, callerNumber, appName, sender, text },
    message:
      'This endpoint only records a labelled test event. It does not connect a device or deliver anything. Use /api/mobile/bridge/pair for a real device.',
  });
});

app.post('/api/memory', (req: Request, res: Response) => {
  try {
    // Only apply the fields the classifier accepted. A body carrying no real
    // field — an empty object, or only a caller-supplied counter request — is
    // refused rather than answered `success: true` for a save that never
    // happened, and a malformed value is never written into the stored memory.
    const verdict = classifyMemoryUpdate(req.body, {
      name: memoryState.name,
      notes: memoryState.notes,
      customKeyValues: memoryState.customKeyValues,
    });

    // A save is only real once it is on disk. Snapshot the pre-change values so
    // a failed write can be rolled back rather than reported as a completed save.
    const before = {
      name: memoryState.name,
      notes: memoryState.notes,
      customKeyValues: memoryState.customKeyValues,
      stats: { ...memoryState.stats },
    };

    if (verdict.applied.name !== undefined) memoryState.name = verdict.applied.name;
    if (verdict.applied.notes !== undefined) memoryState.notes = verdict.applied.notes as any;
    if (verdict.applied.customKeyValues !== undefined) {
      memoryState.customKeyValues = {
        ...memoryState.customKeyValues,
        ...verdict.applied.customKeyValues,
      };
    }

    // The "Autonomous Actions Executed" figure is user-visible (MemoryModal) and
    // must only advance when the server itself observed work. A caller-supplied
    // counter request is recorded as inert instead of credited.
    if (verdict.inertCounterRequest) {
      const requestedStats: string[] = [];
      if (req.body?.statUpdate?.incrementCommand) requestedStats.push('incrementCommand');
      if (req.body?.statUpdate?.incrementAction) requestedStats.push('incrementAction');
      memoryState.notes = [
        ...memoryState.notes,
        {
          id: `stat-assert-${Date.now()}`,
          title: 'Counter request not applied',
          content: `A caller asked to increment ${requestedStats.join(', ')} via POST /api/memory. The server did not observe that work, so no counter was advanced.`,
          createdAt: new Date().toISOString(),
        },
      ];
    }

    if (verdict.outcome === 'NOTHING_TO_APPLY' || verdict.outcome === 'INVALID_BODY') {
      return res.status(400).json({
        success: false,
        stored: false,
        outcome: verdict.outcome,
        message: verdict.message,
      });
    }

    if (verdict.outcome === 'APPLIED' || verdict.inertCounterRequest) {
      memoryState.stats.lastActive = new Date().toISOString();
    }

    // Success must mean the change is durable, not merely held in this process's
    // memory. The route used to answer `success: true` for a save that never
    // reached disk; report failure (and roll back) instead.
    if (!persistMemory()) {
      memoryState.name = before.name;
      memoryState.notes = before.notes;
      memoryState.customKeyValues = before.customKeyValues;
      memoryState.stats = before.stats;
      return res.status(500).json({
        success: false,
        stored: false,
        persisted: false,
        outcome: verdict.outcome,
        error: 'Memory could not be written to durable storage; the change was not saved.',
      });
    }

    res.json({
      success: true,
      persisted: true,
      outcome: verdict.outcome,
      message: verdict.message,
      memory: {
        name: memoryState.name,
        notes: memoryState.notes,
        customKeyValues: memoryState.customKeyValues,
        stats: memoryState.stats,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update memory' });
  }
});

// ==========================================
// TELEPHONY & AUTONOMOUS VOICE AGENT ENGINE
// ==========================================
TelephonyProviderRegistry.initialize();
let telephonyCalls: any[] = [];
let telephonySettingsState: any = {
  provider: 'browser_webrtc_simulator',
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || '',
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || '',
  // No placeholder number: an unconfigured carrier line is left empty so the
  // status surface reports it as not recorded instead of an invented number.
  twilioPhoneNumber: process.env.TWILIO_PHONE_NUMBER || '',
  autoAnswerInbound: true,
  autoAnswerDelaySeconds: 2,
  aiReceptionistGreeting: "Hello, thank you for calling. You have reached Alex's AI Executive Assistant, JARVIS. How may I assist you today?",
  aiPersona: 'executive_assistant',
  spamScreeningEnabled: true,
  spamThresholdScore: 70,
  acousticFilterEnabled: true,
  dtmfAudioEnabled: true,
  recordingEnabled: true,
  forwardUrgentToTelegram: true,
  voiceLanguage: 'en-US',
  voicePitch: 1.0,
  voiceRate: 1.05,
};

// Restore the settings the operator saved. Without this the module-local state
// above silently reverted to the compile-time defaults on every boot, so a
// provider or greeting the settings route reported "SAVED" was gone the next
// time the process started. Only keys that are real settings and carry a
// primitive value are adopted, so a hand-edited or legacy file cannot inject an
// unknown key or a malformed value into the live settings.
{
  const stored = memoryState.telephonySettings;
  if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
    const known = new Set<string>(TELEPHONY_SETTING_KEYS);
    for (const [key, value] of Object.entries(stored)) {
      if (!known.has(key)) continue;
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        telephonySettingsState[key] = value;
      }
    }
    // Re-apply the saved engine selection to the live registry, mirroring the
    // settings route, so a restart serves the engine the operator last chose.
    if (typeof stored.provider === 'string') {
      const providerId = telephonyEngineProviderId(stored.provider);
      if (providerId !== null) TelephonyProviderRegistry.setActiveProvider(providerId);
    }
  }
  memoryState.telephonySettings = { ...telephonySettingsState };
}

// Restore the recorded call history. The array above is module-local and was
// never read back, so every call the operator logged vanished on restart while
// the route had reported it saved. Only plain objects are adopted, so a
// hand-edited or legacy file cannot inject a malformed row into the history.
{
  const storedCalls = memoryState.telephonyCallRecords;
  if (Array.isArray(storedCalls)) {
    telephonyCalls = storedCalls.filter(
      (row): row is Record<string, unknown> =>
        !!row && typeof row === 'object' && !Array.isArray(row)
    );
  }
  memoryState.telephonyCallRecords = telephonyCalls;
}

// 1. Get Telephony Calls
app.get('/api/telephony/calls', (req: Request, res: Response) => {
  res.json({ success: true, calls: telephonyCalls });
});

// 2. Save / Update Telephony Call Record
app.post('/api/telephony/calls', (req: Request, res: Response) => {
  try {
    const callData = req.body;
    const existingIdx =
      callData && typeof callData.id === 'string'
        ? telephonyCalls.findIndex((c) => c.id === callData.id)
        : -1;
    const existing = existingIdx >= 0 ? telephonyCalls[existingIdx] : null;
    // The old route answered success: true for any body carrying an id and
    // spread unknown keys into the stored record. Classify the write against
    // the real CallRecord fields and the stored record first, so a body that
    // names no real field, or restates the record unchanged, is refused
    // instead of being reported as a saved call.
    const verdict = classifyTelephonyCallRecord(callData, existing);
    if (!verdict.accepted) {
      const status = verdict.reason === 'MISSING_ID' || verdict.reason === 'NOT_OBJECT' ? 400 : 422;
      return res.status(status).json({ success: false, reason: verdict.reason, error: verdict.message });
    }

    const stored = existing
      ? { ...existing, ...verdict.changes }
      : { ...verdict.changes, id: verdict.id };
    // A recorded call is only real once it is on disk. Snapshot the history so a
    // failed durable write can be rolled back rather than answered `success:
    // true` for a record the next boot does not have.
    const callsSnapshot = telephonyCalls.slice();
    if (existingIdx >= 0) {
      telephonyCalls[existingIdx] = stored;
    } else {
      telephonyCalls.unshift(stored);
    }

    // Keep up to 100 recent calls in memory
    if (telephonyCalls.length > 100) {
      telephonyCalls = telephonyCalls.slice(0, 100);
    }

    if (!persistTelephonyCalls()) {
      telephonyCalls = callsSnapshot;
      memoryState.telephonyCallRecords = telephonyCalls;
      return res.status(500).json({
        success: false,
        persisted: false,
        action: verdict.action,
        call: null,
        outcome: 'NOT_PERSISTED',
        message: 'The call record could not be written to durable storage; it was not saved.',
      });
    }

    res.json({
      success: true,
      persisted: true,
      action: verdict.action,
      call: stored,
      message: verdict.message,
      ...(verdict.rejected.length > 0 ? { ignoredFields: verdict.rejected } : {}),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Delete / Clear Telephony Calls
app.delete('/api/telephony/calls', (req: Request, res: Response) => {
  const beforeCalls = telephonyCalls.slice();
  const before = beforeCalls.length;
  telephonyCalls = [];
  // Clearing an already-empty history removes nothing; report the real count
  // rather than asserting a deletion that never happened.
  const verdict = classifyTelephonyCallDeletion(before);
  if (verdict.success) {
    // A deletion is only real once the emptied history is durable: a write that
    // never reaches disk leaves the next boot believing every call still
    // exists. Refuse the claim and restore the history in memory.
    if (!persistTelephonyCalls()) {
      telephonyCalls = beforeCalls;
      memoryState.telephonyCallRecords = telephonyCalls;
      return res.status(500).json({
        success: false,
        removed: 0,
        outcome: 'NOT_PERSISTED',
        persisted: false,
        message: 'The call history could not be cleared in durable storage; nothing was deleted.',
      });
    }
    return res.json({ ...verdict, persisted: true });
  }
  res.json({ ...verdict });
});

app.delete('/api/telephony/calls/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const before = telephonyCalls.slice();
  telephonyCalls = telephonyCalls.filter((c) => c.id !== id);
  // Deleting an id that was never recorded removes nothing; the old route
  // still answered success: true and named the call as deleted.
  const verdict = classifyTelephonyCallDeletion(before.length - telephonyCalls.length, id);
  if (verdict.success) {
    // As above, the removal must reach disk before it is reported as deleted.
    if (!persistTelephonyCalls()) {
      telephonyCalls = before;
      memoryState.telephonyCallRecords = telephonyCalls;
      return res.status(500).json({
        success: false,
        removed: 0,
        outcome: 'NOT_PERSISTED',
        persisted: false,
        message: `Call "${id}" could not be deleted from durable storage; nothing was deleted.`,
      });
    }
    return res.json({ ...verdict, persisted: true });
  }
  res.json({ ...verdict });
});

// 4. Telephony Settings
app.get('/api/telephony/settings', (req: Request, res: Response) => {
  res.json({
    success: true,
    settings: {
      ...telephonySettingsState,
      twilioAuthToken: telephonySettingsState.twilioAuthToken ? '••••••••••••••••' : '',
    },
  });
});

app.post('/api/telephony/settings', (req: Request, res: Response) => {
  try {
    // Snapshot the live settings so a failed durable write can be rolled back.
    const previousSettings = { ...telephonySettingsState };
    // The route used to spread any caller-supplied object over the live
    // settings and answer `success: true` unconditionally: an unknown or
    // misspelled key was "stored", a malformed value corrupted state, and a
    // body carrying no real setting still reported a save. Classify against
    // the real keys and report what was actually stored.
    const verdict = classifyTelephonySettingsUpdate(req.body, telephonySettingsState);
    if (!verdict.accepted) {
      return res.json({
        success: false,
        outcome: verdict.reason,
        applied: false,
        rejected: verdict.rejected,
        message: verdict.message,
        settings: {
          ...telephonySettingsState,
          twilioAuthToken: telephonySettingsState.twilioAuthToken ? '••••••••••••••••' : '',
        },
      });
    }

    telephonySettingsState = {
      ...telephonySettingsState,
      ...verdict.applied,
    };

    // A stored setting must survive a restart. The live state used to be a
    // module-local object that was never written to disk, so every "SAVED"
    // setting (provider, greeting, voice rate...) silently reverted on the next
    // boot. Write it, and if the write cannot reach disk, roll the change back
    // and refuse the save rather than announce one that cannot be kept.
    const persisted = persistTelephonySettingsState();
    if (!persisted) {
      telephonySettingsState = {
        ...telephonySettingsState,
        ...previousSettings,
      };
      memoryState.telephonySettings = { ...telephonySettingsState };
      return res.status(500).json({
        success: false,
        persisted: false,
        outcome: 'NOT_PERSISTED',
        applied: false,
        changed: false,
        rejected: verdict.rejected,
        message: 'Telephony settings could not be written to durable storage; they were not saved.',
        settings: {
          ...telephonySettingsState,
          twilioAuthToken: telephonySettingsState.twilioAuthToken ? '••••••••••••••••' : '',
        },
      });
    }

    // Apply the selected engine to the live registry. Without this the
    // selector was decorative: the status endpoint kept reporting whatever
    // TELEPHONY_PROVIDER had set at boot. The result is reported honestly so
    // the UI never claims a selection took effect when it did not.
    let engineApplied: boolean | null = null;
    if (typeof verdict.applied.provider === 'string') {
      const providerId = telephonyEngineProviderId(verdict.applied.provider);
      engineApplied = providerId !== null
        && TelephonyProviderRegistry.setActiveProvider(providerId);
      if (!engineApplied) {
        telephonySettingsState.engineApplyError =
          `ENGINE_NOT_APPLIED: ${verdict.applied.provider}`;
      } else {
        delete telephonySettingsState.engineApplyError;
      }
    }

    res.json({
      success: true,
      persisted: true,
      outcome: verdict.changed ? 'APPLIED' : 'UNCHANGED',
      applied: verdict.changed,
      changed: verdict.changed,
      rejected: verdict.rejected,
      message: verdict.message,
      settings: {
        ...telephonySettingsState,
        twilioAuthToken: telephonySettingsState.twilioAuthToken ? '••••••••••••••••' : '',
      },
      engineApplied,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Autonomous Voice Call Turn Processing with Gemini AI
app.post('/api/telephony/handle-turn', async (req: Request, res: Response) => {
  try {
    const {
      userUtterance = '',
      conversationHistory = [],
      callerPersona = {},
      callObjective = '',
      aiPersona = 'executive_assistant',
      isOutbound = false,
    } = req.body;

    const ai = getGenAI();

    if (ai) {
      try {
        const systemPrompt = `You are HERMES JARVIS acting as an autonomous phone voice agent on a live phone call.
AI Persona: ${aiPersona} (Professional, concise, polite, natural cadence).
Call Direction: ${isOutbound ? 'Outbound Call' : 'Inbound Call'}.
Mission Objective: ${callObjective || 'Polite conversation and executive assistance'}.
Counterpart Details: Name="${callerPersona.name || 'Caller'}", Entity="${callerPersona.entity || 'Unknown'}", Notes="${callerPersona.notes || 'None'}".

CRITICAL VOICE PHONE GUIDELINES:
1. Spoken replies must sound completely authentic on a phone line. Keep responses between 1 and 3 concise sentences. Never output bullet points, markdown bolding, or lists.
2. If this is an appointment/booking/rescheduling task, actively propose or confirm concrete dates/times and ask for confirmation details.
3. If the caller is selling solar panels, crypto, unsolicited insurance, or obvious spam, politely decline and instruct to remove from list.
4. Output STRICT JSON format ONLY with the following shape:
{
  "replyText": "The exact spoken reply JARVIS will say into the phone",
  "whisperTip": "A short internal suggestion or piece of intelligence for the user watching the screen (e.g., 'Confirm appointment ID')",
  "sentiment": "positive" | "neutral" | "negative" | "urgent",
  "intent": "e.g. confirm_slot, decline_spam, request_code, reschedule",
  "shouldEndCall": boolean,
  "followUpActions": ["Action item 1", "Action item 2"]
}`;

        const dialogueContext = conversationHistory
          .map((h: any) => `${h.speaker === 'agent' ? 'JARVIS' : 'CALLER'}: ${h.text}`)
          .join('\n');

        const userPrompt = `Dialogue so far:\n${dialogueContext}\n\nLATEST CALLER STATEMENT: "${userUtterance}"\n\nRespond with strict JSON:`;

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
          config: {
            responseMimeType: 'application/json',
          },
        });

        const jsonText = response.text?.trim() || '{}';
        const parsed = JSON.parse(jsonText);
        return res.json({
          success: true,
          turn: {
            replyText: parsed.replyText || "Understood. I have recorded that note.",
            // The model authors this itself and often returns it as a receipt
            // ("Appointment slot confirmed", "Robocall ... terminated") for an
            // action this route never dispatches. An absent tip is reported as
            // absent so the UI cannot render a default it did not observe.
            whisperTip: whisperTipForDisplay(parsed.whisperTip),
            sentiment: parsed.sentiment || 'neutral',
            intent: parsed.intent || 'conversation',
            shouldEndCall: Boolean(parsed.shouldEndCall),
            followUpActions: Array.isArray(parsed.followUpActions)
              ? parsed.followUpActions.map((a: any) => formatLiveActionItem(String(a)))
              : [],
          },
          source: 'gemini-2.5-flash',
        });
      } catch (geminiErr: any) {
        console.warn('[Telephony Handle Turn] Gemini generation warning, using fallback:', geminiErr.message);
      }
    }

    // High quality offline / rule-based fallback response
    const lowerUtterance = userUtterance.toLowerCase();
    let replyText = "Thank you for the update. I have noted that in Sir's executive calendar. Is there anything else you require?";
    // Fallback tips are authored as suggestions only. A default that asserted
    // "AI tracking call turns" claimed live analysis this route does not do; an
    // unmatched turn reports no tip.
    let whisperTip = "";
    let sentiment: 'positive' | 'neutral' | 'negative' | 'urgent' = 'neutral';
    let shouldEndCall = false;
    let followUpActions: string[] = ['Logged call notes'];

    if (lowerUtterance.includes('reschedule') || lowerUtterance.includes('appointment') || lowerUtterance.includes('thursday')) {
      replyText = "Thursday at 2:30 PM is noted and accepted on our end. Please send the digital calendar invite to our verified contact. Thank you.";
      whisperTip = "Suggestion: confirm the Thursday 2:30 PM slot with a written invite.";
      sentiment = 'positive';
      shouldEndCall = true;
      followUpActions = ['Calendar updated: Thursday 2:30 PM', 'Send confirmation SMS'];
    } else if (lowerUtterance.includes('gate code') || lowerUtterance.includes('package') || lowerUtterance.includes('delivery')) {
      replyText = "Gate access code is #4829. Please place the delivery parcel securely behind the foyer pillar. Thank you, Dave.";
      whisperTip = "Suggestion: confirm the courier used gate code #4829 and left the parcel.";
      sentiment = 'positive';
      shouldEndCall = true;
      followUpActions = ['Notify resident of package delivery at foyer'];
    } else if (lowerUtterance.includes('solar') || lowerUtterance.includes('free roof') || lowerUtterance.includes('interest rate')) {
      replyText = "This number is registered on the National Do-Not-Call Registry. Please remove this entry immediately. Goodbye.";
      whisperTip = "Possible robocall — the transcript matched spam keywords, not a carrier check.";
      sentiment = 'negative';
      shouldEndCall = true;
      followUpActions = ['Add number to local blocklist'];
    }

    res.json({
      success: true,
      turn: {
        replyText,
        whisperTip,
        sentiment,
        intent: 'telephony_conversation',
        shouldEndCall,
        // The fallback matched transcript keywords only — it dispatched no
        // calendar write, SMS or blocklist change. Every item is marked as a
        // recorded task so the UI cannot render it as a finished one.
        followUpActions: followUpActions.map(formatLiveActionItem),
      },
      source: 'autonomous_local_telephony_engine',
    });
  } catch (ex: any) {
    res.status(500).json({ success: false, error: ex.message });
  }
});

// ==========================================
// 6. PRODUCTION TELEPHONY GATEWAY & ADAPTERS
// ==========================================

// Webhook signature security validator (Section L)
function validateTelephonyWebhook(req: Request, provider: string): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN || process.env.TELEPHONY_AUTH_SECRET;
  if (!authToken) return true; // Dev mode without explicit secret
  if (req.headers['x-telephony-simulation'] === 'true' || req.body?.isSimulated) return true;

  if (provider === 'twilio') {
    const signature = req.headers['x-twilio-signature'] as string;
    if (!signature) return false;
    try {
      const fullUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
      const sortedKeys = Object.keys(req.body || {}).sort();
      let data = fullUrl;
      for (const key of sortedKeys) {
        data += key + req.body[key];
      }
      const expected = crypto.createHmac('sha1', authToken).update(Buffer.from(data, 'utf-8')).digest('base64');
      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    } catch {
      return false;
    }
  }
  return true;
}

// 6.1 Telephony Status Endpoint (Section V & E)
app.get('/api/telephony/status', (req: Request, res: Response) => {
  const provider = TelephonyProviderRegistry.getProvider();
  const allProviders = TelephonyProviderRegistry.getAllProviders();
  const activeSessions = TelephonySessionManager.getCallHistory();
  const currentActive = activeSessions.find((s) => s.state !== 'ENDED' && s.state !== 'FAILED');

  // The simulator's isConfigured() is unconditionally true by design (it is a
  // test adapter, not a carrier), so it must never surface as a configured
  // gateway. Compute the honest mode from the id that is actually active.
  const rawConfigured = provider.isConfigured();
  const engineMode = telephonyEngineMode(provider.id, rawConfigured);
  const isConfigured = engineMode === 'LIVE_GATEWAY';

  res.json({
    success: true,
    status: telephonyEngineLabel(engineMode),
    isConfigured,
    engineMode,
    engineLabel: telephonyEngineLabel(engineMode),
    engineApplied: telephonySelectionApplied(telephonySettingsState?.provider, provider.id),
    engineApplyError: telephonySettingsState?.engineApplyError ?? null,
    provider: {
      id: provider.id,
      name: provider.name,
      isSimulationOnly: provider.id === SIMULATION_PROVIDER_ID,
    },
    availableProviders: allProviders,
    currentCall: currentActive ? {
      callSessionId: currentActive.callSessionId,
      direction: currentActive.direction,
      callerIdentifier: currentActive.callerIdentifier,
      recipientIdentifier: currentActive.recipientIdentifier,
      state: currentActive.state,
      language: currentActive.language,
      turnsCount: currentActive.turns.length,
      handoffStatus: currentActive.handoffStatus,
    } : null,
    emergencyPaused: getEmergencyState().emergencyPaused,
  });
});

// 6.2 Incoming Call Webhook (Twilio / Telnyx / Plivo compatible)
app.post('/api/telephony/incoming', async (req: Request, res: Response) => {
  const providerType = (req.body.provider || process.env.TELEPHONY_PROVIDER || 'twilio').toLowerCase();
  
  // Webhook Security Validation (Section L)
  if (!validateTelephonyWebhook(req, providerType)) {
    return res.status(401).send('Unauthorized: Invalid Telephony Webhook Signature');
  }

  // Global Kill Switch Check (Section I)
  const isEmergencyPaused = getEmergencyState().emergencyPaused;
  if (isEmergencyPaused) {
    const pauseTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Aditi" language="hi-IN">सुरक्षा आपातकालीन नियंत्रण सक्रिय होने के कारण स्वचालित कॉल उत्तर अस्थायी रूप से निलंबित है।</Say>
  <Say voice="Polly.Matthew" language="en-IN">Voice call answering is temporarily suspended by the Emergency Safety Stop.</Say>
  <Hangup/>
</Response>`;
    if (req.headers['content-type']?.includes('application/x-www-form-urlencoded') || req.body.CallSid) {
      return res.type('text/xml').send(pauseTwiml);
    }
    return res.json({ success: false, error: 'EMERGENCY_STOP_ACTIVE', message: 'Autonomous call answering suspended.' });
  }

  const rawFrom = resolveRawNumber(req.body.From || req.body.callerNumber);
  const rawTo = resolveRawNumber(req.body.To || req.body.recipientNumber);
  const isSimulated = Boolean(req.body.isSimulated || req.headers['x-telephony-simulation'] === 'true');

  const session = TelephonySessionManager.createInboundSession({
    rawCallerNumber: rawFrom,
    rawRecipientNumber: rawTo,
    providerName: providerType,
    isSimulated,
  });
  TelephonySessionManager.updateState(session.callSessionId, 'ANSWERING');

  const defaultGreeting = `नमस्ते, मैं डॉक्टर जूलियन वेन के क्लिनिक से जार्विस बोल रहा हूँ। मैं आपकी क्या सहायता कर सकता हूँ?`;

  if (req.headers['content-type']?.includes('application/x-www-form-urlencoded') || req.body.CallSid) {
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Aditi" language="hi-IN">${defaultGreeting}</Say>
  <Gather input="speech" language="hi-IN" action="/api/telephony/twiml/turn?callSessionId=${session.callSessionId}" speechTimeout="auto">
    <Say voice="Polly.Aditi" language="hi-IN">मैं सुन रहा हूँ, कृपया बताएं।</Say>
  </Gather>
</Response>`;
    return res.type('text/xml').send(twiml);
  }

  res.json({
    success: true,
    callSessionId: session.callSessionId,
    callerIdentifier: session.callerIdentifier,
    recipientIdentifier: session.recipientIdentifier,
    state: session.state,
    greeting: defaultGreeting,
  });
});

// 6.3 TwiML Interactive Voice Turn Endpoint
app.post('/api/telephony/twiml/turn', async (req: Request, res: Response) => {
  const callSessionId = (req.query.callSessionId as string) || req.body.CallSid || 'active_call';
  const speechResult = req.body.SpeechResult || req.body.userUtterance || '';
  const isEmergencyPaused = getEmergencyState().emergencyPaused;

  const result = await TelephonySessionManager.processTurn({
    callSessionId,
    utterance: speechResult,
    isEmergencyPaused,
    clinicData: DEFAULT_CLINIC_CONFIG,
  });

  const isHindi = result.language.startsWith('hi');
  const voice = isHindi ? 'Polly.Aditi' : 'Polly.Matthew';

  // If human handoff was requested and confirmed by carrier
  if (result.handoffStatus === 'CONFIRMED') {
    const handoffTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${voice}" language="${result.language}">${result.replyText}</Say>
  <Dial>${DEFAULT_CLINIC_CONFIG.phone}</Dial>
</Response>`;
    return res.type('text/xml').send(handoffTwiml);
  }

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${voice}" language="${result.language}">${result.replyText}</Say>
  ${result.shouldEndCall ? '<Hangup/>' : `<Gather input="speech" language="${result.language}" action="/api/telephony/twiml/turn?callSessionId=${callSessionId}" speechTimeout="auto"/>`}
</Response>`;
  res.type('text/xml').send(twiml);
});

// 6.4 Caller Interruption / Barge-in Endpoint (Section N)
app.post('/api/telephony/interruption', (req: Request, res: Response) => {
  const { callSessionId } = req.body;
  const result = TelephonySessionManager.handleBargeIn(callSessionId);
  // A barge-in only counts when it reached a live session; an unknown id
  // returns state IDLE, so success must follow the handler's real outcome.
  res.json({ success: bargeInApplied(result), ...result });
});

// 6.5 Silence Timeout Endpoint (Section O)
app.post('/api/telephony/silence-timeout', (req: Request, res: Response) => {
  const { callSessionId } = req.body;
  const result = TelephonySessionManager.handleSilenceTimeout(callSessionId);
  // success mirrors whether a live session advanced; a stale id is not accepted.
  res.json({ success: silenceTimeoutApplied(result), ...result });
});

// 6.6 Stage Outbound Call for Level-4 Authorization (Section H)
app.post('/api/telephony/outbound/stage', (req: Request, res: Response) => {
  try {
    const { destinationNumber, purpose, recipientName, language } = req.body;
    if (!destinationNumber) {
      return res.status(400).json({ success: false, error: 'Destination phone number is required' });
    }

    // Run the safety gate before staging anything. The masked target is what
    // would be dialled and what the finance guard must inspect; staging the
    // pending request first left a blocked dial sitting in the pending queue.
    const destinationMasked = maskPhoneNumber(destinationNumber);
    const actionReq = createPendingActionRequest({
      exactAction: `Outbound PSTN Call to ${destinationMasked}`,
      target: destinationMasked,
      contentChanges: `Purpose: ${purpose || 'Autonomous phone call by JARVIS'}`,
      level: 4,
      source: 'Telephony Gateway',
    });
    const verdict = classifyOutboundStage(actionReq);
    if (!verdict.success) {
      return res.status(409).json({
        success: false,
        staged: false,
        outcome: verdict.outcome,
        actionId: null,
        message: verdict.message,
      });
    }

    // Only a genuinely pending action is staged as an outbound request, so a
    // blocked dial can never be authorized later through /outbound/authorize.
    const request = TelephonySessionManager.stageOutboundRequest({
      destinationNumber,
      purpose: purpose || 'Autonomous phone call by JARVIS',
      recipientName,
      language: language || 'hi-IN',
    });

    const promptText = (language || 'hi-IN').startsWith('hi')
      ? `सर, मैं इस नंबर पर कॉल करने वाला हूँ: ${request.destinationMasked}। क्या आप अनुमति देते हैं?`
      : `Sir, I am about to place an outbound call to: ${request.destinationMasked}. Do you authorize this?`;

    // The staged Level-4 action must be durable; otherwise the approval card the
    // operator later acts on has no matching request after a restart. A write
    // that cannot reach disk is named in `persisted`.
    const persisted = persistApprovalRegistry();

    res.json({
      success: true,
      staged: true,
      persisted,
      outcome: verdict.outcome,
      request,
      actionId: actionReq.request.id,
      promptText,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6.7 Authorize and Execute Outbound Call (Level-4 Confirmation)
app.post('/api/telephony/outbound/authorize', async (req: Request, res: Response) => {
  try {
    const { requestId, actionId, decision, approverName = 'HUMAN_OPERATOR' } = req.body;

    const requestedDecision: 'APPROVE' | 'REJECT' = decision === 'APPROVE' ? 'APPROVE' : 'REJECT';
    const recorded = TelephonySessionManager.authorizeOutboundRequest(
      requestId,
      requestedDecision,
      approverName
    );
    const verdict = classifyOutboundAuthorization(requestedDecision, recorded);

    // A requestId that was never staged cannot be cancelled or authorized.
    // Reporting success here told the operator an outbound call had been
    // withdrawn (or approved) when no request existed.
    if (!verdict.success) {
      return res.status(404).json({
        success: false,
        authorized: false,
        outcome: verdict.outcome,
        message: verdict.message,
      });
    }

    if (requestedDecision === 'REJECT') {
      if (actionId) updateActionRequestStatus(actionId, 'REJECTED', { resolvedBy: approverName });
      // Durable so a restart cannot resurrect the rejected dial as pending. As on
      // the web decision routes, `persistApprovalRegistry()` can return true
      // without writing when the file already holds identical bytes, so the
      // terminal status is read back from disk rather than trusting the boolean.
      // A rejection that never reached disk is refused and the session request
      // reverted, so a reboot cannot re-offer a call the operator was told was
      // cancelled.
      const persisted =
        persistApprovalRegistry() &&
        (!actionId || actionRequestStatusOnDisk(actionId, 'REJECTED'));
      if (!persisted) {
        TelephonySessionManager.revertOutboundAuthorization(requestId, 'REJECTED');
        if (actionId) {
          const liveReq = getAllActionRequests().find((r) => r.id === actionId);
          if (liveReq) liveReq.status = 'PENDING_APPROVAL';
          memoryState.permissionRequests = persistedActionRequests();
        }
        return res.status(500).json({
          success: false,
          authorized: false,
          persisted: false,
          recorded: false,
          outcome: 'UNPERSISTED',
          message: 'The decision could not be written to durable storage; it was not recorded.',
        });
      }
      return res.json({
        success: true,
        authorized: false,
        persisted: true,
        outcome: verdict.outcome,
        message: verdict.message,
      });
    }

    if (actionId) updateActionRequestStatus(actionId, 'APPROVED', { resolvedBy: approverName });
    // The authorization decision is durable independently of whether the carrier
    // later confirms the dial; persist it before any dispatch attempt so a
    // reboot cannot re-offer an already-approved call. The write is verified on
    // disk (the boolean alone is true without writing on identical bytes). A
    // decision that did not reach disk must not be dialled: the carrier call
    // would be irreversible while the next boot re-offers the same request for a
    // duplicate dial. Refuse, revert the session request, and roll the action
    // back to pending so the operator can decide again.
    const persisted =
      persistApprovalRegistry() && (!actionId || actionRequestStatusOnDisk(actionId, 'APPROVED'));
    if (!persisted) {
      TelephonySessionManager.revertOutboundAuthorization(requestId, 'AUTHORIZED');
      if (actionId) {
        const liveReq = getAllActionRequests().find((r) => r.id === actionId);
        if (liveReq) liveReq.status = 'PENDING_APPROVAL';
        memoryState.permissionRequests = persistedActionRequests();
      }
      return res.status(500).json({
        success: false,
        authorized: false,
        persisted: false,
        recorded: false,
        outcome: 'UNPERSISTED',
        message:
          'The authorization could not be written to durable storage; the call was not placed.',
      });
    }

    // Verify the active engine can actually place a PSTN call before
    // connecting (Section V). The raw `isConfigured()` boolean is not enough:
    // the simulator's is unconditionally true and its startOutboundCall()
    // returns a fabricated providerCallId, so gating on the boolean alone let
    // a simulated engine through and the route reported a "placed" call that
    // no carrier saw. Derive the honest mode from the active provider id.
    const provider = TelephonyProviderRegistry.getProvider();
    const dialEngineMode = telephonyEngineMode(provider.id, provider.isConfigured());
    if (!telephonyEngineCanDial(dialEngineMode)) {
      return res.status(400).json({
        success: false,
        authorized: true,
        status: dialEngineMode,
        error: telephonyDialRefusal(dialEngineMode),
      });
    }

    const dest = recorded.request?.destinationNumber || req.body.destinationNumber;
    const sessionRes = TelephonySessionManager.createOutboundSession({
      destinationNumber: dest,
      purpose: recorded.request?.purpose || 'Outbound consultation',
      language: recorded.request?.language || 'hi-IN',
      isSimulated: Boolean(req.body.isSimulated),
      ownNumber: resolveRawNumber(telephonySettingsState.twilioPhoneNumber),
    });

    if (sessionRes.error || !sessionRes.session) {
      return res.status(400).json({ success: false, error: sessionRes.error });
    }

    const dialResult = await provider.startOutboundCall({
      callSessionId: sessionRes.session.callSessionId,
      destinationNumber: dest,
    });

    // Authorization succeeded, but the carrier dispatch is a separate fact.
    // Do not report a placed call when no provider confirmed it — the route
    // previously returned success:true regardless of dialResult.
    if (!dialResult.success) {
      return res.status(502).json({
        success: false,
        authorized: true,
        status: 'PROVIDER_DISPATCH_FAILED',
        session: sessionRes.session,
        error: dialResult.error || 'The telephony provider did not confirm the outbound call.',
      });
    }

    res.json({
      success: true,
      authorized: true,
      session: sessionRes.session,
      providerCallId: dialResult.providerCallId,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6.8 Telephony Permissions Gateway (Section J)
//
// `loadPhonePermissions` / `savePhonePermissions` are browser helpers: both
// short-circuit on `typeof window === 'undefined'`, so on this server they read
// and write nothing. The POST route used to report `success: true, applied:
// true` anyway, so a granted Level-4 permission was announced as saved and
// silently forgotten on the next GET. `resolvePhonePermissionStore` returns a
// durable store only when one exists (tests inject one through
// `JARVIS_PHONE_PERMISSIONS_FILE`); otherwise the route reports the honest
// refusal instead of claiming a change it cannot keep.
function resolvePhonePermissionStore(): PhonePermissionStore | null {
  const filePath = process.env.JARVIS_PHONE_PERMISSIONS_FILE;
  if (!filePath) return null;
  return {
    load: () => {
      try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        return { ...DEFAULT_PHONE_PERMISSIONS, ...JSON.parse(raw) };
      } catch {
        return { ...DEFAULT_PHONE_PERMISSIONS };
      }
    },
    save: (perms) => {
      fs.writeFileSync(filePath, JSON.stringify(perms, null, 2), 'utf-8');
    },
  };
}

app.get('/api/telephony/permissions', (req: Request, res: Response) => {
  const store = resolvePhonePermissionStore();
  const perms = store ? store.load() : loadPhonePermissions();
  res.json({
    success: true,
    persisted: Boolean(store),
    permissions: perms,
  });
});

app.post('/api/telephony/permissions', (req: Request, res: Response) => {
  try {
    const verdict = classifyPhonePermissionUpdate(req.body, PHONE_PERMISSION_DEFINITIONS);
    const store = resolvePhonePermissionStore();
    const current = store ? store.load() : loadPhonePermissions();
    if (!verdict.accepted) {
      return res.status(400).json({
        success: false,
        applied: false,
        reason: verdict.reason,
        rejected: verdict.rejected,
        permissions: current,
        error: verdict.message,
      });
    }

    const result = applyPhonePermissionUpdate(store, current, verdict.applied);
    res.json({
      success: result.applied,
      applied: result.applied,
      outcome: result.outcome,
      appliedKeys: result.applied ? Object.keys(verdict.applied) : [],
      rejected: verdict.rejected,
      message: result.applied ? verdict.message : result.message,
      permissions: result.permissions,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, applied: false, error: err.message });
  }
});

// 6.9 Run Automated Telephony Test Suite (Section U)
app.get('/api/telephony/test-suite', async (req: Request, res: Response) => {
  try {
    const summary = await runTelephonyTestSuite();
    // The route used to answer `success: true` for every run, so a suite with
    // failing cases was reported to the caller as a passing suite. The verdict
    // is derived from the run: a completed request is not a suite that passed.
    const verdict = classifyTelephonySuiteRun(summary);
    res.json({
      success: verdict.success,
      outcome: verdict.outcome,
      message: verdict.message,
      summary,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Resolve a voice/chat telephony command into an honest dispatch verdict.
// The active engine mode and the live session state are the only facts that
// can confirm a call action actually reached a carrier.
function evaluateTelephonyDispatch(phase: TelephonyDispatchPhase) {
  const provider = TelephonyProviderRegistry.getProvider();
  const engineMode = telephonyEngineMode(provider.id, provider.isConfigured());
  const activeSession = TelephonySessionManager.getLatestActiveSession();
  return telephonyDispatchVerdict(phase, engineMode, activeSession?.state ?? null);
}

// Launch intents in `/api/chat` used to speak unqualified success ("Visual
// Studio Code brought to active foreground") and set `actionExecuted = true`
// without touching the host. This reaches the real executor and derives the
// verdict from observable evidence: the host capability map and the `LAUNCH_APP`
// receipt, which is VERIFIED only when the app was seen in the foreground.
// `open_notepad`, `open_calculator`, `open_paint` and `open_chrome` route to an
// in-app view and do not call this; they state the in-app routing plainly
// instead of claiming a desktop launch.
async function evaluateLaunchDispatch(appName: string, targetApp: string) {
  const caps = hostActionCapabilities();
  const capability = caps.LAUNCH_APP || caps.INSPECT_SCREEN;
  if (!capability?.available) {
    return launchVerdict(appName, caps, null);
  }
  const action: ComputerAction = {
    id: `launch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: 'LAUNCH_APP',
    targetApp,
    description: `Launch ${targetApp}`,
    securityLevel: 2,
    requiresHumanApproval: false,
  };
  const result = await hostActionExecutor.execute(action);
  return launchVerdict(appName, caps, result.receipt);
}

// Jarvis Main Chat & AI Reasoning API
app.post('/api/chat', async (req: Request, res: Response) => {
  try {
    const { message, history = [], language = 'en-US' } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    memoryState.stats.totalCommands += 1;
    memoryState.stats.lastActive = new Date().toISOString();

    const intentData = classifyIntentLocally(message);
    let spokenResponse = '';
    let actionExecuted = false;
    let actionDetail: any = null;
    let languageChangedTo: string | undefined;
    // In-app voice-output level, mirroring the UI slider. Not a system mixer
    // value — `audioDispatchTruth` never reports the host output level as changed.
    let voiceOutputLevel = 1.0;

    switch (intentData.intent) {
      case 'finance_blocked': {
        spokenResponse = intentData.financeReason || 'HERMES JARVIS Security Protocol: Financial operations are strictly restricted and prohibited from autonomous control.';
        // Refusing a prohibited request is not performed work, and App.tsx has no
        // `finance_blocked` case to pop a view for it. Credit no action so the
        // "Autonomous Actions Executed" counter does not advance for a refusal.
        actionExecuted = false;
        actionDetail = { type: 'finance_blocked', title: 'Finance Blocked (safety exclusion, no action taken)', payload: { reason: intentData.financeReason } };
        break;
      }
      case 'emergency_stop': {
        // `toggleEmergencyStop` FLIPS the flag, so it is only safe to call when
        // the pre-state says the freeze is not already on. Otherwise a repeated
        // "emergency stop" would silently RELEASE autonomy. The verdict is
        // computed from the observed pre-state and gates both the flip and the
        // spoken claim.
        const stopVerdict = emergencyToggleVerdict('stop', getEmergencyState());
        if (stopVerdict.actionExecuted) {
          toggleEmergencyStop('VOICE_OR_CHAT_USER', 'User requested immediate Emergency Stop');
        }
        spokenResponse = stopVerdict.replyEn;
        actionExecuted = stopVerdict.actionExecuted;
        actionDetail = { type: 'emergency_stop', title: stopVerdict.title, payload: getEmergencyState() };
        break;
      }
      case 'emergency_resume': {
        // Same guard: only resume when the freeze was actually engaged, so a
        // "resume" while a latched hard kill switch holds autonomy frozen cannot
        // be spoken as a successful release.
        const resumeVerdict = emergencyToggleVerdict('resume', getEmergencyState());
        if (resumeVerdict.actionExecuted) {
          toggleEmergencyStop('VOICE_OR_CHAT_USER', 'User released Emergency Stop');
        }
        spokenResponse = resumeVerdict.replyEn;
        actionExecuted = resumeVerdict.actionExecuted;
        actionDetail = { type: 'emergency_resume', title: resumeVerdict.title, payload: getEmergencyState() };
        break;
      }
      case 'cancel_computer_task': {
        const cancelResult = TaskTracker.cancelActiveTask('User requested stop');
        // Cancelling is real work only if a task was actually running. The
        // tracker reports `cancelled: false` when none is, and speaking a
        // cancellation (and bumping the counter) for that stop-stopped-nothing
        // case was fake success.
        const cancelVerdict = cancelComputerTaskVerdict(cancelResult);
        spokenResponse = language.startsWith('hi') ? cancelVerdict.replyHi : cancelVerdict.replyEn;
        actionExecuted = cancelVerdict.actionExecuted;
        actionDetail = { type: 'cancel_computer_task', title: cancelVerdict.title, payload: cancelResult };
        break;
      }
      case 'fix_project_error': {
        const curEmergencyState = getEmergencyState();
        const task = await ComputerOperatorEngine.executeTask(message, 'hybrid', curEmergencyState.emergencyPaused);
        // Only a COMPLETED task may be spoken as a fix. The engine itself marks
        // illustrative runs SIMULATION_ONLY and failures FAILED, so the reply is
        // derived from the returned status instead of a hardcoded success line.
        spokenResponse = fixProjectErrorReply(task, language.startsWith('hi'));
        actionExecuted = operatorTaskExecuted(task);
        actionDetail = { type: 'fix_project_error', title: 'Fix Project Error in VS Code', payload: task };
        break;
      }
      case 'inspect_screen': {
        const observation = await ScreenObserver.observeScreen({ preferredApp: message });
        const interpretation = ScreenInterpreter.interpret(observation, message);
        // The interpreter always produces a confident "Screen showing ..."
        // summary, so it is withheld unless a host-backed observer returned a
        // non-ambiguous observation.
        const hostBacked = ScreenObserver.isHostBacked();
        spokenResponse = screenInspectionReply(observation, interpretation, language.startsWith('hi'), hostBacked);
        actionExecuted = screenInspectionExecuted(observation, hostBacked);
        actionDetail = { type: 'inspect_screen', title: 'Screen Inspection', payload: { observation, interpretation } };
        break;
      }
      case 'operate_vscode': {
        const verdict = await evaluateLaunchDispatch('Visual Studio Code', 'code');
        spokenResponse = launchReply('Visual Studio Code', verdict, language);
        actionExecuted = verdict.actionExecuted;
        actionDetail = { type: 'operate_vscode', title: verdict.title, payload: { outcome: verdict.outcome } };
        break;
      }
      case 'operate_browser': {
        const verdict = await evaluateLaunchDispatch('Chrome browser', 'google-chrome');
        spokenResponse = launchReply('Chrome browser', verdict, language);
        actionExecuted = verdict.actionExecuted;
        actionDetail = { type: 'operate_browser', title: verdict.title, payload: { outcome: verdict.outcome } };
        break;
      }
      case 'operate_terminal': {
        const verdict = await evaluateLaunchDispatch('Terminal', 'x-terminal-emulator');
        spokenResponse = launchReply('Terminal', verdict, language);
        actionExecuted = verdict.actionExecuted;
        actionDetail = { type: 'operate_terminal', title: verdict.title, payload: { outcome: verdict.outcome } };
        break;
      }
      case 'open_computer_operator': {
        spokenResponse = language.startsWith('hi')
          ? 'कंप्यूटर ऑपरेटर और स्क्रीन रिसर्चर कंसोल सक्रिय कर दिया गया है।'
          : 'Computer Operator and Screen Researcher HUD activated.';
        actionExecuted = true;
        actionDetail = { type: 'open_computer_operator', title: 'Open Computer Operator' };
        break;
      }
      case 'git_status_tool': {
        const git = realGitStatus();
        const branchLabel = git.branch ?? 'detached HEAD';
        actionDetail = { type: 'git_status', title: git.success ? `Git: ${branchLabel}` : 'Git: UNKNOWN', payload: git };
        if (!git.success) {
          spokenResponse = language.startsWith('hi')
            ? `Git जानकारी अनुपलब्ध है। ${git.error}`
            : `Git status is unavailable. ${git.error}`;
          actionExecuted = false;
        } else {
          spokenResponse = `Git repository active on branch ${branchLabel}. ${git.clean ? 'Working directory is clean.' : git.statusText}`;
          actionExecuted = true;
        }
        break;
      }
      case 'github_repos_tool': {
        const ghStatus = await realGithubStatus();
        if (ghStatus.connected) {
          const repos = await realGithubRepos();
          // A status check that authenticated but whose repo listing failed is
          // not an executed tool action.
          actionExecuted = toolActionExecuted(repos);
          spokenResponse = repos.success
            ? `Authenticated as GitHub user @${ghStatus.username}. Located ${repos.repos?.length || 0} active repositories.`
            : toolActionResultReply(repos, '', 'GitHub repository listing', language);
          actionDetail = { type: 'github_repos', title: repos.success ? `GitHub @${ghStatus.username}` : 'GitHub Repo Listing Failed', payload: repos };
        } else {
          // Nothing external was queried: the check itself did not run.
          spokenResponse = ghStatus.message || 'GitHub is not configured. Provide GITHUB_TOKEN in environment settings.';
          actionExecuted = false;
          actionDetail = { type: 'github_status', title: 'GitHub Not Configured', payload: ghStatus };
        }
        break;
      }
      case 'list_files_tool': {
        const fsResult = realFsList('.');
        const fileCount = countedItems({ items: fsResult.files });
        spokenResponse = fsResult.success
          ? `Workspace file index loaded: ${fileCount} items found.`
          : toolActionResultReply(fsResult, '', 'Workspace file listing', language);
        actionExecuted = toolActionExecuted(fsResult);
        actionDetail = { type: 'list_files', title: fsResult.success ? 'Workspace Files' : 'File Listing Failed', payload: fsResult };
        break;
      }
      case 'web_research_tool': {
        const target = intentData.actionPayload?.target || 'https://news.ycombinator.com';
        const webRes = await realWebFetch(target);
        // A fetch that failed retrieved nothing; it must not be spoken as a
        // completed "Web analysis".
        actionExecuted = toolActionExecuted(webRes);
        spokenResponse = webRes.success
          ? `Web analysis complete for "${webRes.title}".`
          : toolActionResultReply(webRes, '', 'Web fetch', language);
        actionDetail = { type: 'web_research', title: webRes.success ? `Web: ${webRes.title || target}` : 'Web Fetch Failed', payload: webRes };
        break;
      }
      case 'summarize_youtube_video': {
        const targetUrl = intentData.actionPayload?.url || message;
        const videoId = intentData.actionPayload?.videoId || extractYouTubeVideoId(targetUrl);
        const summaryRes = await summarizeYouTubeVideoCore({ url: targetUrl, videoId: videoId || undefined });
        if (summaryRes.success && summaryRes.videoInfo) {
          const notice = summaryRes.notice ? `\n\n${summaryRes.notice}` : '';
          // `success` only proves the video metadata was fetched — not that a
          // summary was produced. A video that exposes no transcript and no
          // description comes back `success: true` with an empty summary
          // (`source: 'none'`), so crediting it advanced the user-visible
          // "Autonomous Actions Executed" counter for a summarization that
          // never happened. Only a non-empty summary is executed work.
          const hasSummary = Boolean(summaryRes.summary && summaryRes.summary.trim());
          spokenResponse = hasSummary
            ? `YouTube video "${summaryRes.videoInfo.title}" by ${summaryRes.videoInfo.channel} (${summaryRes.videoInfo.durationFormatted}).${notice}\n\n${summaryRes.summary}`
            : `YouTube video "${summaryRes.videoInfo.title}" by ${summaryRes.videoInfo.channel}. ${summaryRes.notice || 'No transcript or description is available, so there is nothing to summarize.'}`;
          actionExecuted = hasSummary;
          actionDetail = {
            type: hasSummary ? 'youtube_summary' : 'youtube_summary_empty',
            title: hasSummary
              ? `YouTube: ${summaryRes.videoInfo.title}`
              : `YouTube: No Content (nothing summarized) — ${summaryRes.videoInfo.title}`,
            payload: summaryRes,
          };
        } else {
          spokenResponse = `YouTube summarizer notice: ${summaryRes.success ? 'Failed to extract video content. Please verify the URL.' : summaryRes.error}`;
          // No video content was retrieved, so no summarization work happened.
          actionExecuted = false;
          actionDetail = { type: 'youtube_summary_error', title: 'YouTube Error', payload: summaryRes };
        }
        break;
      }
      case 'youtube_status_inquiry': {
        const ytConn = memoryState.youTubeConnection;
        const ytTokenCheck = await ensureValidYouTubeToken();
        // The reply may only state what the token check and the recorded scope
        // grant prove. It previously asserted a verified channel and a nominal
        // quota that nothing measured, and named a hardcoded 'Connected Channel'
        // when no channel had ever been read.
        spokenResponse = youtubeVoiceStatusReply(
          {
            tokenValid: ytTokenCheck.valid,
            channelTitle: ytConn?.channelTitle,
            scopes: ytConn?.scopes,
          },
          language.startsWith('hi')
        );
        // A status question runs no tool and opens no view: `handleExecuteAction`
        // in App.tsx has no `youtube_status_inquiry` case. It previously credited
        // the token check as executed work whenever the token was valid, advancing
        // the "Autonomous Actions Executed" counter for a read-only look-up.
        actionExecuted = false;
        actionDetail = { type: 'youtube_status', title: 'YouTube Integration Status (informational, no action taken)', payload: { tokenValid: ytTokenCheck.valid, channelVerified: false, channel: ytConn?.channelTitle } };
        break;
      }
      case 'youtube_upload_request': {
        // The upload is staged but not performed: it is gated on Level-4 human
        // authorization and no video file is uploaded or even verified here, so
        // this request must not be counted as an executed action.
        spokenResponse = language.startsWith('hi')
          ? 'Level-4 मानव अनुमोदन आवश्यक है। इस अनुरोध से कोई वीडियो अपलोड नहीं हुआ।'
          : 'Level-4 human authorization is required. No video was uploaded by this request.';
        actionExecuted = false;
        actionDetail = {
          type: 'level4_gate_required',
          title: 'Level 4 Authorization Required: YouTube Upload',
          payload: { action: 'YOUTUBE_PUBLIC_UPLOAD', risk: 'HIGH', requiresConfirmation: true },
        };
        break;
      }
      case 'tools_audit': {
        const audit = getIntegrationsAuditReport();
        spokenResponse = `Integrations audit: ${audit.summary.credentialsPresent} integration(s) have their credentials present in this environment, ${audit.summary.notConfigured} await configuration, and ${audit.summary.notAvailable} cannot be configured here. Presence of a credential is not a live connection test.`;
        actionExecuted = true;
        actionDetail = { type: 'tools_audit', title: 'Integrations Matrix', payload: audit };
        break;
      }
      case 'pending_approvals': {
        const pending = getPendingApprovals();
        spokenResponse = pending.length > 0
          ? `You have ${pending.length} pending action approval(s) in queue requiring Level 3/4 human authorization.`
          : 'Zero pending action approvals. The approval queue is clean.';
        actionExecuted = true;
        actionDetail = { type: 'pending_approvals', title: 'Approvals Queue', payload: { count: pending.length, pending } };
        break;
      }
      case 'check_project': {
        // Report the real working tree instead of a fixed "2 branches / nominal"
        // payload. If git cannot be queried in this environment, say so rather
        // than asserting a clean codebase.
        const git = realGitStatus();
        if (git.success) {
          const branchCount = (() => {
            try {
              return execSync('git branch --list 2>/dev/null', { timeout: 3000 })
                .toString()
                .split('\n')
                .filter((line) => line.trim().length > 0).length;
            } catch {
              return null;
            }
          })();
          spokenResponse = git.clean
            ? `Project audit: on branch ${git.branch ?? 'detached HEAD'}, working tree is clean.`
            : `Project audit: on branch ${git.branch ?? 'detached HEAD'}, the working tree has uncommitted changes.`;
          actionExecuted = true;
          actionDetail = {
            type: 'check_project',
            title: 'Project Audit Complete',
            payload: {
              branch: git.branch,
              clean: git.clean,
              statusText: git.statusText,
              branches: branchCount,
            },
          };
        } else {
          spokenResponse = 'Project audit unavailable: git could not be queried in this environment.';
          actionExecuted = false;
          actionDetail = { type: 'check_project', title: 'Project Audit Unavailable', payload: { error: git.error } };
        }
        break;
      }
      case 'create_social_post': {
        const draft = memoryState.socialPosts.find((p) => p.status === 'pending_approval');
        if (draft) {
          spokenResponse = `The latest social media draft on ${draft.platform} is awaiting your approval in Human Approval Mode.`;
          actionExecuted = true;
          actionDetail = { type: 'create_social_post', title: 'Existing Draft Awaiting Approval', payload: { postId: draft.id, topic: draft.topic, platform: draft.platform } };
        } else {
          spokenResponse = 'There is no social media draft awaiting approval. I did not create one — use the draft command to generate a post.';
          actionExecuted = false;
          actionDetail = { type: 'create_social_post', title: 'No Draft Available', payload: { posts: memoryState.socialPosts.length } };
        }
        break;
      }
      case 'find_document': {
        const query = intentData.actionPayload?.query || '';
        const search = realFsSearch(query);
        if (search.success && search.matches && search.matches.length > 0) {
          const list = search.matches.map((m) => m.path).join(', ');
          spokenResponse = `Found ${search.matches.length} file(s) matching ${query}: ${list}.`;
          actionExecuted = true;
          // Carry the query alongside the matches so the client can open the
          // filesystem explorer on the same search instead of a bare directory.
          actionDetail = { type: 'find_document', title: `Found: ${query}`, payload: { query, matches: search.matches } };
        } else if (search.success) {
          // A search that returned nothing retrieved no document: no work was
          // executed, and the "Not found" card must not be counted as an action.
          spokenResponse = `No file matching ${query} exists in the workspace.`;
          actionExecuted = false;
          actionDetail = { type: 'find_document', title: `Not found: ${query}`, payload: { matches: [] } };
        } else {
          spokenResponse = `Document search is unavailable: ${search.error}`;
          actionExecuted = false;
          actionDetail = { type: 'find_document', title: 'Search Unavailable', payload: { error: search.error } };
        }
        break;
      }
      case 'schedule_morning_report': {
        const telegramLinked = !!activeTelegramChatId && !!getCleanTelegramToken();
        spokenResponse = telegramLinked
          ? 'The proactive Morning Briefing already runs daily at 9 AM IST on this server scheduler, and a Telegram chat is linked for delivery.'
          : 'The proactive Morning Briefing runs daily at 9 AM IST on this server scheduler, but no Telegram chat is linked so nothing will be delivered yet.';
        actionExecuted = telegramLinked;
        actionDetail = { type: 'schedule_morning_report', title: 'Morning Briefing Schedule (09:00 AM IST)', payload: { telegramLinked } };
        break;
      }
      case 'generate_quotation': {
        const withQuote = memoryState.freelanceLeads.filter((l) => !!l.quotation);
        if (withQuote.length > 0) {
          spokenResponse = `${withQuote.length} lead has a prepared quotation stored in the freelance pipeline. I did not generate a new one.`;
          actionExecuted = true;
          actionDetail = { type: 'generate_quotation', title: 'Existing Quotations', payload: withQuote.map((l) => ({ id: l.id, totalPrice: l.quotation!.totalPrice })) };
        } else {
          spokenResponse = 'No quotation has been generated yet, so there is nothing to report.';
          actionExecuted = false;
          actionDetail = { type: 'generate_quotation', title: 'No Quotation Available', payload: { leads: memoryState.freelanceLeads.length } };
        }
        break;
      }
      case 'cloud_telemetry': {
        const live = oracleCloudState.metricsSource === 'live_host' ? oracleCloudState.metrics : null;
        const cpuPart = live?.cpuUsage != null ? `${live.cpuUsage}% CPU` : 'CPU usage unavailable';
        const ramPart = live?.ramUsedGb != null ? `${live.ramUsedGb} GB RAM` : 'RAM usage unavailable';
        // The plan is not an observation. "Always Free" used to be spoken as a
        // bare fact next to telemetry; this process queries no OCI billing API,
        // so the cost line names the entitlement as unprobed.
        const costPart = describeBillingCost(oracleCloudState.billingEntitlement);
        spokenResponse = `Oracle Cloud ARM VM host telemetry: ${cpuPart}, ${ramPart}. ${
          live
            ? 'Metrics are read live from this daemon host.'
            : 'No live host metrics source is connected, so no readings were available.'
        } Cost: ${costPart}.`;
        actionExecuted = live !== null;
        actionDetail = {
          type: 'cloud_telemetry',
          title: 'Oracle VM Telemetry',
          payload: {
            ...oracleCloudState.metrics,
            metricsSource: oracleCloudState.metricsSource,
            billingEntitlement: oracleCloudState.billingEntitlement,
          },
        };
        break;
      }
      case 'security_audit': {
        const posture = securityMatrixPosture(securityMatrixState);
        spokenResponse = `Security protocol active at ${posture.levelLabel}. External-action approval: ${posture.humanApproval}. ${posture.secretMasking}.`;
        actionExecuted = true;
        actionDetail = { type: 'security_audit', title: `Security Matrix ${posture.levelLabel}` };
        break;
      }
      case 'set_name': {
        const rawName = intentData.actionPayload?.name || message.replace(/(?:my name is|mera naam|i am|call me)/i, '').trim();
        const verdict = judgeSetNameIntent(rawName);
        // The classifier's name group is greedy over a whitespace class, so a
        // sentence ("my name is hello how are you") or a digit-only payload
        // reaches here. Recording that as the identity and crediting executed
        // work inflated the user-visible counter for a no-op. Only a plausible
        // name updates memory and counts.
        if (verdict.kind === 'name') {
          memoryState.name = verdict.name;
          // The reply claims a durable record, so it must follow the real write.
          // A failed persistMemory() (read-only volume, full disk) leaves the name
          // only in this process's memory; claiming a save there is the same fake
          // success the Telegram path already refuses. Mirrors that branch.
          const persisted = persistMemory();
          if (persisted) {
            spokenResponse = `I will remember that, ${verdict.name}. Your identity has been recorded into my durable memory banks.`;
          } else {
            spokenResponse = `I read your name as ${verdict.name}, but I could not write it to durable storage, so it is not saved. Please try again.`;
          }
          actionExecuted = true;
          actionDetail = { type: 'set_name', title: persisted ? 'Memory Updated' : 'Memory Write Failed', payload: { name: verdict.name, persisted } };
        } else {
          spokenResponse = language.startsWith('hi')
            ? 'क्षमा करें, मैं आपका नाम नहीं समझ सका। कृपया ऐसे कहें: "मेरा नाम [नाम] है"।'
            : 'I could not read a usable name there. Please say it plainly, for example "My name is [your name]".';
          actionExecuted = false;
          actionDetail = {
            type: 'set_name_rejected',
            title: `Name Not Recorded (${verdict.reason})`,
          };
        }
        break;
      }
      case 'get_name': {
        // Reading the stored name is a lookup, not an action: `handleExecuteAction`
        // has no `get_name` case and no view opens, so this must not increment the
        // user-visible "Autonomous Actions Executed" counter. Mirrors the offline
        // engine, where the same intent already reports `actionExecuted: false`.
        if (memoryState.name) {
          spokenResponse = `Your name is ${memoryState.name}, as logged in my database.`;
        } else {
          spokenResponse = `I do not know your name yet. You can tell me by saying "My name is [your name]".`;
        }
        actionExecuted = false;
        actionDetail = { type: 'get_name', title: 'Memory Query (informational, no action taken)' };
        break;
      }
      case 'open_notepad': {
        const verdict = await evaluateLaunchDispatch('Notepad', 'notepad');
        spokenResponse = launchReply('Notepad', verdict, language);
        actionExecuted = verdict.actionExecuted;
        actionDetail = { type: 'open_notepad', title: verdict.title, payload: { outcome: verdict.outcome } };
        break;
      }
      case 'make_call': {
        const target = extractDialTarget(intentData.actionPayload?.target);
        if (!target) {
          const verdict = offlineCallMissingNumberVerdict('dial');
          spokenResponse = language.startsWith('hi') ? verdict.replyHi : verdict.replyEn;
          actionExecuted = verdict.actionExecuted;
          actionDetail = {
            type: 'make_call',
            title: verdict.title,
            payload: { target: null, outcome: 'NO_NUMBER' },
          };
          break;
        }
        const verdict = evaluateTelephonyDispatch('dial');
        const base = telephonyDispatchReply(verdict.outcome, language);
        spokenResponse = language.startsWith('hi') ? `${target}: ${base}` : `Call to ${target}: ${base}`;
        actionExecuted = verdict.actionExecuted;
        actionDetail = {
          type: 'make_call',
          title: verdict.title,
          payload: { target, outcome: verdict.outcome },
        };
        break;
      }
      case 'answer_call': {
        const verdict = evaluateTelephonyDispatch('answer');
        spokenResponse = telephonyDispatchReply(verdict.outcome, language);
        actionExecuted = verdict.actionExecuted;
        actionDetail = { type: 'answer_call', title: verdict.title, payload: { outcome: verdict.outcome } };
        break;
      }
      case 'hangup_call': {
        const verdict = evaluateTelephonyDispatch('hangup');
        spokenResponse = telephonyDispatchReply(verdict.outcome, language);
        actionExecuted = verdict.actionExecuted;
        actionDetail = { type: 'hangup_call', title: verdict.title, payload: { outcome: verdict.outcome } };
        break;
      }
      case 'reject_call': {
        const verdict = evaluateTelephonyDispatch('reject');
        spokenResponse = telephonyDispatchReply(verdict.outcome, language);
        actionExecuted = verdict.actionExecuted;
        actionDetail = { type: 'reject_call', title: verdict.title, payload: { outcome: verdict.outcome } };
        break;
      }
      case 'telephony_hub': {
        // Nothing outside this process opens a dialer; the console is routed in-app.
        spokenResponse = language.startsWith('hi')
          ? 'इन-ऐप टेलीफोनी कंसोल खोला जा रहा है। कोई बाहरी फोन डायलर नहीं खुला।'
          : 'Opening the in-app telephony console. No external phone dialer was opened.';
        actionExecuted = true;
        actionDetail = { type: 'telephony_hub', title: 'In-App Telephony Console (external dialer not opened)' };
        break;
      }
      case 'call_history': {
        spokenResponse = language.startsWith('hi')
          ? 'इस ऐप में दर्ज कॉल हिस्ट्री दिखाई जा रही है।'
          : 'Showing the call history recorded in this app.';
        actionExecuted = true;
        actionDetail = { type: 'call_history', title: 'In-App Call Logs (no external phone records read)' };
        break;
      }
      case 'open_calculator': {
        spokenResponse = 'Opening the in-app Calculator. No external calculator application was opened.';
        actionExecuted = true;
        actionDetail = { type: 'open_calculator', title: 'In-App Calculator (external app not opened)' };
        break;
      }
      case 'open_paint': {
        spokenResponse = 'Opening the in-app Paint Canvas. No external Paint application was opened.';
        actionExecuted = true;
        actionDetail = { type: 'open_paint', title: 'In-App Paint Canvas (external app not opened)' };
        break;
      }
      case 'open_chrome': {
        spokenResponse = 'Opening the in-app Browser view. No external Chrome process was started.';
        actionExecuted = true;
        actionDetail = { type: 'open_chrome', title: 'In-App Browser View (external Chrome not started)' };
        break;
      }
      case 'take_screenshot': {
        const capture = await captureScreenshot({});
        const verdict = screenshotVerdict(capture);
        spokenResponse = screenshotReply(verdict, language);
        actionExecuted = verdict.actionExecuted;
        actionDetail = {
          type: 'take_screenshot',
          title: verdict.title,
          payload: {
            outcome: verdict.outcome,
            file: verdict.file?.absolutePath ?? null,
            sizeBytes: verdict.file?.sizeBytes ?? null,
            sha256: verdict.file?.sha256 ?? null,
          },
        };
        break;
      }
      case 'volume_up':
      case 'volume_down': {
        const direction = intentData.intent === 'volume_up' ? 'up' : 'down';
        const verdict = volumeVerdict(direction, voiceOutputLevel);
        voiceOutputLevel = verdict.level;
        spokenResponse = volumeReply(verdict, language);
        actionExecuted = verdict.actionExecuted;
        actionDetail = {
          type: direction === 'up' ? 'volume_up' : 'volume_down',
          title: verdict.title,
          payload: { outcome: verdict.outcome, inAppLevel: verdict.level },
        };
        break;
      }
      case 'pc_shutdown':
      case 'pc_restart': {
        const kind = intentData.intent === 'pc_shutdown' ? 'shutdown' : 'restart';
        const verdict = powerVerdict(kind, hostActionCapabilities(), isEmergencyStopActive());
        spokenResponse = powerReply(verdict, language);
        actionExecuted = verdict.actionExecuted;
        actionDetail = {
          type: kind === 'shutdown' ? 'pc_shutdown' : 'pc_restart',
          title: verdict.title,
          payload: { outcome: verdict.outcome, permissionRequired: verdict.permissionRequired },
        };
        break;
      }
      case 'open_google':
      case 'open_youtube':
      case 'open_gmail':
      case 'open_chatgpt': {
        // The in-app Browser only leaves its Google home when the view is handed
        // the destination URL; the reply, the card and that URL all come from
        // one verdict so a named site is never claimed without being loaded.
        const verdict = browserOpenVerdict(intentData.intent);
        // The client sends a locale (`hi-IN`, `hinglish`), never a bare `hi`, so
        // this must use the same `startsWith('hi')` test as every other case or
        // the Hindi reply is unreachable and Hindi users are answered in English.
        spokenResponse = language.startsWith('hi') ? verdict.replyHi : verdict.replyEn;
        actionExecuted = true;
        // The URL must ride inside `payload.target`: the app dispatcher reads the
        // destination only from `actionDetail.payload`, so a top-level `target`
        // would never reach the view.
        actionDetail = browserOpenActionDetail(verdict);
        break;
      }
      case 'google_search': {
        const query = intentData.actionPayload?.query || message.replace(/^search\s+/i, '').trim();
        // "Searching Google for X" asserts a lookup is under way. The in-app Browser
        // only runs it when the view is handed the search URL in `payload.target`,
        // so the reply and the target come from one verdict and defer to Hindi when
        // the request was Hindi.
        const dispatch = searchDispatch(query);
        spokenResponse = language.startsWith('hi') ? dispatch.replyHi : dispatch.replyEn;
        // A bare "search" with no query runs no lookup; the Browser can only open
        // its default home. Crediting execution there was the fake-success shape.
        actionExecuted = dispatch.dispatched;
        actionDetail = {
          type: 'google_search',
          title: dispatch.title,
          payload: { query: dispatch.query, target: dispatch.url },
        };
        break;
      }
      case 'create_file': {
        const newNote = {
          id: String(Date.now()),
          title: `Jarvis Note ${new Date().toLocaleDateString()}`,
          content: message.replace(/create file|save note|write note/i, '').trim() || 'New recorded voice note.',
          createdAt: new Date().toISOString(),
        };
        memoryState.notes.unshift(newNote);
        // "saved your note ... stored" is a durability claim. If the write cannot
        // reach disk, roll the note back and say so instead of reporting a save
        // that never happened. Mirrors POST /api/memory's rollback-on-failure.
        const persisted = persistMemory();
        if (persisted) {
          spokenResponse = `I have saved your note to Jarvis_Notes in memory. There is no download endpoint, so this is stored, not exported.`;
        } else {
          memoryState.notes = memoryState.notes.filter((n) => n.id !== newNote.id);
          spokenResponse = `I could not write your note to durable storage, so it was not saved. Please try again.`;
        }
        actionExecuted = true;
        actionDetail = { type: 'create_file', title: persisted ? 'Saved Note' : 'Note Write Failed', payload: { ...newNote, persisted } };
        break;
      }
      case 'system_diagnostic': {
        const live = oracleCloudState.metricsSource === 'live_host' ? oracleCloudState.metrics : null;
        const cpuText = live?.cpuUsage != null ? `${live.cpuUsage}%` : 'unavailable';
        const ramText = live?.ramUsedGb != null ? `${live.ramUsedGb} GB` : 'unavailable';
        spokenResponse = `Jarvis Systems Diagnostic: server process online. ${memoryState.notes.length} note(s) stored. Host CPU ${cpuText}, RAM ${ramText}. Cloud node health and speech-hardware status are not probed from here.`;
        // Reporting measured values is informational — it runs no diagnostic probe
        // and `handleExecuteAction` has no `system_diagnostic` case, so the count of
        // executed actions must not advance. Mirrors the offline engine branch.
        actionExecuted = false;
        actionDetail = { type: 'system_diagnostic', title: 'Diagnostics (informational, no probe run)', payload: { notes: memoryState.notes.length, cpu: cpuText, ram: ramText } };
        break;
      }
      case 'mobile_personal_status':
      case 'morning_briefing': {
        const timeNow = new Date().toLocaleTimeString('hi-IN', { hour: '2-digit', minute: '2-digit' });
        spokenResponse = `सुप्रभात सर। अभी समय ${timeNow} है। मोबाइल ब्रिज डैशबोर्ड खोल रहा हूँ — बैटरी, मौसम और टास्क डेटा केवल तभी दिखेगा जब कोई फ़ोन वास्तव में जुड़ा हो।`;
        actionExecuted = true;
        actionDetail = {
          type: 'open_mobile_personal_status',
          title: 'Mobile Personal Status & Morning Briefing',
          payload: { intent: 'mobile_personal_status', timeNow, note: 'device telemetry shown only when a phone is connected' },
        };
        break;
      }
      case 'language_switch': {
        const payload = intentData.actionPayload || {};
        const targetLang = payload.newLang || (message.includes('हिंदी') ? 'hi-IN' : 'en-US');
        languageChangedTo = targetLang;
        spokenResponse = payload.acknowledgment || (targetLang.startsWith('hi') ? 'जी सर, हिंदी मोड सक्रिय है। अब मैं आपसे हिंदी में बात करूँगा। बताइए, मैं आपकी क्या सहायता करूँ?' : 'Switched to English mode, Sir. How may I assist you?');
        actionExecuted = true;
        actionDetail = { type: 'language_switch', title: `Language switched to ${targetLang}`, payload: { language: targetLang } };
        break;
      }
      case 'time_inquiry': {
        const now = new Date();
        const isHi = language.startsWith('hi') || /[\u0900-\u097F]/.test(message) || message.toLowerCase().includes('kya') || message.toLowerCase().includes('hai') || message.toLowerCase().includes('batao');
        const timeStr = now.toLocaleTimeString(isHi ? 'hi-IN' : 'en-US', { hour: '2-digit', minute: '2-digit' });
        const dateStr = now.toLocaleDateString(isHi ? 'hi-IN' : 'en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        spokenResponse = isHi
          ? `वर्तमान समय ${timeStr} है और आज ${dateStr} है।`
          : `The current time is ${timeStr} on ${dateStr}.`;
        // Reading the clock runs no tool and opens no view: `handleExecuteAction`
        // routes `time_inquiry` only to `setActiveApp('mobile_personal_status')`, which
        // does not read the clock, so crediting the increment inflated the
        // "Autonomous Actions Executed" counter for a question.
        actionExecuted = false;
        actionDetail = { type: 'time_inquiry', title: 'Clock Query (informational, no action taken)', payload: { timeStr, dateStr } };
        break;
      }
      case 'weather_inquiry': {
        const isHi = language.startsWith('hi') || /[\u0900-\u097F]/.test(message) || message.toLowerCase().includes('kya') || message.toLowerCase().includes('hai') || message.toLowerCase().includes('batao');
        // No weather provider is wired into this server process and the Android
        // bridge heartbeat carries no ambient weather reading, so a real value
        // cannot exist. The handler used to print a constant temperature and
        // humidity for 'New Delhi' as if it were a current reading; report the
        // absence instead.
        spokenResponse = isHi
          ? `अभी कोई मौसम स्रोत कनेक्टेड नहीं है, इसलिए मौसम या तापमान का डेटा उपलब्ध नहीं है।`
          : `No weather source is connected, so no weather or temperature data is available.`;
        actionExecuted = false;
        actionDetail = {
          type: 'weather_inquiry',
          title: 'Weather Unavailable (no source connected)',
        };
        break;
      }
      case 'capabilities_inquiry': {
        const isHi = language.startsWith('hi') || /[\u0900-\u097F]/.test(message) || message.toLowerCase().includes('kya') || message.toLowerCase().includes('hai');
        spokenResponse = isHi
          ? `मैं HERMES JARVIS हूँ — आपका ऑटोनॉमस AI असिस्टेंट। मेरी प्रमुख क्षमताएं:\n1. 📱 मोबाइल पर्सनल स्टेटस, बैटरी व मौसम टेलीमेट्री\n2. 🛡️ 4-लेवल सुरक्षा मैट्रिक्स और अनुमति गेटवे\n3. 💼 फ्रीलांस लीड्स व स्वचालित कोटेशन जनरेटर\n4. 📱 सोशल मीडिया पोस्ट्स निर्माण व अनुमोदन\n5. 💻 गिट ऑडिट, फाइल्स एक्सप्लोरर व वेब रिसर्च\n6. 🌐 यूट्यूब वीडियो सारांश व ओरेकल क्लाउड मॉनिटरिंग`
          : `I am HERMES JARVIS — your autonomous AI assistant. My primary capabilities include:\n1. 📱 Mobile Personal Status, battery & weather telemetry\n2. 🛡️ 4-Level Security Matrix & Human Consent Gateway\n3. 💼 Freelance lead management & instant quotation generator\n4. 📱 Social media drafts with Level-4 publishing approval\n5. 💻 Autonomous tools: Git audit, file manager & web research\n6. 🌐 YouTube video summarization & Oracle Always Free cloud monitoring`;
        // Listing capabilities is informational: it opens no view and runs no tool,
        // so it must not be counted as executed work. The offline engine already
        // reports `actionExecuted: false` for this intent (engineInformationalTruth).
        actionExecuted = false;
        actionDetail = { type: 'capabilities_inquiry', title: 'JARVIS Capabilities (informational, no action taken)' };
        break;
      }
      case 'math_computation': {
        const isHi = language.startsWith('hi') || /[\u0900-\u097F]/.test(message) || message.toLowerCase().includes('kya') || message.toLowerCase().includes('hai');
        const rawExpr = intentData.actionPayload?.expression || '';
        const sanitized = rawExpr.replace(/×/g, '*').replace(/÷/g, '/').replace(/[^0-9+\-*/().\s]/g, '').trim();
        let evalResult: number | null = null;
        try {
          if (sanitized && /^[0-9+\-*/().\s]+$/.test(sanitized)) {
            evalResult = Function(`'use strict'; return (${sanitized})`)();
          }
        } catch {
          evalResult = null;
        }

        if (evalResult !== null && !isNaN(evalResult) && isFinite(evalResult)) {
          spokenResponse = isHi
            ? `${rawExpr} का मान ${evalResult} होता है, सर।`
            : `${rawExpr} = ${evalResult}, Sir.`;
          actionExecuted = true;
          actionDetail = { type: 'open_calculator', title: `Math: ${rawExpr} = ${evalResult}`, payload: { expression: rawExpr, result: evalResult } };
        } else {
          // No arithmetic was computed, so this is not an executed action.
          spokenResponse = isHi
            ? `गणना पूरी नहीं हो सकी। कृपया वैध संख्यात्मक अभिव्यक्ति दें।`
            : `Unable to compute expression. Please provide a valid arithmetic formula.`;
          actionExecuted = false;
          actionDetail = { type: 'math_error', title: 'Computation Failed', payload: { expression: rawExpr, result: null } };
        }
        break;
      }
      default: {
        const isHi = language.startsWith('hi') || /[\u0900-\u097F]/.test(message) || message.toLowerCase().includes('kya') || message.toLowerCase().includes('hai');
        const ai = getGenAI();
        if (ai) {
          try {
            // History from the client is authoritative for this turn, but a
            // client that has just reloaded sends none. Fall back to the copy
            // kept on the server so the conversation continues rather than
            // restarting, which previously made JARVIS forget the thread.
            const clientHistory = Array.isArray(history) ? history : [];
            const effectiveHistory =
              clientHistory.length > 0 ? clientHistory : memoryState.conversationHistory ?? [];

            const context = assembleAiContext({
              userName: memoryState.name,
              notes: memoryState.notes,
              customKeyValues: memoryState.customKeyValues,
              history: effectiveHistory,
              redactCredentials: securityMatrixState.credentialLeakProtection,
            });

            if (context.redactedSecretsCount > 0) {
              console.warn(
                `[Security] Credential-leak protection redacted ${context.redactedSecretsCount} secret(s) from the model context (${context.redactedCategories.join(', ')}).`,
              );
            }

            const systemInstruction = `You are HERMES JARVIS, an autonomous AI agent running on an Oracle Always Free ARM Cloud server, controllable via Android Telegram Bot and Web Panel.
${context.systemInstruction}
Active Interaction Language Locale: ${language || 'en-US'}.
Language Guideline: Respond in the user's selected language (${language || 'en-US'}). If set to Hindi (hi-IN) or Hinglish, use natural, respectful Hindi/Hinglish (e.g., 'जी सर', 'सुप्रभात'). If set to another regional language (Spanish, French, German, Japanese, Chinese, Russian, Arabic, etc.), respond naturally and fluently in that language. Otherwise, use crisp, polite British/Global English.
Keep your responses crisp, concise, eloquent, and natural for speech synthesis (1-3 sentences unless asked for details).
Current Status: Phase 0 (Safety) and Phase 1 (Cloud ARM VM) active. Tools: Freelance CRM, Social Media human-approval engine, Proactive daily briefings, and file/git tools.`;

            const contents = [
              ...context.turns.map((h) => ({
                role: h.role === 'jarvis' || h.role === 'model' ? 'model' : 'user',
                parts: [{ text: h.content || '' }],
              })),
              {
                role: 'user',
                parts: [{ text: message }],
              },
            ];

            const result = await ai.models.generateContent({
              model: 'gemini-2.5-flash',
              contents,
              config: {
                systemInstruction,
                temperature: 0.7,
                maxOutputTokens: 350,
              },
            });

            spokenResponse = result.text?.trim() || (isHi ? 'आपकी सेवा में सदैव तत्पर, सर।' : 'At your service, Sir.');
          } catch (geminiErr: any) {
            console.error('Gemini error:', geminiErr);
            spokenResponse = isHi
              ? `क्लाउड एआई सेवा में अस्थायी व्यवधान है। संदेश दर्ज कर लिया गया है: "${message}"।`
              : `Cloud AI service encountered a temporary error. Logged command: "${message}".`;
          }
        } else {
          const userLower = message.toLowerCase().trim();
          const isExactGreeting =
            /^(?:hi|hello|hey)\b/i.test(userLower) ||
            /^(?:नमस्ते|प्रणाम)/i.test(userLower) ||
            userLower === 'नमस्ते' ||
            userLower === 'hello jarvis' ||
            userLower === 'hi jarvis' ||
            userLower === 'hey jarvis';

          if (isExactGreeting) {
            spokenResponse = isHi
              ? `नमस्ते ${memoryState.name || 'सर'}! हरमीस जार्विस ऑनलाइन है और आपकी सेवा में तत्पर है। बताइए, मैं आपकी क्या सहायता करूँ?`
              : `Greetings ${memoryState.name || 'Sir'}. Hermes Jarvis online and standing by on your cloud server. How may I assist you today?`;
          } else if (userLower.includes('who are you') || userLower.includes('तुम कौन हो') || userLower.includes('aap kaun ho')) {
            const host = getLocalHostIdentity();
            spokenResponse = isHi
              ? `मैं हरमीस जार्विस हूँ — आपका ऑटोनॉमस पर्सनल AI असिस्टेंट। मैं होस्ट \`${host.hostname}\` पर चल रहा हूँ${host.isOracleLike ? '' : ' (क्लाउड प्रोवाइडर यहाँ सत्यापित नहीं है)'}।`
              : `I am HERMES JARVIS, your autonomous AI assistant, running on host \`${host.hostname}\`.${host.isOracleLike ? '' : ' The cloud provider is not verified from inside this process.'}`;
          } else if (userLower.includes('how are you') || userLower.includes('कैसे हो') || userLower.includes('kaise ho')) {
            const host = getLocalHostIdentity();
            spokenResponse = isHi
              ? `मैं होस्ट \`${host.hostname}\` पर चल रहा हूँ, ${memoryState.name || 'सर'}। मैं अपनी स्वयं की स्वास्थ्य जाँच नहीं कर सकता, इसलिए "सब ठीक है" कहना असत्य होगा।`
              : `I am running on host \`${host.hostname}\`, ${memoryState.name || 'Sir'}. I cannot health-check myself, so I will not claim all systems are nominal.`;
          } else if (userLower.includes('thank') || userLower.includes('धन्यवाद') || userLower.includes('shukriya')) {
            spokenResponse = isHi
              ? `आपकी सेवा में सदैव तत्पर, ${memoryState.name || 'सर'}।`
              : `Always a pleasure to assist, ${memoryState.name || 'Sir'}.`;
          } else {
            spokenResponse = isHi
              ? `कमांड प्राप्त हुई: "${message}"। डेटा स्थानीय मेमोरी में सुरक्षित है।`
              : `Command acknowledged: "${message}". Logged to local memory. You can ask me to check projects, calculate equations, review weather, or manage social posts.`;
          }
        }
        break;
      }
    }

    if (actionExecuted) {
      memoryState.stats.actionsExecuted += 1;
    }

    // Keep a bounded server-side transcript so a reloaded client still has a
    // conversation to continue from.
    const priorTurns = memoryState.conversationHistory ?? [];
    memoryState.conversationHistory = [
      ...priorTurns,
      { role: 'user' as const, content: message, timestamp: new Date().toISOString() },
      { role: 'jarvis' as const, content: spokenResponse, timestamp: new Date().toISOString() },
    ].slice(-40);

    persistMemory();

    res.json({
      reply: spokenResponse,
      intent: intentData.intent,
      actionExecuted,
      actionDetail,
      languageChangedTo,
      memory: {
        name: memoryState.name,
        notes: memoryState.notes,
        customKeyValues: memoryState.customKeyValues,
        stats: memoryState.stats,
      },
    });
  } catch (error: any) {
    console.error('Chat endpoint error:', error);
    res.status(500).json({
      error: error.message || 'Internal server error',
      reply: 'My primary communication channel encountered a transient anomaly. Re-aligning protocols.',
    });
  }
});

// ==============================================================================
// 9. VITE STATIC SERVING & DAEMON INITIALIZATION
// ==============================================================================
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Daemon] HERMES JARVIS Autonomous Core active on http://0.0.0.0:${PORT} (PID: ${DAEMON_PID})`);
    
    // Initialize Real Telegram Gateway non-blocking
    const cleanToken = getCleanTelegramToken();
    if (cleanToken) {
      setTimeout(() => {
        startTelegramPolling().catch((e) => console.warn('[Telegram Bot] Startup polling notice:', e.message));
      }, 500);
    } else {
      console.log('[Telegram Bot] TELEGRAM_BOT_TOKEN not provided in environment. Simulator & Web Remote mode active.');
    }
  });
}

startServer().catch((err) => {
  console.error('[Server Error] Failed to initialize server:', err);
});
