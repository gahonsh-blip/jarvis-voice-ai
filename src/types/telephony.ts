export type CallDirection = 'outbound' | 'inbound';

export type CallStatus =
  | 'idle'
  | 'dialing'
  | 'ringing'
  | 'connected'
  | 'in_call'
  | 'on_hold'
  | 'ended'
  | 'busy'
  | 'declined'
  | 'failed';

export type CallHandlingMode =
  | 'ai_autonomous'   // AI handles entire conversation
  | 'ai_copilot'      // User talks, AI whispers suggestions & notes
  | 'ai_screening'    // AI screens caller before ringing user
  | 'direct_user';    // Direct user-to-callee pass-through

export type CallSentiment = 'positive' | 'neutral' | 'negative' | 'urgent';

export interface CallTurn {
  id: string;
  speaker: 'agent' | 'caller' | 'callee' | 'system' | 'whisper';
  text: string;
  timestamp: string;
  sentiment?: CallSentiment;
}

export interface CallRecord {
  id: string;
  direction: CallDirection;
  callerNumber: string;
  callerName: string;
  recipientNumber: string;
  recipientName: string;
  startTime: string;
  endTime?: string;
  durationSeconds: number;
  status: CallStatus;
  mode: CallHandlingMode;
  objective?: string;
  transcript: CallTurn[];
  summary: string;
  sentiment: CallSentiment;
  intent: string;
  followUpActions: string[];
  audioRecordingUrl?: string;
  notes?: string;
  spamScore?: number; // 0 to 100
  spamKeywords?: string[];
  aiPersona?: string;
}

export interface TelephonySettings {
  provider: 'browser_webrtc_simulator' | 'twilio' | 'sip';
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioPhoneNumber: string;
  autoAnswerInbound: boolean;
  autoAnswerDelaySeconds: number;
  aiReceptionistGreeting: string;
  aiPersona: 'executive_assistant' | 'tech_specialist' | 'concierge' | 'friendly_receptionist';
  spamScreeningEnabled: boolean;
  spamThresholdScore: number; // e.g. 70
  acousticFilterEnabled: boolean; // Telephony bandpass audio simulation
  dtmfAudioEnabled: boolean;
  recordingEnabled: boolean;
  forwardUrgentToTelegram: boolean;
  voiceLanguage: string;
  voicePitch: number;
  voiceRate: number;
  maskUnknownCallerId?: boolean; // Privacy-first toggle: dynamically masks caller ID names to 'Unknown Caller' if number not in contacts
}

export interface ContactItem {
  id: string;
  name: string;
  number: string;
  role: string;
  company: string;
  category: 'personal' | 'business' | 'medical' | 'service' | 'vip';
  notes: string;
  avatarColor?: string;
}

export interface CallScenarioPreset {
  id: string;
  title: string;
  category: 'business' | 'personal' | 'customer_service' | 'scheduling';
  recipientName: string;
  recipientNumber: string;
  objective: string;
  initialPrompt: string;
  suggestedPersona: 'executive_assistant' | 'tech_specialist' | 'concierge' | 'friendly_receptionist';
}

export interface SimulatedCallerPersona {
  id: string;
  callerName: string;
  callerNumber: string;
  callerRole: string;
  scenarioTitle: string;
  firstLine: string;
  callerPersonality: string;
  goal: string;
  intent?: string;
  isSpam?: boolean;
}

export const DEFAULT_TELEPHONY_SETTINGS: TelephonySettings = {
  provider: 'browser_webrtc_simulator',
  twilioAccountSid: '',
  twilioAuthToken: '',
  twilioPhoneNumber: '+1 (555) 728-4827', // JARVIS simulated carrier number
  autoAnswerInbound: true,
  autoAnswerDelaySeconds: 2,
  aiReceptionistGreeting:
    "Hello, thank you for calling. You have reached Alex's AI Executive Assistant, JARVIS. How may I assist you today?",
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
  maskUnknownCallerId: true,
};

