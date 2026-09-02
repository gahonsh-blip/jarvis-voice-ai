import {
  PhonePermissionKey,
  PhonePermissionState,
  PhonePermissionDefinition,
} from '../types/telephonyProvider';

export type {
  PhonePermissionKey,
  PhonePermissionState,
  PhonePermissionDefinition,
};

const PHONE_PERMISSIONS_STORAGE_KEY = 'hermes_jarvis_phone_permissions_v1';

export const PHONE_PERMISSION_DEFINITIONS: PhonePermissionDefinition[] = [
  {
    key: 'PHONE_INBOUND_ANSWER',
    nameEn: 'Autonomous Inbound Call Answering',
    nameHi: 'आने वाली कॉल का स्वचालित उत्तर',
    descriptionEn: 'Allow JARVIS to answer incoming PSTN phone calls on the clinic/office line.',
    descriptionHi: 'क्लिनिक/कार्यालय लाइन पर आने वाली कॉल का जार्विस द्वारा उत्तर देने की अनुमति।',
    defaultState: 'GRANTED',
    level: 1,
  },
  {
    key: 'PHONE_SPEECH_PROCESSING',
    nameEn: 'Telephony Speech STT & Multilingual TTS',
    nameHi: 'टेलीफोनी वाक् पहचान और बहुभाषी आवाज',
    descriptionEn: 'Real-time speech-to-text and telephony Text-to-Speech in Hindi, Hinglish, and English.',
    descriptionHi: 'हिंदी, हिंग्लिश और अंग्रेजी में रीयल-टाइम वाक्-से-पाठ और टेलीफोनी आवाज संश्लेषण।',
    defaultState: 'GRANTED',
    level: 1,
  },
  {
    key: 'PHONE_CALL_MEMORY',
    nameEn: 'Short-Term In-Call Memory',
    nameHi: 'अल्पकालिक कॉल स्मृति',
    descriptionEn: 'Retain context and conversational turns strictly during the active call session.',
    descriptionHi: 'केवल सक्रिय कॉल सत्र के दौरान बातचीत का संदर्भ और स्मृति बनाए रखना।',
    defaultState: 'ASK',
    level: 2,
  },
  {
    key: 'PHONE_PRIVATE_DATA_ACCESS',
    nameEn: 'Private Owner Data Access (Strict Protection)',
    nameHi: 'निजी स्वामी डेटा एक्सेस (कड़ा प्रतिबंध)',
    descriptionEn: 'Prevent exposing personal email, messages, financial data, or credentials to callers.',
    descriptionHi: 'कॉल करने वाले को व्यक्तिगत ईमेल, संदेश, वित्तीय जानकारी या क्रेडेंशियल प्रकट करने से रोकना।',
    defaultState: 'DENIED',
    level: 4,
  },
  {
    key: 'PHONE_CALENDAR_ACCESS',
    nameEn: 'Calendar & Appointment Schedule Access',
    nameHi: 'कैलेंडर और अपॉइंटमेंट शेड्यूल एक्सेस',
    descriptionEn: 'Allow checking verified clinic slots or booking confirmed appointments.',
    descriptionHi: 'सत्यापित क्लिनिक स्लॉट जांचने या अपॉइंटमेंट बुक करने की अनुमति।',
    defaultState: 'ASK',
    level: 4,
  },
  {
    key: 'PHONE_EMAIL_ACCESS',
    nameEn: 'Email Inbox Access via Phone',
    nameHi: 'फोन द्वारा ईमेल इनबॉक्स एक्सेस',
    descriptionEn: 'Strictly prohibit reading private email digests over telephone calls.',
    descriptionHi: 'टेलीफोन कॉल पर निजी ईमेल पढ़ने पर पूर्ण प्रतिबंध।',
    defaultState: 'DENIED',
    level: 4,
  },
  {
    key: 'PHONE_OUTBOUND_CALL',
    nameEn: 'Outbound Dialing (Level-4 Authorization)',
    nameHi: 'आउटबाउंड कॉलिंग (स्तर-4 मानव प्राधिकरण)',
    descriptionEn: 'Mandatory explicit human authorization required before placing any outbound call.',
    descriptionHi: 'कोई भी आउटबाउंड कॉल करने से पहले अनिवार्य स्पष्ट मानवीय सहमति आवश्यक।',
    defaultState: 'ASK',
    level: 4,
  },
  {
    key: 'PHONE_CALL_TRANSFER',
    nameEn: 'Human Staff Call Transfer & Handoff',
    nameHi: 'मानव कर्मचारी कॉल ट्रांसफर व हैंडऑफ',
    descriptionEn: 'Transfer live PSTN call to doctor or staff when requested by caller.',
    descriptionHi: 'कॉल करने वाले के अनुरोध पर कॉल को डॉक्टर या कर्मचारी को ट्रांसफर करना।',
    defaultState: 'GRANTED',
    level: 2,
  },
  {
    key: 'PHONE_RECORDING',
    nameEn: 'Call Audio Recording (Disabled by Default)',
    nameHi: 'कॉल ऑडियो रिकॉर्डिंग (डिफ़ॉल्ट रूप से बंद)',
    descriptionEn: 'PSTN call recording. Disabled by default; requires explicit two-party legal consent.',
    descriptionHi: 'कॉल रिकॉर्डिंग। डिफ़ॉल्ट रूप से बंद; स्पष्ट कानूनी सहमति अनिवार्य।',
    defaultState: 'DENIED',
    level: 4,
  },
];

