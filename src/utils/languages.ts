export interface LanguageOption {
  code: string;
  name: string;
  nativeName: string;
  region: string;
  flag: string;
  geminiPromptDesc: string;
  samplePhrase: string;
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  {
    code: 'auto',
    name: 'Auto-Detect (Hindi / English / Hinglish)',
    nativeName: 'ऑटो पहचान (Auto-Detect)',
    region: 'Adaptive',
    flag: '🌐',
    geminiPromptDesc: 'Automatically detect the user\'s language (Hindi, Hinglish, or English) and reply fluently in that exact language with natural cadence and tone.',
    samplePhrase: 'Ready in any language. आप जिस भाषा में बोलेंगे, मैं उसी में उत्तर दूँगा।',
  },
  {
    code: 'hi-IN',
    name: 'Hindi (India) — हिंदी',
    nativeName: 'हिन्दी (भारत)',
    region: 'South Asia',
    flag: '🇮🇳',
    geminiPromptDesc: 'Authentic respectful conversational Hindi while preserving technical terms (YouTube, OAuth, API, Telegram, GitHub). Avoid excessive "सर/Sir" repetition.',
    samplePhrase: 'सुप्रभात सर। आपकी आज्ञा अनुसार सभी सिस्टम सक्रिय हैं।',
  },
  {
    code: 'hinglish',
    name: 'Hinglish (Conversational Mix)',
    nativeName: 'Hinglish (हिंग्लिश)',
    region: 'South Asia',
    flag: '🇮🇳',
    geminiPromptDesc: 'Natural bilingual Hindi-English conversational mix. Speak smoothly with natural Indian conversational flow, polite and concise.',
    samplePhrase: 'सर, आपका YouTube status update ready है। All systems nominal hain.',
  },
  {
    code: 'en-US',
    name: 'English (United States)',
    nativeName: 'English (US)',
    region: 'North America',
    flag: '🇺🇸',
    geminiPromptDesc: 'English (US / Global standard) — calm, concise, professional, avoiding unnecessary robotic phrasing.',
    samplePhrase: 'At your service, Sir. Systems standing by.',
  },
  {
    code: 'en-GB',
    name: 'English (United Kingdom)',
    nativeName: 'English (UK)',
    region: 'Europe',
    flag: '🇬🇧',
    geminiPromptDesc: 'British English — polite, eloquent British cadence, crisp and respectful.',
    samplePhrase: 'Right away, Sir. Subsystems operational.',
  },
  {
    code: 'en-IN',
    name: 'English (India)',
    nativeName: 'English (India)',
    region: 'South Asia',
    flag: '🇮🇳',
    geminiPromptDesc: 'Indian English (crisp, professional, calm).',
    samplePhrase: 'Online and ready, Sir. All cloud nodes nominal.',
  },
  {
    code: 'es-ES',
    name: 'Spanish (Spain / International)',
    nativeName: 'Español',
    region: 'Europe / Latin America',
    flag: '🇪🇸',
    geminiPromptDesc: 'Spanish (Español - formal and courteous, "A su servicio, Señor")',
    samplePhrase: 'A su servicio, Señor. Todos los sistemas están listos.',
  },
  {
    code: 'es-MX',
    name: 'Spanish (Mexico / Latin America)',
    nativeName: 'Español (México)',
    region: 'Latin America',
    flag: '🇲🇽',
    geminiPromptDesc: 'Latin American Spanish (courteous, efficient)',
    samplePhrase: 'A la orden, Señor. Procesando su solicitud.',
  },
  {
    code: 'fr-FR',
    name: 'French (France)',
    nativeName: 'Français',
    region: 'Europe',
    flag: '🇫🇷',
    geminiPromptDesc: 'French (Français - elegant, formal "À vos ordres, Monsieur")',
    samplePhrase: 'À vos ordres, Monsieur. Systèmes entièrement opérationnels.',
  },
  {
    code: 'de-DE',
    name: 'German (Germany)',
    nativeName: 'Deutsch',
    region: 'Europe',
    flag: '🇩🇪',
    geminiPromptDesc: 'German (Deutsch - precise, courteous "Zu Ihren Diensten, Sir")',
    samplePhrase: 'Zu Ihren Diensten, Sir. Alle Systeme arbeiten einwandfrei.',
  },
  {
    code: 'ja-JP',
    name: 'Japanese (Japan)',
    nativeName: '日本語',
    region: 'East Asia',
    flag: '🇯🇵',
    geminiPromptDesc: 'Japanese (日本語 - polite keigo/desu-masu "かしこまりました、ご主人様")',
    samplePhrase: 'かしこまりました。システムは正常に稼働しております。',
  },
  {
    code: 'zh-CN',
    name: 'Chinese (Simplified)',
    nativeName: '中文 (简体)',
    region: 'East Asia',
    flag: '🇨🇳',
    geminiPromptDesc: 'Simplified Chinese (中文 - efficient, courteous "随时为您效劳，先生")',
    samplePhrase: '随时为您效劳，先生。所有系统运行正常。',
  },
  {
    code: 'zh-TW',
    name: 'Chinese (Traditional)',
    nativeName: '中文 (繁體)',
    region: 'East Asia',
    flag: '🇹🇼',
    geminiPromptDesc: 'Traditional Chinese (繁體中文 - polite, courteous)',
    samplePhrase: '隨時為您效勞，先生。所有系統運行正常。',
  },
  {
    code: 'pt-BR',
    name: 'Portuguese (Brazil)',
    nativeName: 'Português (Brasil)',
    region: 'South America',
    flag: '🇧🇷',
    geminiPromptDesc: 'Brazilian Portuguese (Português - cordial, efficient)',
    samplePhrase: 'Às suas ordens, Senhor. Todos os sistemas operacionais.',
  },
  {
    code: 'ru-RU',
    name: 'Russian (Russia)',
    nativeName: 'Русский',
    region: 'Eurasia',
    flag: '🇷🇺',
    geminiPromptDesc: 'Russian (Русский - polite, calm, authoritative)',
    samplePhrase: 'К вашим услугам, сэр. Все системы работают штатно.',
  },
  {
    code: 'ar-SA',
    name: 'Arabic (Saudi Arabia / Standard)',
    nativeName: 'العربية',
    region: 'Middle East',
    flag: '🇸🇦',
    geminiPromptDesc: 'Modern Standard Arabic (العربية - formal, respectful)',
    samplePhrase: 'تحت أمرك يا سيدي. جميع الأنظمة تعمل بكفاءة تامة.',
  },
  {
    code: 'it-IT',
    name: 'Italian (Italy)',
    nativeName: 'Italiano',
    region: 'Europe',
    flag: '🇮🇹',
    geminiPromptDesc: 'Italian (Italiano - polite, refined "Ai suoi ordini, Signore")',
    samplePhrase: 'Ai suoi ordini, Signore. Tutti i sistemi sono pronti.',
  },
  {
    code: 'ko-KR',
    name: 'Korean (South Korea)',
    nativeName: '한국어',
    region: 'East Asia',
    flag: '🇰🇷',
    geminiPromptDesc: 'Korean (한국어 - polite hasipsio-che / jon-daet-mal)',
    samplePhrase: '명령을 받들겠습니다. 모든 시스템이 정상 작동 중입니다.',
  },
  {
    code: 'nl-NL',
    name: 'Dutch (Netherlands)',
    nativeName: 'Nederlands',
    region: 'Europe',
    flag: '🇳🇱',
    geminiPromptDesc: 'Dutch (Nederlands - courteous, clear)',
    samplePhrase: 'Tot uw dienst, meneer. Alle systemen zijn online.',
  },
  {
    code: 'tr-TR',
    name: 'Turkish (Turkey)',
    nativeName: 'Türkçe',
    region: 'Middle East / Europe',
    flag: '🇹🇷',
    geminiPromptDesc: 'Turkish (Türkçe - respectful, prompt)',
    samplePhrase: 'Emrinizdeyim efendim. Tüm sistemler aktif ve hazır.',
  },
  {
    code: 'bn-IN',
    name: 'Bengali (India / Bangladesh)',
    nativeName: 'বাংলা',
    region: 'South Asia',
    flag: '🇮🇳',
    geminiPromptDesc: 'Bengali (বাংলা - respectful, polite)',
    samplePhrase: 'আপনার সেবায় প্রস্তুত, স্যার। সমস্ত সিস্টেম সক্রিয় রয়েছে।',
  },
  {
    code: 'ta-IN',
    name: 'Tamil (India)',
    nativeName: 'தமிழ்',
    region: 'South Asia',
    flag: '🇮🇳',
    geminiPromptDesc: 'Tamil (தமிழ் - respectful, courteous)',
    samplePhrase: 'உங்கள் கட்டளைக்கு காத்திருக்கிறேன், ஐயா. அனைத்து அமைப்புகளும் தயார்.',
  },
  {
    code: 'te-IN',
    name: 'Telugu (India)',
    nativeName: 'తెలుగు',
    region: 'South Asia',
    flag: '🇮🇳',
    geminiPromptDesc: 'Telugu (తెలుగు - respectful, prompt)',
    samplePhrase: 'మీ ఆదేశాల కొరకు వేచివున్నాను, సర్. అన్ని సిస్టమ్‌లు సిద్ధంగా ఉన్నాయి.',
  },
  {
    code: 'mr-IN',
    name: 'Marathi (India)',
    nativeName: 'मराठी',
    region: 'South Asia',
    flag: '🇮🇳',
    geminiPromptDesc: 'Marathi (मराठी - respectful, polite)',
    samplePhrase: 'आपल्या सेवेत हजर आहे, सर. सर्व प्रणाली कार्यरत आहेत.',
  },
  {
    code: 'gu-IN',
    name: 'Gujarati (India)',
    nativeName: 'ગુજરાતી',
    region: 'South Asia',
    flag: '🇮🇳',
    geminiPromptDesc: 'Gujarati (ગુજરાતી - courteous, polite)',
    samplePhrase: 'આપની સેવામાં હાજર છું, સર. બધી સિસ્ટમ તૈયાર છે.',
  },
  {
    code: 'pa-IN',
    name: 'Punjabi (India)',
    nativeName: 'ਪੰਜਾਬੀ',
    region: 'South Asia',
    flag: '🇮🇳',
    geminiPromptDesc: 'Punjabi (ਪੰਜਾਬੀ - courteous, prompt)',
    samplePhrase: 'ਤੁਹਾਡੀ ਸੇਵਾ ਵਿੱਚ ਹਾਜ਼ਰ ਹਾਂ, ਸਰ। ਸਾਰੇ ਸਿਸਟਮ ਤਿਆਰ ਹਨ।',
  },
  {
    code: 'ur-PK',
    name: 'Urdu (Pakistan / India)',
    nativeName: 'اردو',
    region: 'South Asia',
    flag: '🇵🇰',
    geminiPromptDesc: 'Urdu (اردو - courteous, respectful, adab-e-guftugu)',
    samplePhrase: 'حاضر ہوں جناب۔ تمام سسٹمز مکمل طور پر فعال ہیں۔',
  },
  {
    code: 'id-ID',
    name: 'Indonesian (Indonesia)',
    nativeName: 'Bahasa Indonesia',
    region: 'Southeast Asia',
    flag: '🇮🇩',
    geminiPromptDesc: 'Indonesian (Bahasa Indonesia - polite, professional)',
    samplePhrase: 'Siap melayani Anda, Tuan. Semua sistem berjalan normal.',
  },
  {
    code: 'vi-VN',
    name: 'Vietnamese (Vietnam)',
    nativeName: 'Tiếng Việt',
    region: 'Southeast Asia',
    flag: '🇻🇳',
    geminiPromptDesc: 'Vietnamese (Tiếng Việt - courteous, clear)',
    samplePhrase: 'Sẵn sàng phục vụ bạn, thưa Ngài. Mọi hệ thống đều sẵn sàng.',
  },
  {
    code: 'pl-PL',
    name: 'Polish (Poland)',
    nativeName: 'Polski',
    region: 'Europe',
    flag: '🇵🇱',
    geminiPromptDesc: 'Polish (Polski - polite, professional)',
    samplePhrase: 'Do usług, proszę pana. Wszystkie systemy działają sprawnie.',
  },
  {
    code: 'sv-SE',
    name: 'Swedish (Sweden)',
    nativeName: 'Svenska',
    region: 'Europe',
    flag: '🇸🇪',
    geminiPromptDesc: 'Swedish (Svenska - polite, clear)',
    samplePhrase: 'Till er tjänst, herrn. Alla system är redo.',
  },
];