export const DEFAULT_CONTACTS: ContactItem[] = [
  {
    id: 'c1',
    name: 'Dr. Julian Wayne',
    number: '+1 (415) 890-2134',
    role: 'Chief Medical Officer',
    company: 'San Francisco Health Clinic',
    category: 'medical',
    notes: 'Regular physician. Appointments usually on Tuesdays/Fridays.',
    avatarColor: 'bg-emerald-600',
  },
  {
    id: 'c2',
    name: 'Elena Rostova',
    number: '+1 (212) 555-8941',
    role: 'Principal Partner',
    company: 'Vanguard Ventures NY',
    category: 'vip',
    notes: 'Lead series A investor. Prefers concise morning briefings.',
    avatarColor: 'bg-purple-600',
  },
  {
    id: 'c3',
    name: 'Apex Courier Logistics',
    number: '+1 (800) 459-2041',
    role: 'Dispatch & Delivery',
    company: 'Apex Express Logistics',
    category: 'service',
    notes: 'Gate access code: #4092. Leave packages at front reception.',
    avatarColor: 'bg-amber-600',
  },
  {
    id: 'c4',
    name: 'Marcus Sterling',
    number: '+44 20 7946 0912',
    role: 'Head of Engineering',
    company: 'Aether Cloud Solutions London',
    category: 'business',
    notes: 'Infrastructure and Oracle Cloud cluster coordination.',
    avatarColor: 'bg-cyan-600',
  },
  {
    id: 'c5',
    name: 'Tech Support & NOC',
    number: '+1 (888) 992-0491',
    role: 'Network Operations Center',
    company: 'Enterprise Telecom & Cloud',
    category: 'service',
    notes: 'High priority for network or server downtime inquiries.',
    avatarColor: 'bg-blue-600',
  },
];

export const CALL_SCENARIO_PRESETS: CallScenarioPreset[] = [
  {
    id: 'reschedule_doctor',
    title: 'Reschedule Doctor Appointment',
    category: 'scheduling',
    recipientName: 'Dr. Julian Wayne Clinic',
    recipientNumber: '+1 (415) 890-2134',
    objective:
      'Reschedule upcoming Tuesday medical checkup to Friday afternoon between 2:00 PM and 4:00 PM. Confirm copay and location.',
    initialPrompt:
      'Hello, this is JARVIS calling on behalf of Alex. I would like to check Dr. Wayne’s availability to reschedule Alex’s Tuesday appointment to this Friday afternoon.',
    suggestedPersona: 'executive_assistant',
  },
  {
    id: 'flight_inquiry',
    title: 'Airline Baggage Claim Inquiry',
    category: 'customer_service',
    recipientName: 'Delta Airlines Priority Support',
    recipientNumber: '+1 (800) 221-1212',
    objective:
      'Inquire about delayed luggage on Flight DL 482 from JFK to SFO. Reference tracking tag #DL-94821-B. Request delivery to residence.',
    initialPrompt:
      'Hello, calling regarding delayed luggage for Flight DL 482 with baggage reference DL-94821-B. Could you update us on dispatch status?',
    suggestedPersona: 'concierge',
  },
  {
    id: 'client_discovery_call',
    title: 'Lead Qualification & CRM Discovery',
    category: 'business',
    recipientName: 'Elena Rostova (Vanguard)',
    recipientNumber: '+1 (212) 555-8941',
    objective:
      'Present a brief 2-minute status report on the autonomous agent architecture, confirm next Tuesday’s executive demo at 10 AM EST, and record any special agenda items.',
    initialPrompt:
      'Good morning Ms. Rostova, this is JARVIS, Alex’s autonomous assistant. Alex asked me to touch base regarding Tuesday’s upcoming 10 AM demonstration.',
    suggestedPersona: 'executive_assistant',
  },
  {
    id: 'restaurant_reservation',
    title: 'VIP Dinner Table Reservation',
    category: 'personal',
    recipientName: 'Le Bistro Étoilé',
    recipientNumber: '+1 (415) 555-0182',
    objective:
      'Reserve a quiet booth table for 3 guests this Saturday at 7:30 PM. Mention anniversary occasion and request a patio view if available.',
    initialPrompt:
      'Good evening, this is JARVIS calling to request a dinner reservation for party of 3 this Saturday at 7:30 PM.',
    suggestedPersona: 'concierge',
  },
  {
    id: 'cloud_infra_support',
    title: 'Data Center NOC Fiber Escalation',
    category: 'business',
    recipientName: 'Enterprise Telecom NOC',
    recipientNumber: '+1 (888) 992-0491',
    objective:
      'Open a Priority-2 ticket regarding packet jitter on the US-West primary uplink. Request technician verification on BGP route flaps.',
    initialPrompt:
      'Hello, this is an automated telemetry notice from JARVIS Ops. We are observing 12% packet jitter on Circuit ID #WEST-902-F. Requesting NOC diagnostic run.',
    suggestedPersona: 'tech_specialist',
  },
];