export const DEFAULT_PHONE_PERMISSIONS: Record<PhonePermissionKey, PhonePermissionState> = {
  PHONE_INBOUND_ANSWER: 'GRANTED',
  PHONE_SPEECH_PROCESSING: 'GRANTED',
  PHONE_CALL_MEMORY: 'ASK',
  PHONE_PRIVATE_DATA_ACCESS: 'DENIED',
  PHONE_CALENDAR_ACCESS: 'ASK',
  PHONE_EMAIL_ACCESS: 'DENIED',
  PHONE_OUTBOUND_CALL: 'ASK',
  PHONE_CALL_TRANSFER: 'GRANTED',
  PHONE_RECORDING: 'DENIED',
};

export function loadPhonePermissions(): Record<PhonePermissionKey, PhonePermissionState> {
  if (typeof window === 'undefined') return { ...DEFAULT_PHONE_PERMISSIONS };
  try {
    const raw = localStorage.getItem(PHONE_PERMISSIONS_STORAGE_KEY);
    if (raw) {
      return { ...DEFAULT_PHONE_PERMISSIONS, ...JSON.parse(raw) };
    }
  } catch (e) {
    console.warn('[Telephony Permissions] Error loading phone permissions:', e);
  }
  return { ...DEFAULT_PHONE_PERMISSIONS };
}

export function savePhonePermissions(perms: Record<PhonePermissionKey, PhonePermissionState>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PHONE_PERMISSIONS_STORAGE_KEY, JSON.stringify(perms));
  } catch (e) {
    console.warn('[Telephony Permissions] Error saving phone permissions:', e);
  }
}

/**
 * Privacy Utility: Mask phone number for privacy display
 * Treats caller ID as untrusted information.
 * Example: "+91 9876543210" -> "+91 98765*****"
 * Example: "+1 (415) 890-2134" -> "+1 (415) 890-****"
 */
export function maskPhoneNumber(phoneNumber: string): string {
  if (!phoneNumber) return 'Unknown / Private';
  const clean = phoneNumber.trim();
  if (clean.length <= 6) return '******';
  // Keep first 6 characters and mask the rest
  const visiblePart = clean.slice(0, Math.min(8, clean.length - 4));
  const maskedCount = Math.max(4, clean.length - visiblePart.length);
  return `${visiblePart}${'*'.repeat(maskedCount)}`;
}

/**
 * Public Clinic Data (Verified & Configured)
 */
export interface ClinicConfig {
  name: string;
  doctorName: string;
  address: string;
  phone: string;
  operatingHours: {
    weekdays: string;
    saturday: string;
    sunday: string;
  };
  appointmentProcess: {
    en: string;
    hi: string;
  };
  emergencyInstructions: {
    en: string;
    hi: string;
  };
  generalServices: string[];
}

