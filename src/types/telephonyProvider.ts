export type TelephonyCallState =
  | 'IDLE'
  | 'RINGING'
  | 'ANSWERING'
  | 'LISTENING'
  | 'PROCESSING'
  | 'SPEAKING'
  | 'WAITING_FOR_CALLER'
  | 'TRANSFERRING'
  | 'ENDING'
  | 'ENDED'
  | 'FAILED'
  | 'HANDOFF_REQUIRED';

export type TelephonyStatus =
  | 'NOT_CONFIGURED'
  | 'CONFIGURED'
  | 'READY'
  | 'CALL_ACTIVE'
  | 'ERROR';

export type PhonePermissionKey =
  | 'PHONE_INBOUND_ANSWER'
  | 'PHONE_SPEECH_PROCESSING'
  | 'PHONE_CALL_MEMORY'
  | 'PHONE_PRIVATE_DATA_ACCESS'
  | 'PHONE_CALENDAR_ACCESS'
  | 'PHONE_EMAIL_ACCESS'
  | 'PHONE_OUTBOUND_CALL'
  | 'PHONE_CALL_TRANSFER'
  | 'PHONE_RECORDING';

export type PhonePermissionState = 'NOT_CONFIGURED' | 'DENIED' | 'ASK' | 'GRANTED';

export interface PhonePermissionDefinition {
  key: PhonePermissionKey;
  nameEn: string;
  nameHi: string;
  descriptionEn: string;
  descriptionHi: string;
  defaultState: PhonePermissionState;
  level: 1 | 2 | 3 | 4;
}

export interface TelephonyTurn {
  id: string;
  speaker: 'caller' | 'agent' | 'callee' | 'system';
  text: string;
  timestamp: string;
  sentiment?: 'positive' | 'neutral' | 'negative' | 'urgent';
  interrupted?: boolean;
}

export interface TelephonySession {
  callSessionId: string;
  direction: 'inbound' | 'outbound';
  callerIdentifier: string; // Masked for privacy (e.g. "+91 98765*****")
  callerRawNumber: string; // Raw provider number, untrusted
  callerVerified: boolean;
  recipientIdentifier: string;
  recipientRawNumber: string;
  language: 'hi-IN' | 'en-IN' | 'en-US' | string;
  state: TelephonyCallState;
  turns: TelephonyTurn[];
  currentIntent: string;
  toolCalls: Array<{ tool: string; query: string; result: any; timestamp: string }>;
  permissions: Record<PhonePermissionKey, PhonePermissionState>;
  timestamps: {
    initiatedAt: string;
    ringingAt?: string;
    answeredAt?: string;
    endedAt?: string;
  };
  handoffStatus: 'NONE' | 'REQUESTED' | 'TRANSFERRING' | 'CONFIRMED' | 'FAILED' | 'COMPLETED';
  handoffTarget?: string;
  recording: {
    enabled: boolean;
    consentObtained: boolean;
    recordingUrl?: string;
  };
  isSimulated: boolean;
  providerName: string;
  providerCallId?: string;
  lastUtteranceAt?: string;
  silenceCount: number;
  objective?: string;
  summary?: string;
  followUpActions?: string[];
}

export interface TelephonyProvider {
  id: string;
  name: string;
  isConfigured: () => boolean;
  answerIncomingCall: (params: { callSessionId: string; greeting?: string }) => Promise<{ success: boolean; raw?: any; error?: string }>;
  rejectIncomingCall: (params: { callSessionId: string; reason?: string }) => Promise<{ success: boolean; raw?: any; error?: string }>;
  endCall: (params: { callSessionId: string }) => Promise<{ success: boolean; raw?: any; error?: string }>;
  startOutboundCall: (params: {
    callSessionId: string;
    destinationNumber: string;
    fromNumber?: string;
    initialGreeting?: string;
  }) => Promise<{ success: boolean; providerCallId?: string; error?: string }>;
  playAudio: (params: { callSessionId: string; audioUrlOrText: string; language?: string }) => Promise<{ success: boolean; raw?: any; error?: string }>;
  streamAudio: (params: { callSessionId: string; streamUrl: string }) => Promise<{ success: boolean; raw?: any; error?: string }>;
  collectSpeech: (params: { callSessionId: string; promptText?: string; timeoutMs?: number; language?: string }) => Promise<{ success: boolean; raw?: any; error?: string }>;
  transferCall: (params: { callSessionId: string; targetNumber: string }) => Promise<{ success: boolean; providerConfirmed: boolean; message?: string; raw?: any; error?: string }>;
  getCallStatus: (callSessionId: string) => Promise<{ state: TelephonyCallState; raw?: any }>;
  getCallRecordingStatus: (callSessionId: string) => Promise<{ recording: boolean; recordingUrl?: string }>;
  handleWebhook: (req: any, res: any) => Promise<any>;
}

export interface OutboundCallRequest {
  id: string;
  destinationNumber: string;
  destinationMasked: string;
  purpose: string;
  recipientName?: string;
  language: string;
  status: 'PENDING_AUTHORIZATION' | 'AUTHORIZED' | 'REJECTED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  createdAt: string;
  authorizedAt?: string;
  authorizedBy?: string;
  callSessionId?: string;
}