export const SIMULATED_INCOMING_CALLERS: SimulatedCallerPersona[] = [
  {
    id: 'in_client_urgent',
    callerName: 'Elena Rostova',
    callerNumber: '+1 (212) 555-8941',
    callerRole: 'Managing Director, Vanguard Ventures',
    scenarioTitle: 'VIP Client: Urgent Meeting Inquiry',
    firstLine:
      'Hi Alex, it is Elena from Vanguard. Are you free for a quick 5-minute sync regarding the Q3 deployment timeline?',
    callerPersonality: 'Professional, articulate, punctual, decisive',
    goal: 'Confirm if Alex is available today at 4 PM for an urgent review or have JARVIS take the meeting time.',
    isSpam: false,
  },
  {
    id: 'in_delivery_driver',
    callerName: 'Dave (Apex Logistics)',
    callerNumber: '+1 (800) 459-2041',
    callerRole: 'Courier Driver',
    scenarioTitle: 'Package Delivery: Gate Code Request',
    firstLine:
      'Hey, this is Dave from Apex Courier down at the front security gate. I have an express parcel here, what was the gate buzzer code again?',
    callerPersonality: 'Casual, rushed, noisy street background, friendly',
    goal: 'Get the building gate code (#4092) and leave the parcel safely at the front door.',
    isSpam: false,
  },
  {
    id: 'in_clinic_confirm',
    callerName: 'Sarah from Dr. Wayne’s Office',
    callerNumber: '+1 (415) 890-2134',
    callerRole: 'Medical Receptionist',
    scenarioTitle: 'Doctor Office: Confirming Friday Checkup',
    firstLine:
      'Hello Alex, this is Sarah from Dr. Wayne’s medical office calling to confirm your appointment scheduled for this Friday at 3:00 PM.',
    callerPersonality: 'Polite, calm, professional medical staff',
    goal: 'Confirm appointment attendance and advise patient to arrive 10 minutes early with photo ID.',
    isSpam: false,
  },
  {
    id: 'in_spam_solar',
    callerName: 'National Green Solar Solutions',
    callerNumber: '+1 (800) 991-8273',
    callerRole: 'Robo-Solicitor',
    scenarioTitle: 'Spam Call: Government Solar Incentive Solicitation',
    firstLine:
      'Congratulations homeowner! You have been pre-selected to receive zero-cost solar panel installation under new federal utility bill reduction programs...',
    callerPersonality: 'Aggressive scripted sales telemarketer, pauses waiting for confirmation',
    goal: 'Get credit card or utility account number to qualify for free panels.',
    isSpam: true,
  },
  {
    id: 'in_recruiter_tech',
    callerName: 'Liam Chen',
    callerNumber: '+1 (650) 334-9182',
    callerRole: 'Executive Talent Partner, OpenAI Ecosystem',
    scenarioTitle: 'Recruiter: Principal Voice AI Architect',
    firstLine:
      'Hi Alex, Liam here from NextGen AI search. I saw your autonomous voice agent framework and wanted to discuss a Founding Architect position. Do you have a moment?',
    callerPersonality: 'High energy, enthusiastic, flattering, tech-savvy',
    goal: 'Schedule a 20-minute intro chat with the CEO next week and understand salary expectations.',
    isSpam: false,
  },
];

/**
 * Strips all non-digit characters from a phone number string
 */
export function normalizePhoneNumber(num: string | undefined | null): string {
  if (!num) return '';
  return num.replace(/\D/g, '');
}

/**
 * Checks whether a given phone number matches any entry in the contacts list.
 * Matches on full digit equality or standard 7/10-digit suffix matching (e.g., matching with/without +1 country code).
 */
export function isNumberInContacts(
  number: string | undefined | null,
  contactsList: ContactItem[]
): boolean {
  if (!number || !contactsList || contactsList.length === 0) return false;
  const targetDigits = normalizePhoneNumber(number);
  if (!targetDigits || targetDigits.length < 5) return false;

  return contactsList.some((c) => {
    const contactDigits = normalizePhoneNumber(c.number);
    if (!contactDigits) return false;
    if (contactDigits === targetDigits) return true;
    if (targetDigits.length >= 7 && contactDigits.length >= 7) {
      return targetDigits.endsWith(contactDigits) || contactDigits.endsWith(targetDigits);
    }
    return false;
  });
}