export function getLanguageOption(code?: string): LanguageOption {
  if (!code) return SUPPORTED_LANGUAGES.find((l) => l.code === 'en-US') || SUPPORTED_LANGUAGES[3];
  if (code === 'auto') return SUPPORTED_LANGUAGES[0];
  const exact = SUPPORTED_LANGUAGES.find((l) => l.code.toLowerCase() === code.toLowerCase());
  if (exact) return exact;

  const prefix = code.split('-')[0].toLowerCase();
  const matchedPrefix = SUPPORTED_LANGUAGES.find((l) => l.code.split('-')[0].toLowerCase() === prefix);
  if (matchedPrefix) return matchedPrefix;

  return {
    code,
    name: `Custom (${code})`,
    nativeName: code,
    region: 'GLOBAL',
    flag: '🌐',
    geminiPromptDesc: `Standard language code ${code}`,
    samplePhrase: 'System ready.',
  };
}

export const POPULAR_LANGUAGE_CODES = ['auto', 'hi-IN', 'hinglish', 'en-US', 'en-GB', 'es-ES', 'fr-FR', 'de-DE', 'ja-JP', 'zh-CN', 'ar-SA', 'ru-RU'];

/**
 * Natural language detector for bilingual speech
 */
export function detectSpeechLanguage(text: string, currentConfigLang: string = 'auto'): 'hi-IN' | 'en-US' | 'hinglish' | string {
  if (!text || !text.trim()) return 'en-US';

  const clean = text.trim();
  const lower = clean.toLowerCase();

  // 1. Check for Devanagari script characters
  const hasDevanagari = /[\u0900-\u097F]/.test(clean);
  if (hasDevanagari) {
    return 'hi-IN';
  }

  // 2. Common Hindi / Hinglish Latin transliterated tokens
  const hinglishKeywords = [
    'kya', 'hai', 'batao', 'dikhao', 'karo', 'kaise', 'namaste', 'shukriya',
    'ruko', 'chup', 'bas', 'kripya', 'sunao', 'chalao', 'mera', 'meri',
    'mere', 'aaj', 'kal', 'kaun', 'kyun', 'kaha', 'kahan', 'bolo',
    'suprabhat', 'theek', 'samajh', 'kaam', 'hoga', 'raha', 'rahi',
    'kuch', 'accha', 'nahi', 'zaroori', 'ab', 'abhi', 'kholo', 'banao',
    'kaisa', 'dhanyavad', 'chahiye', 'kijiye'
  ];

  const words = lower.split(/\s+/).map((w) => w.replace(/[^a-z0-9]/g, ''));
  const hinglishWordHits = words.filter((w) => hinglishKeywords.includes(w)).length;

  if (hinglishWordHits >= 2 || (words.length <= 5 && hinglishWordHits >= 1)) {
    return 'hi-IN';
  }

  if (currentConfigLang.startsWith('hi')) {
    return 'hi-IN';
  }

  return 'en-US';
}