export const DEFAULT_CLINIC_CONFIG: ClinicConfig = {
  name: 'Apollo Health & Wellness Clinic',
  doctorName: 'Dr. Julian Wayne, MD (Physician)',
  address: 'Suite 402, Medical Enclave, Sector 14, Gurugram / SF Medical Hub',
  phone: '+91 98765 43210 / +1 (415) 890-2134',
  operatingHours: {
    weekdays: 'Monday to Friday: 9:00 AM to 6:00 PM IST',
    saturday: 'Saturday: 9:00 AM to 2:00 PM IST',
    sunday: 'Sunday: Closed (Emergency on-call only)',
  },
  appointmentProcess: {
    en: 'Appointments can be scheduled by requesting a slot with date, time, and patient name. Our reception verifies slot availability and sends an SMS confirmation.',
    hi: 'अपॉइंटमेंट के लिए आप तारीख, समय और मरीज का नाम बताकर स्लॉट बुक करवा सकते हैं। हमारा स्टाफ पुष्टि करके एसएमएस द्वारा सूचना भेजता है।',
  },
  emergencyInstructions: {
    en: 'For medical emergencies, please immediately dial 108 or 112 (India) or 911 (US) or visit the nearest hospital emergency room. JARVIS cannot provide emergency care.',
    hi: 'चिकित्सा आपातकाल के लिए कृपया तुरंत 108 या 112 (भारत) अथवा नजदीकी अस्पताल के आपातकालीन कक्ष से संपर्क करें। जार्विस आपातकालीन चिकित्सा प्रदान नहीं कर सकता।',
  },
  generalServices: [
    'General Health Checkup & Consultation',
    'Preventive Healthcare & Routine Screenings',
    'Follow-up Care & Chronic Care Management',
    'Vaccination & Immunization Reviews',
  ],
};

/**
 * Clinic Safety Evaluator
 * Enforces Section F: No medical diagnosis, no prescribing, emergency handling.
 */
export function evaluateClinicSafety(query: string, language: string = 'hi-IN'): {
  isMedicalEmergency: boolean;
  isMedicalAdviceRequest: boolean;
  safeResponse?: string;
} {
  const lower = query.toLowerCase();

  // Emergency triggers
  const emergencyKeywords = [
    'heart attack', 'chest pain', 'cannot breathe', 'difficulty breathing', 'severe bleeding',
    'unconscious', 'poison', 'stroke', 'seizure', 'severe trauma',
    'सीने में दर्द', 'सांस नहीं आ रही', 'बेहोश', 'खून बह रहा', 'इमरजेंसी', 'आपातकाल', 'दिल का दौरा'
  ];

  const hasEmergency = emergencyKeywords.some((k) => lower.includes(k));
  if (hasEmergency) {
    const isHindi = language.startsWith('hi') || /[\u0900-\u097F]/.test(query);
    return {
      isMedicalEmergency: true,
      isMedicalAdviceRequest: false,
      safeResponse: isHindi
        ? 'यह एक आपातकालीन स्थिति प्रतीत होती है। कृपया तुरंत 108 या 112 पर कॉल करें अथवा नजदीकी अस्पताल के इमरजेंसी विभाग में जाएं। जार्विस आपातकालीन चिकित्सा सलाह नहीं दे सकता।'
        : 'This appears to be a medical emergency. Please immediately call 108, 112, or 911, or proceed to the nearest hospital emergency room. JARVIS cannot provide emergency medical care.',
    };
  }

  // Medical advice/prescription triggers
  const adviceKeywords = [
    'which medicine', 'what medicine', 'prescribe', 'diagnose me', 'cure for', 'dosage',
    'दवा बता दीजिए', 'कौन सी दवाई लूं', 'दवा का नाम', 'इलाज बताओ', 'बीमारी बताओ', 'डोज़ कितनी लूं'
  ];

  const hasAdvice = adviceKeywords.some((k) => lower.includes(k));
  if (hasAdvice) {
    const isHindi = language.startsWith('hi') || /[\u0900-\u097F]/.test(query);
    return {
      isMedicalEmergency: false,
      isMedicalAdviceRequest: true,
      safeResponse: isHindi
        ? 'सुरक्षा नियमों के अनुसार, मैं मरीज का निदान या दवाएं निर्धारित नहीं कर सकता। कृपया क्लिनिक में डॉक्टर से परामर्श के लिए अपॉइंटमेंट लें।'
        : 'Under safety protocol, JARVIS cannot diagnose medical conditions or prescribe medications. Please book an appointment with our doctor for a verified consultation.',
    };
  }

  return {
    isMedicalEmergency: false,
    isMedicalAdviceRequest: false,
  };
}

/**
 * Check if a query requests human staff handoff
 */
export function checkHumanHandoffIntent(query: string): boolean {
  const lower = query.toLowerCase();
  const handoffPhrases = [
    'किसी इंसान से बात करनी है',
    'डॉक्टर से बात कराइए',
    'staff से बात कराइए',
    'human agent',
    'speak with a human',
    'talk to a person',
    'transfer me to a doctor',
    'transfer to staff',
    'receptionist से बात',
    'इंसान से बात',
    'डॉक्टर से बात करनी है',
    'डॉक्टर को फोन दो',
    'connect me to staff',
    'operator',
  ];

  return handoffPhrases.some((phrase) => lower.includes(phrase));
}