/**
 * Dynamically resolves the caller name based on privacy settings and contact list membership.
 * When maskUnknownEnabled is true and the callerNumber is NOT in contactsList, returns 'Unknown Caller'.
 */
export function getDisplayCallerName(
  callerName: string | undefined | null,
  callerNumber: string | undefined | null,
  contactsList: ContactItem[],
  maskUnknownEnabled: boolean = true
): string {
  const raw = (callerName && callerName.trim()) || 'Unknown Caller';
  if (!maskUnknownEnabled) {
    return raw;
  }
  if (!callerNumber) {
    return 'Unknown Caller';
  }
  const inContacts = isNumberInContacts(callerNumber, contactsList);
  if (inContacts) {
    const matched = contactsList.find((c) => {
      const t = normalizePhoneNumber(callerNumber);
      const cd = normalizePhoneNumber(c.number);
      return cd === t || (t.length >= 7 && cd.length >= 7 && (t.endsWith(cd) || cd.endsWith(t)));
    });
    return matched ? matched.name : raw;
  }
  return 'Unknown Caller';
}

export const DEFAULT_CALL_RECORDS: CallRecord[] = [
  {
    id: 'call_rec_101',
    direction: 'inbound',
    callerNumber: '+1 (212) 555-8941',
    callerName: 'Elena Rostova',
    recipientNumber: '+1 (555) 728-4827',
    recipientName: 'Alex (Executive)',
    startTime: new Date(Date.now() - 3600000 * 2).toISOString(),
    endTime: new Date(Date.now() - 3600000 * 2 + 145000).toISOString(),
    durationSeconds: 145,
    status: 'ended',
    mode: 'ai_autonomous',
    summary: 'Elena Rostova called to coordinate the Series A roadmap meeting and confirmed demo availability for Tuesday morning.',
    sentiment: 'positive',
    intent: 'vip_schedule_sync',
    followUpActions: [
      'Email executive demo link to Elena for Tuesday 10 AM EST',
      'Prepare 2-page brief on autonomous voice agent benchmarks',
    ],
    transcript: [
      {
        id: 't1',
        speaker: 'agent',
        text: "Hello, you have reached Alex's AI Executive Assistant, JARVIS. How may I assist you today?",
        timestamp: '10:14:02 AM',
      },
      {
        id: 't2',
        speaker: 'caller',
        text: 'Hi JARVIS, it is Elena from Vanguard. Are you able to confirm Tuesday morning for our executive demo?',
        timestamp: '10:14:08 AM',
      },
      {
        id: 't3',
        speaker: 'agent',
        text: 'Certainly, Ms. Rostova. Alex is confirmed for Tuesday at 10:00 AM EST. I have added the session to the calendar and notified the team.',
        timestamp: '10:14:15 AM',
      },
    ],
  },
  {
    id: 'call_rec_102',
    direction: 'inbound',
    callerNumber: '+1 (800) 991-8273',
    callerName: 'National Green Solar Solutions',
    recipientNumber: '+1 (555) 728-4827',
    recipientName: 'Alex (Executive)',
    startTime: new Date(Date.now() - 3600000 * 4).toISOString(),
    endTime: new Date(Date.now() - 3600000 * 4 + 22000).toISOString(),
    durationSeconds: 22,
    status: 'declined',
    mode: 'ai_screening',
    spamScore: 94,
    spamKeywords: ['solar panel', 'zero-cost', 'federal grant', 'pre-selected'],
    summary: 'Autonomous Spam Shield detected high-probability telemarketer robo-solicitation and cleanly terminated the connection.',
    sentiment: 'negative',
    intent: 'spam_telemarketing',
    followUpActions: ['Blacklist +1 (800) 991-8273 from incoming trunk'],
    transcript: [
      {
        id: 't1',
        speaker: 'agent',
        text: "Hello, Alex's AI Assistant here. Please state the purpose of your call.",
        timestamp: '08:22:01 AM',
      },
      {
        id: 't2',
        speaker: 'caller',
        text: 'Congratulations! You are eligible for zero-cost utility solar panel installations under federal law...',
        timestamp: '08:22:06 AM',
      },
      {
        id: 't3',
        speaker: 'agent',
        text: 'Unsolicited marketing is not accepted on this direct line. Goodbye.',
        timestamp: '08:22:12 AM',
      },
    ],
  },
  {
    id: 'call_rec_103',
    direction: 'inbound',
    callerNumber: '+1 (650) 334-9182',
    callerName: 'Liam Chen',
    recipientNumber: '+1 (555) 728-4827',
    recipientName: 'Alex (Executive)',
    startTime: new Date(Date.now() - 3600000 * 6).toISOString(),
    endTime: new Date(Date.now() - 3600000 * 6 + 88000).toISOString(),
    durationSeconds: 88,
    status: 'ended',
    mode: 'ai_autonomous',
    summary: 'Recruiter Liam Chen inquired about Alex’s availability for a Founding Voice AI Architect role. JARVIS took detailed message and requested formal JD via email.',
    sentiment: 'neutral',
    intent: 'recruitment_inquiry',
    followUpActions: ['Check email inbox for incoming job specification from Liam'],
    transcript: [
      {
        id: 't1',
        speaker: 'agent',
        text: "Alex's office, JARVIS speaking. How can I direct your call?",
        timestamp: '06:40:11 AM',
      },
      {
        id: 't2',
        speaker: 'caller',
        text: 'Hi, Liam Chen here from NextGen AI search. Calling about a principal voice architect opportunity.',
        timestamp: '06:40:19 AM',
      },
      {
        id: 't3',
        speaker: 'agent',
        text: 'Alex is currently occupied. Please forward the technical specification and compensation package to Alex via email.',
        timestamp: '06:40:27 AM',
      },
    ],
  },
  {
    id: 'call_rec_104',
    direction: 'inbound',
    callerNumber: '+1 (800) 459-2041',
    callerName: 'Dave (Apex Logistics)',
    recipientNumber: '+1 (555) 728-4827',
    recipientName: 'Alex (Executive)',
    startTime: new Date(Date.now() - 3600000 * 12).toISOString(),
    endTime: new Date(Date.now() - 3600000 * 12 + 42000).toISOString(),
    durationSeconds: 42,
    status: 'ended',
    mode: 'ai_autonomous',
    summary: 'Apex courier requested front gate security access code (#4092) and confirmed delivery of express server hardware parts.',
    sentiment: 'positive',
    intent: 'delivery_gate_code',
    followUpActions: ['Retrieve hardware package from front reception'],
    transcript: [
      {
        id: 't1',
        speaker: 'caller',
        text: 'Hey Dave here from Apex Courier, what was the gate buzzer code again?',
        timestamp: '01:10:04 PM',
      },
      {
        id: 't2',
        speaker: 'agent',
        text: 'Gate buzzer code is #4092. Please leave parcel at the front reception desk.',
        timestamp: '01:10:10 PM',
      },
    ],
  },
  {
    id: 'call_rec_105',
    direction: 'outbound',
    callerNumber: '+1 (555) 728-4827',
    callerName: 'JARVIS Autonomous Voice Gateway',
    recipientNumber: '+1 (415) 890-2134',
    recipientName: 'Dr. Julian Wayne Clinic',
    startTime: new Date(Date.now() - 3600000 * 24).toISOString(),
    endTime: new Date(Date.now() - 3600000 * 24 + 180000).toISOString(),
    durationSeconds: 180,
    status: 'ended',
    mode: 'ai_autonomous',
    summary: 'Rescheduled Alex’s Tuesday routine checkup to Friday afternoon between 2:00 PM and 4:00 PM. Reception confirmed copay remains unchanged.',
    sentiment: 'positive',
    intent: 'appointment_reschedule',
    followUpActions: ['Update Google Calendar with revised Friday 3:00 PM appointment slot'],
    transcript: [
      {
        id: 't1',
        speaker: 'agent',
        text: 'Good afternoon, this is JARVIS calling on behalf of Alex to reschedule the Tuesday appointment.',
        timestamp: '02:00:10 PM',
      },
      {
        id: 't2',
        speaker: 'callee',
        text: 'Hello JARVIS. We have an opening with Dr. Wayne this Friday at 3:00 PM.',
        timestamp: '02:00:19 PM',
      },
    ],
  },
];