/**
 * Detect explicit voice language change commands
 */
export function detectLanguageSwitchCommand(text: string): { code?: string; requested: boolean; newLang?: string; acknowledgment?: string } | null {
  const lower = text.toLowerCase().trim();

  // 1. Hindi Mode Switch
  if (
    lower.includes('हिंदी में बात') ||
    lower.includes('हिंदी में बोलो') ||
    lower.includes('हिंदी बोलो') ||
    lower.includes('मुझसे हिंदी') ||
    lower.includes('बात करो हिंदी') ||
    lower.includes('hindi mein baat') ||
    lower.includes('hindi me baat') ||
    lower.includes('hindi mein bolo') ||
    lower.includes('hindi me bolo') ||
    lower.includes('talk in hindi') ||
    lower.includes('talk to me in hindi') ||
    lower.includes('speak in hindi') ||
    lower.includes('switch to hindi') ||
    lower.includes('hindi mode') ||
    lower.includes('हिंदी मोड') ||
    lower === 'hindi' ||
    lower === 'हिंदी' ||
    (/^hindi\b/i.test(lower) && /(?:baat|bolo|speak|talk|karo)/i.test(lower))
  ) {
    return {
      code: 'hi-IN',
      requested: true,
      newLang: 'hi-IN',
      acknowledgment: 'जी सर, हिंदी मोड सक्रिय है। अब मैं आपसे हिंदी में बात करूँगा। बताइए, मैं आपकी क्या सहायता करूँ?',
    };
  }

  // 2. Hinglish Mode Switch
  if (
    lower.includes('हिंग्लिश में बात') ||
    lower.includes('हिंग्लिश में बोलो') ||
    lower.includes('हिंग्लिश बोलो') ||
    lower.includes('hinglish mein baat') ||
    lower.includes('hinglish me baat') ||
    lower.includes('हिंग्लिश मोड') ||
    lower.includes('hinglish mode') ||
    lower.includes('speak in hinglish') ||
    lower.includes('switch to hinglish') ||
    lower === 'hinglish' ||
    (/^hinglish\b/i.test(lower) && /(?:baat|bolo|speak|talk|karo)/i.test(lower))
  ) {
    return {
      code: 'hinglish',
      requested: true,
      newLang: 'hinglish',
      acknowledgment: 'Hinglish mode active, Sir. Natural mixed conversation ready.',
    };
  }

  // 3. English Mode Switch
  if (
    lower.includes('english mode') ||
    lower.includes('speak in english') ||
    lower.includes('अंग्रेजी में बोलो') ||
    lower.includes('अंग्रेजी में बात') ||
    lower.includes('english me baat') ||
    lower.includes('english mein baat') ||
    lower.includes('talk in english') ||
    lower.includes('talk to me in english') ||
    lower.includes('switch to english') ||
    lower === 'english' ||
    lower === 'अंग्रेजी' ||
    (/^english\b/i.test(lower) && /(?:baat|bolo|speak|talk)/i.test(lower))
  ) {
    return {
      code: 'en-US',
      requested: true,
      newLang: 'en-US',
      acknowledgment: 'English mode activated, Sir. I am ready to converse in English.',
    };
  }

  // 4. French
  if (lower.includes('french') || lower.includes('français')) {
    return {
      code: 'fr-FR',
      requested: true,
      newLang: 'fr-FR',
      acknowledgment: 'Mode français activé. Je suis prêt.',
    };
  }

  // 5. Spanish
  if (lower.includes('spanish') || lower.includes('español')) {
    return {
      code: 'es-ES',
      requested: true,
      newLang: 'es-ES',
      acknowledgment: 'Modo español activado. A su servicio.',
    };
  }

  // 6. German
  if (lower.includes('german') || lower.includes('deutsch')) {
    return {
      code: 'de-DE',
      requested: true,
      newLang: 'de-DE',
      acknowledgment: 'Deutscher Modus aktiviert. Zu Ihren Diensten.',
    };
  }

  // 7. Auto Mode Switch
  if (
    lower.includes('language auto') ||
    lower.includes('auto language') ||
    lower.includes('ऑटो लैंग्वेज') ||
    lower.includes('भाषा ऑटो') ||
    lower.includes('auto mode') ||
    lower.includes('automatic language')
  ) {
    return {
      code: 'auto',
      requested: true,
      newLang: 'auto',
      acknowledgment: 'Auto language detection enabled. I will adapt to whatever language you speak.',
    };
  }

  return null;
}

/**
 * Check if the utterance is a speech interruption command
 */
export function isSpeechInterruptionCommand(text: string): boolean {
  if (!text) return false;
  const clean = text.toLowerCase().trim().replace(/[.,!?;:]/g, '');

  const stopTriggers = [
    'ruko', 'stop', 'cancel', 'chup', 'bas', 'shant raho', 'stop speaking',
    'chup raho', 'pause', 'wait', 'hold on', 'ruk jao', 'रुको', 'चुप',
    'बस', 'शांत रहो', 'चुप रहो', 'रुक जाओ', 'स्टॉप', 'कैंसिल',
    'shut up', 'quiet', 'silence', 'jarvis hold on', 'wait a second',
    'stop talking', 'stop it', 'abort', 'बस करो', 'बोलना बंद करो',
    'shant ho jao', 'chup ho jao', 'bas karo'
  ];

  if (stopTriggers.includes(clean)) return true;

  // Partial match for commands like "jarvis stop" or "jarvis ruko"
  if (
    clean === 'jarvis stop' ||
    clean === 'jarvis pause' ||
    clean === 'jarvis chup' ||
    clean === 'jarvis wait' ||
    clean === 'jarvis ruko'
  ) {
    return true;
  }

  return false;
}
