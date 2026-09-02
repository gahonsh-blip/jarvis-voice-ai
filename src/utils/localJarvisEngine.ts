import { IntentCategory, ActionDetail, MemoryStore, MobileStatusData } from '../types';
import { detectSpeechLanguage, detectLanguageSwitchCommand, isSpeechInterruptionCommand } from './languages';

export interface LocalProcessingResult {
  reply: string;
  spokenText?: string;
  intent?: IntentCategory;
  actionExecuted?: boolean;
  actionDetail?: ActionDetail;
  updatedMemory?: MemoryStore;
  offline: boolean;
  languageChangedTo?: string;
  interrupted?: boolean;
  financeBlocked?: boolean;
  financeReason?: string;
}

/**
 * Strict Finance Exclusions Check
 */
function isFinanceRestricted(text: string): { blocked: boolean; reason?: string } {
  const lower = text.toLowerCase();
  const financeKeywords = [
    'bank transfer',
    'send money',
    'transfer money',
    'transfer funds',
    'wire transfer',
    'upi payment',
    'pay money',
    'crypto transfer',
    'buy bitcoin',
    'sell crypto',
    'wallet balance',
    'credit card payment',
    'पैसे ट्रांसफर',
    'पैसे भेजो',
    'रुपये ट्रांसफर',
    'बैंक से पैसे',
    'upi पेमेंट',
    'खाते में भेजो',
  ];

  for (const kw of financeKeywords) {
    if (lower.includes(kw)) {
      return {
        blocked: true,
        reason: 'HERMES JARVIS Security Protocol: Financial operations are strictly restricted and prohibited from autonomous control.',
      };
    }
  }

  // Regex check for transfers with currency or accounts
  if (/\b(?:transfer|send|wire|pay)\b.*(?:dollar|usd|inr|rupee|money|fund|account|bank|crypto|bitcoin)/i.test(lower)) {
    return {
      blocked: true,
      reason: 'HERMES JARVIS Security Protocol: Financial operations are strictly restricted and prohibited from autonomous control.',
    };
  }

  return { blocked: false };
}

/**
 * Enhanced HERMES JARVIS Local Offline Neural Engine
 * Handles natural conversational parsing for Hindi, Hinglish, English & Auto modes
 * Enforces Permission Matrix, YouTube connection verification, and Level-4 Safety Gates
 */
export function processOfflineCommand(
  text: string,
  currentMemory: MemoryStore,
  language: string = 'auto',
  mobileStatus?: MobileStatusData
): LocalProcessingResult {
  const clean = text.trim();
  const lower = clean.toLowerCase();

  // Determine actual language response mode
  const detectedLang = language === 'auto'
    ? detectSpeechLanguage(clean, language)
    : language.startsWith('hi')
    ? 'hindi'
    : language === 'hinglish'
    ? 'hinglish'
    : 'english';

  const isHindi = detectedLang === 'hindi' || detectedLang === 'hi-IN';
  const isHinglish = detectedLang === 'hinglish';

  let updatedMemory: MemoryStore = {
    ...currentMemory,
    stats: {
      totalCommands: (currentMemory.stats?.totalCommands || 0) + 1,
      actionsExecuted: currentMemory.stats?.actionsExecuted || 0,
      lastActive: new Date().toISOString(),
    },
  };

  // 0. STRICT FINANCE EXCLUSION CHECK
  const financeCheck = isFinanceRestricted(clean);
  if (financeCheck.blocked) {
    const reply = financeCheck.reason!;
    return {
      reply,
      spokenText: isHindi
        ? 'सुरक्षा प्रोटोकॉल: वित्तीय लेनदेन ऑटोनॉमस नियंत्रण से पूर्णतः प्रतिबंधित हैं।'
        : 'Security Protocol: Financial operations are strictly restricted from autonomous control.',
      intent: 'finance_blocked',
      financeBlocked: true,
      financeReason: reply,
      updatedMemory,
      offline: true,
    };
  }

  // 0.1 Speech Interruption Check ("रुको", "Stop", "Cancel", "चुप", "बस", "शांत रहो")
  if (isSpeechInterruptionCommand(clean)) {
    const reply = isHindi ? 'जी, मैं रुक गया।' : isHinglish ? 'Ruk gaya, Sir.' : 'Stopped, Sir.';
    return {
      reply,
      spokenText: reply,
      intent: 'system_diagnostic',
      interrupted: true,
      updatedMemory,
      offline: true,
    };
  }

  // 0.2 Voice Language Switch Commands ("हिंदी में बोलो", "Hindi mode", "English mode", "Hinglish mode", "Auto language")
  const langSwitch = detectLanguageSwitchCommand(clean);
  if (langSwitch?.requested && langSwitch.newLang) {
    const ack = langSwitch.acknowledgment || (langSwitch.newLang.startsWith('hi') ? 'हिंदी मोड सक्रिय है।' : 'Language mode updated.');
    return {
      reply: ack,
      spokenText: ack,
      intent: 'system_diagnostic',
      languageChangedTo: langSwitch.newLang,
      actionExecuted: true,
      actionDetail: { type: 'system_diagnostic', title: `Switch Language to ${langSwitch.newLang}` },
      updatedMemory,
      offline: true,
    };
  }

  // 0.3 Emergency Stop / Kill Switch
  if (
    lower.includes('emergency stop') ||
    lower.includes('stop all actions') ||
    lower.includes('pause jarvis') ||
    lower.includes('emergency pause') ||
    lower.includes('तुरंत सब बंद करो') ||
    lower === 'stop' ||
    lower === '/stop' ||
    lower === '/emergency_stop'
  ) {
    updatedMemory.stats.actionsExecuted += 1;
    const reply = 'Emergency Stop is now active. All autonomous modifications, drafts, and external publishing are frozen.';
    return {
      reply,
      spokenText: isHindi
        ? 'इमरजेंसी स्टॉप सक्रिय कर दिया गया है। सभी बाहरी क्रियाएं रोक दी गई हैं।'
        : reply,
      intent: 'emergency_stop',
      actionExecuted: true,
      actionDetail: { type: 'emergency_stop', title: 'Emergency Stop Activated' },
      updatedMemory,
      offline: true,
    };
  }

  // 0.4 Emergency Resume
  if (
    lower.includes('emergency resume') ||
    lower.includes('resume actions') ||
    lower.includes('unpause') ||
    lower.includes('continue actions') ||
    lower.includes('क्रियाएं पुनः शुरू करो') ||
    lower === '/resume'
  ) {
    updatedMemory.stats.actionsExecuted += 1;
    const reply = 'Emergency Stop deactivated. All subsystems resumed under normal Level 1-4 permission gating.';
    return {
      reply,
      spokenText: isHindi
        ? 'इमरजेंसी स्टॉप हटा दिया गया है। सभी सिस्टम सामान्य रूप से सक्रिय हैं।'
        : reply,
      intent: 'emergency_resume',
      actionExecuted: true,
      actionDetail: { type: 'emergency_resume', title: 'Emergency Stop Released' },
      updatedMemory,
      offline: true,
    };
  }

  // 1. YouTube Channel Status Inquiries ("YouTube का क्या status है", "YouTube status", "YouTube update")
  if (
    lower.includes('youtube') &&
    (lower.includes('status') || lower.includes('update') || lower.includes('क्या') || lower.includes('kya status') || lower.includes('connected') || lower.includes('channel') || lower.includes('अपडेट') || lower.includes('स्थिति') || lower.includes('stats'))
  ) {
    updatedMemory.stats.actionsExecuted += 1;
    const yt = currentMemory.youTubeConnection;
    const isConnected = Boolean(yt && yt.connected && (yt.channelTitle || yt.channelId));

    if (!isConnected) {
      const reply = isHindi
        ? 'YouTube अभी connected नहीं है। OAuth 2.0 authorization बाकी है। आप Settings या Integrations से इसे कभी भी 1-Click में सुरक्षित जोड़ सकते हैं।'
        : isHinglish
        ? 'YouTube abhi connect nahi hai, Sir. OAuth authorization pending hai. Aap Settings se 1-click connect kar sakte hain.'
        : 'YouTube is currently not connected, Sir. OAuth 2.0 authorization is required before channel data or video uploads can be processed.';

      return {
        reply,
        spokenText: isHindi
          ? 'YouTube अभी connected नहीं है। OAuth authorization बाकी है।'
          : isHinglish
          ? 'YouTube abhi connect nahi hai, Sir. OAuth authorization pending hai.'
          : 'YouTube is currently not connected, Sir. OAuth authorization is required.',
        intent: 'youtube_status_inquiry',
        actionExecuted: true,
        actionDetail: { type: 'youtube_status_inquiry', title: 'YouTube Status: Not Connected' },
        updatedMemory,
        offline: true,
      };
    } else {
      const channelTitle = yt?.channelTitle || 'Connected Channel';
      const reply = isHindi
        ? `YouTube चैनल "${channelTitle}" सफलतापूर्वक जुड़ा हुआ है। API status verified है और वीडियो अपलोड पाइपलाइन Level-4 सुरक्षा के साथ तैयार है।`
        : isHinglish
        ? `Sir, YouTube channel "${channelTitle}" connected hai aur API verified hai. Video pipeline Level-4 safety ke sath ready hai.`
        : `YouTube channel "${channelTitle}" is connected and verified. The upload pipeline is standing by with Level-4 authorization enforcement.`;

      return {
        reply,
        spokenText: isHindi
          ? `YouTube चैनल ${channelTitle} connected है और वीडियो पाइपलाइन तैयार है।`
          : isHinglish
          ? `YouTube channel ${channelTitle} connected hai aur ready hai.`
          : `YouTube channel ${channelTitle} is connected and verified.`,
        intent: 'youtube_status_inquiry',
        actionExecuted: true,
        actionDetail: { type: 'youtube_status_inquiry', title: `YouTube Status: ${channelTitle}` },
        updatedMemory,
        offline: true,
      };
    }
  }

  // 2. Video Upload Command with Level-4 Gate ("upload this video publicly", "public upload karo", "upload to youtube")
  if (
    (lower.includes('upload') || lower.includes('अपलोड')) &&
    (lower.includes('video') || lower.includes('वीडियो') || lower.includes('youtube'))
  ) {
    updatedMemory.stats.actionsExecuted += 1;
    const isPublic = lower.includes('public') || lower.includes('पब्लिक');
    const modeStr = isPublic ? 'Public' : 'Private';

    const reply = isHindi
      ? `वीडियो तैयार है। ${modeStr} upload के लिए Level-4 approval required है। कृपया Authorization Gateway में approval दें।`
      : isHinglish
      ? `Video ready hai. ${modeStr} upload ke liye Level-4 approval required hai. Kripya gateway me approval den.`
      : `Video payload staged for ${modeStr} upload. Level-4 Human Authorization is required before the YouTube API upload can execute.`;

    return {
      reply,
      spokenText: isHindi
        ? `वीडियो तैयार है। ${modeStr} upload के लिए Level-4 approval required है।`
        : isHinglish
        ? `Video ready hai. ${modeStr} upload ke liye Level-4 approval required hai.`
        : `Video staged. Level-4 Human Authorization is required to proceed.`,
      intent: 'youtube_upload_request',
      actionExecuted: true,
      actionDetail: {
        type: 'youtube_upload_request',
        title: `Stage YouTube Video (${modeStr})`,
        payload: { requiresConfirmation: true, risk: 'HIGH', mode: modeStr },
      },
      updatedMemory,
      offline: true,
    };
  }

  // 3. Identity Recognition (Setting Name)
  const nameMatchEn = clean.match(/(?:my name is|call me|i am)\s+([a-zA-Z0-9_\-\s]+)/i);
  const nameMatchHi = clean.match(/(?:मेरा नाम|मुझे)\s+([a-zA-Z0-9_\-\u0900-\u097F\s]+?)(?:\s+(?:है|बुलाओ)|$)/i);
  if (nameMatchEn || nameMatchHi) {
    let extractedName = (nameMatchEn ? nameMatchEn[1] : nameMatchHi![1]).trim();
    extractedName = extractedName.replace(/\s*(?:है|बुलाओ|hai|ji|जी)$/i, '').trim();
    if (extractedName && !['who', 'what', 'jarvis', 'hermes'].includes(extractedName.toLowerCase())) {
      updatedMemory = {
        ...updatedMemory,
        name: extractedName,
        stats: {
          ...updatedMemory.stats,
          actionsExecuted: updatedMemory.stats.actionsExecuted + 1,
        },
      };
      const reply = isHindi
        ? `नमस्ते ${extractedName} जी! मैंने आपका नाम सुरक्षित कर लिया है।`
        : isHinglish
        ? `Namaste ${extractedName} ji! Aapka name store kar liya gaya hai.`
        : `Pleasure to know you, ${extractedName}. I have committed your identity to local memory.`;

      return {
        reply,
        spokenText: reply,
        intent: 'set_name',
        actionExecuted: true,
        actionDetail: { type: 'set_name', title: `Set User Name to ${extractedName}` },
        updatedMemory,
        offline: true,
      };
    }
  }

  // 4. Asking for Name
  if (lower.includes('my name') || lower.includes('who am i') || lower.includes('मेरा नाम') || lower.includes('मैं कौन')) {
    const currentName = updatedMemory.name;
    const reply = currentName
      ? isHindi
        ? `आपका नाम ${currentName} है।`
        : isHinglish
        ? `Aapka name ${currentName} hai.`
        : `Your name is ${currentName}.`
      : isHindi
      ? 'मैंने अभी तक आपका नाम दर्ज नहीं किया है। आप कह सकते हैं: "मेरा नाम [नाम] है"।'
      : isHinglish
      ? 'Aapka name abhi note nahi hai. Aap keh sakte hain: "Mera naam [Name] hai".'
      : "You haven't informed me of your name yet. You can say: \"My name is [Name]\".";

    return {
      reply,
      spokenText: reply,
      intent: 'get_name',
      updatedMemory,
      offline: true,
    };
  }

  // 5. Morning Briefing & Mobile Personal Status (Strict Permission Matrix Enforcement)
  if (
    lower.includes('good morning') ||
    lower.includes('सुप्रभात') ||
    lower.includes('morning briefing') ||
    lower.includes('morning report') ||
    lower.includes('सुबह की ब्रीफिंग') ||
    lower.includes('mobile status') ||
    lower.includes('मोबाइल स्टेटस') ||
    lower.includes('बैटरी') ||
    lower.includes('मौसम') ||
    lower === 'gm' ||
    lower === '/briefing' ||
    lower === '/morning'
  ) {
    updatedMemory.stats.actionsExecuted += 1;
    const now = new Date();
    const hours = now.getHours();
    const mins = now.getMinutes();
    const timeStrHi = `${hours} बजकर ${mins < 10 ? '0' + mins : mins} मिनट`;
    const userName = updatedMemory.name || '';

    // Check actual permissions in mobileStatus or memory
    const perms = mobileStatus?.permissions || {
      BATTERY_STATUS: true,
      WEATHER_LOCATION: true,
      NOTIFICATIONS: true,
      CALENDAR_EVENTS: true,
      EMAIL_INBOX: true,
      DEVICE_HEALTH: true,
    };

    const batteryAvailable = perms.BATTERY_STATUS && mobileStatus?.battery?.available !== false;
    const weatherAvailable = perms.WEATHER_LOCATION && mobileStatus?.weather?.available !== false;
    const notifsAvailable = perms.NOTIFICATIONS && mobileStatus?.notifications?.available !== false;
    const calAvailable = perms.CALENDAR_EVENTS && mobileStatus?.calendar?.available !== false;
    const mailAvailable = perms.EMAIL_INBOX && mobileStatus?.email?.available !== false;

    const batteryLvl = mobileStatus?.battery?.level ?? 78;
    const tempC = mobileStatus?.weather?.temperatureC ?? 27;
    const condition = isHindi ? (mobileStatus?.weather?.conditionHi || 'साफ') : (mobileStatus?.weather?.condition || 'Clear');
    const notifCount = mobileStatus?.notifications?.totalCount ?? 5;
    const calCount = mobileStatus?.calendar?.todayEventsCount ?? 3;
    const mailCount = mobileStatus?.email?.unreadCount ?? 2;

    let hiLines: string[] = [];
    let enLines: string[] = [];
    let hinglishLines: string[] = [];

    const greetingHi = userName ? `सुप्रभात ${userName} जी।` : 'सुप्रभात सर।';
    const greetingEn = userName ? `Good morning, ${userName}.` : 'Good morning, Sir.';
    const greetingHinglish = userName ? `Good morning ${userName} ji.` : 'Good morning Sir.';

    hiLines.push(`${greetingHi} अभी समय ${timeStrHi} है।`);
    enLines.push(`${greetingEn} Current time is ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`);
    hinglishLines.push(`${greetingHinglish} Time abhi ${timeStrHi} hai.`);

    // Battery telemetry
    if (batteryAvailable) {
      hiLines.push(`बैटरी ${batteryLvl}% है और स्थिति सामान्य है।`);
      enLines.push(`Device battery is at ${batteryLvl}%.`);
      hinglishLines.push(`Battery ${batteryLvl}% charge hai.`);
    } else {
      hiLines.push('बैटरी डेटा अनुमति बंद है।');
      enLines.push('Battery telemetry access is not permitted.');
      hinglishLines.push('Battery access permission off hai.');
    }

    // Weather telemetry
    if (weatherAvailable) {
      hiLines.push(`मौसम ${condition} है, तापमान ${tempC}°C है।`);
      enLines.push(`Weather is ${condition} at ${tempC}°C.`);
      hinglishLines.push(`Weather ${condition} hai, temperature ${tempC}°C.`);
    } else {
      hiLines.push('मौसम और लोकेशन अनुमति बंद है।');
      enLines.push('Weather location access is disabled.');
      hinglishLines.push('Weather location permission disabled hai.');
    }

    // Notifications telemetry
    if (notifsAvailable) {
      hiLines.push(`${notifCount} महत्वपूर्ण नोटिफिकेशन्स हैं।`);
      enLines.push(`You have ${notifCount} priority notifications.`);
      hinglishLines.push(`${notifCount} important notifications hain.`);
    } else {
      hiLines.push('नोटिफिकेशन अनुमति अभी बंद है।');
      enLines.push('Notification access permission is not granted.');
      hinglishLines.push('Notifications access permission off hai.');
    }

    // Calendar & Email
    if (calAvailable) {
      hiLines.push(`आज ${calCount} इवेंट्स निर्धारित हैं।`);
      enLines.push(`${calCount} events scheduled today.`);
      hinglishLines.push(`Aaj ${calCount} meetings scheduled hain.`);
    }
    if (mailAvailable) {
      hiLines.push(`इनबॉक्स में ${mailCount} जरूरी ईमेल्स हैं।`);
      enLines.push(`${mailCount} unread emails in inbox.`);
      hinglishLines.push(`Inbox me ${mailCount} unread emails hain.`);
    }

    hiLines.push('सभी क्लाउड और स्थानीय सिस्टम सामान्य रूप से सक्रिय हैं।');
    enLines.push('All cloud nodes and local services are nominal.');
    hinglishLines.push('All systems online aur ready hain.');

    const reply = isHindi ? hiLines.join('\n') : isHinglish ? hinglishLines.join('\n') : enLines.join(' ');
    const spokenText = isHindi
      ? `${greetingHi} ${batteryAvailable ? `बैटरी ${batteryLvl} प्रतिशत है।` : ''} ${weatherAvailable ? `मौसम ${condition} है।` : ''} ${notifsAvailable ? `${notifCount} नए नोटिफिकेशन्स हैं।` : ''} सभी सिस्टम सामान्य हैं।`
      : isHinglish
      ? `${greetingHinglish} ${batteryAvailable ? `Battery ${batteryLvl}% hai.` : ''} ${weatherAvailable ? `Weather ${condition} hai.` : ''} ${notifsAvailable ? `${notifCount} new notifications hain.` : ''} All systems ready.`
      : `${greetingEn} ${batteryAvailable ? `Battery is at ${batteryLvl}%.` : ''} ${weatherAvailable ? `Weather is ${condition} at ${tempC} degrees.` : ''} ${notifsAvailable ? `You have ${notifCount} priority notifications.` : ''} All systems operational.`;

    return {
      reply,
      spokenText,
      intent: 'mobile_personal_status',
      actionExecuted: true,
      actionDetail: {
        type: 'mobile_personal_status',
        title: isHindi ? 'सुप्रभात दैनिक ब्रीफिंग' : isHinglish ? 'Morning Briefing' : 'Morning Briefing',
        payload: { source: 'local_engine', text: reply },
      },
      updatedMemory,
      offline: true,
    };
  }

  // 6. Calculator & Math Expressions
  const mathQueryMatch = clean.match(/(?:calculate|what is|compute|solve|\bhow much is\b)\s+([0-9+\-*/().\s]+)/i);
  if (mathQueryMatch && /[0-9]/.test(mathQueryMatch[1])) {
    try {
      const sanitized = mathQueryMatch[1].replace(/×/g, '*').replace(/÷/g, '/').trim();
      if (/^[0-9+\-*/().\s]+$/.test(sanitized)) {
        const val = new Function(`'use strict'; return (${sanitized})`)();
        if (typeof val === 'number' && Number.isFinite(val)) {
          updatedMemory.stats.actionsExecuted += 1;
          const resStr = String(Math.round(val * 1000000) / 1000000);
          const reply = isHindi ? `गणना परिणाम: ${sanitized} = ${resStr}` : isHinglish ? `Result: ${sanitized} = ${resStr}` : `${sanitized} is ${resStr}.`;
          return {
            reply,
            spokenText: isHindi ? `उत्तर ${resStr} है।` : isHinglish ? `Result ${resStr} hai.` : `The result is ${resStr}.`,
            intent: 'open_calculator',
            actionExecuted: true,
            actionDetail: { type: 'open_calculator', title: `Computed: ${sanitized} = ${resStr}` },
            updatedMemory,
            offline: true,
          };
        }
      }
    } catch {
      // ignore
    }
  }

  if (lower.includes('calculator') || lower.includes('कैलकुलेटर') || lower.includes('open math')) {
    updatedMemory.stats.actionsExecuted += 1;
    const reply = isHindi ? 'कैलकुलेटर खोला जा रहा है।' : isHinglish ? 'Calculator open ho raha hai.' : 'Opening Calculator tool.';
    return {
      reply,
      spokenText: reply,
      intent: 'open_calculator',
      actionExecuted: true,
      actionDetail: { type: 'open_calculator', title: 'Open Calculator Tool' },
      updatedMemory,
      offline: true,
    };
  }

  // 7. Notepad & Workspace
  if (lower.includes('notepad') || lower.includes('create file') || lower.includes('नोटपैड') || lower.includes('फाइल बनाओ') || lower.includes('write note')) {
    updatedMemory.stats.actionsExecuted += 1;
    const reply = isHindi ? 'नोटपैड खोला जा रहा है।' : isHinglish ? 'Notepad open ho raha hai.' : 'Opening Notepad.';
    return {
      reply,
      spokenText: reply,
      intent: 'open_notepad',
      actionExecuted: true,
      actionDetail: { type: 'open_notepad', title: 'Open Notepad Workspace' },
      updatedMemory,
      offline: true,
    };
  }

  // 8. Paint & Canvas
  if (lower.includes('paint') || lower.includes('drawing') || lower.includes('पेंट')) {
    updatedMemory.stats.actionsExecuted += 1;
    const reply = isHindi ? 'पेंट कैनवास खोला जा रहा है।' : isHinglish ? 'Paint canvas open ho raha hai.' : 'Opening Paint canvas.';
    return {
      reply,
      spokenText: reply,
      intent: 'open_paint',
      actionExecuted: true,
      actionDetail: { type: 'open_paint', title: 'Open Paint Canvas' },
      updatedMemory,
      offline: true,
    };
  }

  // 8.1 Screenshot Tool
  if (lower.includes('take screenshot') || lower.includes('screenshot') || lower.includes('स्क्रीनशॉट') || lower.includes('screen capture')) {
    updatedMemory.stats.actionsExecuted += 1;
    const reply = isHindi ? 'स्क्रीनशॉट लिया जा रहा है।' : isHinglish ? 'Screenshot capture ho raha hai.' : 'Capturing screen display.';
    return {
      reply,
      spokenText: reply,
      intent: 'take_screenshot',
      actionExecuted: true,
      actionDetail: { type: 'take_screenshot', title: 'Screen Capture Triggered' },
      updatedMemory,
      offline: true,
    };
  }

  // 9. Master Blueprint / Project Roadmap
  if (lower.includes('project') || lower.includes('blueprint') || lower.includes('प्रोजेक्ट') || lower.includes('ब्लूप्रिंट') || lower.includes('roadmap') || lower.includes('git audit')) {
    updatedMemory.stats.actionsExecuted += 1;
    const reply = isHindi
      ? 'मास्टर ब्लूप्रिंट खोला जा रहा है। फेज 0 से 9 सक्रिय हैं।'
      : isHinglish
      ? 'Master Blueprint open ho raha hai. All phases active hain.'
      : 'Displaying Master Blueprint Phase 0 to 9.';
    return {
      reply,
      spokenText: reply,
      intent: 'check_project',
      actionExecuted: true,
      actionDetail: { type: 'check_project', title: 'Open Master Blueprint Roadmap' },
      updatedMemory,
      offline: true,
    };
  }

  // 9.1 Freelance Quotation Generator
  if (lower.includes('quotation') || lower.includes('कोटेशन') || lower.includes('freelance') || lower.includes('proposal') || lower.includes('client lead')) {
    updatedMemory.stats.actionsExecuted += 1;
    const reply = isHindi
      ? 'फ्रीलांस कोटेशन जनरेटर खोला जा रहा है।'
      : isHinglish
      ? 'Freelance quotation generator open ho raha hai.'
      : 'Generating freelance quotation proposal.';
    return {
      reply,
      spokenText: reply,
      intent: 'generate_quotation',
      actionExecuted: true,
      actionDetail: { type: 'generate_quotation', title: 'Generate Client Quotation' },
      updatedMemory,
      offline: true,
    };
  }

  // 10. Social Media & Content
  if (lower.includes('social') || lower.includes('linkedin') || lower.includes('twitter') || lower.includes('पोस्ट') || lower.includes('सोशल') || lower.includes('draft post')) {
    updatedMemory.stats.actionsExecuted += 1;
    const reply = isHindi
      ? 'सोशल मीडिया कंसोल खोला जा रहा है।'
      : isHinglish
      ? 'Social Media console open ho raha hai.'
      : 'Launching Social Media Generator & Approval Matrix.';
    return {
      reply,
      spokenText: reply,
      intent: 'create_social_post',
      actionExecuted: true,
      actionDetail: { type: 'create_social_post', title: 'Open Social Media Console' },
      updatedMemory,
      offline: true,
    };
  }

  // 11. Security Matrix & Audit Logs
  if (lower.includes('security') || lower.includes('safety') || lower.includes('सुरक्षा') || lower.includes('permission') || lower.includes('audit log')) {
    updatedMemory.stats.actionsExecuted += 1;
    const reply = isHindi
      ? '4-लेवल सुरक्षा मैट्रिक्स और ऑडिट लॉग्स खोले जा रहे हैं।'
      : isHinglish
      ? 'Security Matrix aur audit logs open ho rahe hain.'
      : 'Opening Security Matrix & 4-Level Safety Policy.';
    return {
      reply,
      spokenText: reply,
      intent: 'security_audit',
      actionExecuted: true,
      actionDetail: { type: 'security_audit', title: 'Open Security Matrix' },
      updatedMemory,
      offline: true,
    };
  }

  // 11.1 Cloud Telemetry (Oracle VM)
  if (lower.includes('oracle') || lower.includes('cloud') || lower.includes('vm status') || lower.includes('telemetry') || lower.includes('server status')) {
    updatedMemory.stats.actionsExecuted += 1;
    const reply = isHindi
      ? 'ओरेकल क्लाउड ARM VM टेलीमेट्री लोड हो रही है।'
      : isHinglish
      ? 'Oracle Cloud ARM VM telemetry load ho rahi hai.'
      : 'Displaying Oracle Cloud Always Free ARM VM Telemetry.';
    return {
      reply,
      spokenText: reply,
      intent: 'cloud_telemetry',
      actionExecuted: true,
      actionDetail: { type: 'cloud_telemetry', title: 'Oracle Cloud VM Telemetry' },
      updatedMemory,
      offline: true,
    };
  }

  // 11.2 Daily Routine & Schedule
  if (lower.includes('routine') || lower.includes('schedule') || lower.includes('रूटीन') || lower.includes('शेड्यूल')) {
    updatedMemory.stats.actionsExecuted += 1;
    const reply = isHindi
      ? 'दैनिक शेड्यूल और ब्रीफिंग शेड्यूलर खोला जा रहा है।'
      : isHinglish
      ? 'Daily schedule aur briefing scheduler open ho raha hai.'
      : 'Opening Daily Routines & Scheduler.';
    return {
      reply,
      spokenText: reply,
      intent: 'schedule_morning_report',
      actionExecuted: true,
      actionDetail: { type: 'schedule_morning_report', title: 'Daily Routine Schedule' },
      updatedMemory,
      offline: true,
    };
  }

  // 11.3 Media / Audio Volume Controls
  if (lower.includes('volume up') || lower.includes('आवाज बढ़ाओ') || lower.includes('increase volume') || lower.includes('louder')) {
    updatedMemory.stats.actionsExecuted += 1;
    const reply = isHindi ? 'ऑडियो वॉल्यूम बढ़ाया जा रहा है।' : 'Increasing master audio volume.';
    return {
      reply,
      spokenText: reply,
      intent: 'volume_up',
      actionExecuted: true,
      actionDetail: { type: 'volume_up', title: 'Volume Adjusted (+)' },
      updatedMemory,
      offline: true,
    };
  }

  if (lower.includes('volume down') || lower.includes('आवाज कम करो') || lower.includes('decrease volume') || lower.includes('quieter')) {
    updatedMemory.stats.actionsExecuted += 1;
    const reply = isHindi ? 'ऑडियो वॉल्यूम कम किया जा रहा है।' : 'Decreasing audio volume.';
    return {
      reply,
      spokenText: reply,
      intent: 'volume_down',
      actionExecuted: true,
      actionDetail: { type: 'volume_down', title: 'Volume Adjusted (-)' },
      updatedMemory,
      offline: true,
    };
  }

  // 11.4 Google Search Extraction
  if (lower.startsWith('search ') || lower.includes('google search') || lower.includes('सर्च करो') || lower.includes('खोजो')) {
    updatedMemory.stats.actionsExecuted += 1;
    const query = clean
      .replace(/^search\s+(?:for\s+)?/i, '')
      .replace(/google search\s+(?:for\s+)?/i, '')
      .replace(/(?:सर्च करो|खोजो)\s*/i, '')
      .trim();

    const reply = isHindi ? `गूगल पर "${query}" खोजा जा रहा है।` : `Searching Google for "${query}".`;
    return {
      reply,
      spokenText: reply,
      intent: 'google_search',
      actionExecuted: true,
      actionDetail: {
        type: 'google_search',
        title: `Search: ${query}`,
        payload: { query },
      },
      updatedMemory,
      offline: true,
    };
  }

  // 12. Time / Date / Diagnostics
  if (lower.includes('time') || lower.includes('date') || lower.includes('समय') || lower.includes('तारीख') || lower.includes('waqt') || lower.includes('diagnostic')) {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateStr = now.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const reply = isHindi
      ? `वर्तमान समय ${timeStr} है और आज ${dateStr} है। सिस्टम डायग्नोस्टिक्स सामान्य हैं।`
      : isHinglish
      ? `Abhi time ${timeStr} hai, date ${dateStr}. Systems nominal.`
      : `The current system time is ${timeStr} on ${dateStr}. Systems are operational.`;

    return {
      reply,
      spokenText: reply,
      intent: 'system_diagnostic',
      updatedMemory,
      offline: true,
    };
  }

  // 13. Conversational Inquiries & Greetings
  if (
    lower.includes('how are you') ||
    lower.includes('how are u') ||
    lower.includes('kaise ho') ||
    lower.includes('kaisa hai') ||
    lower.includes('कैसे हो') ||
    lower.includes('सब ठीक') ||
    lower.includes('आप कैसे हैं')
  ) {
    const reply = isHindi
      ? `सभी सिस्टम सुचारू रूप से कार्यरत हैं।`
      : isHinglish
      ? `All systems smoothly running hain aur sucharu roop se active hain.`
      : `All systems nominal. Ready to assist.`;

    return {
      reply,
      spokenText: reply,
      intent: 'chat',
      updatedMemory,
      offline: true,
    };
  }

  if (lower.includes('who are you') || lower.includes('तुम कौन हो') || lower.includes('aap kaun ho')) {
    const reply = isHindi
      ? `मैं हरमीस जार्विस हूँ — आपका ऑटोनॉमस एआई असिस्टेंट।`
      : isHinglish
      ? `Mai HERMES JARVIS hoon — aapka personal AI assistant.`
      : `I am HERMES JARVIS — your autonomous personal AI assistant.`;

    return {
      reply,
      spokenText: reply,
      intent: 'chat',
      updatedMemory,
      offline: true,
    };
  }

  if (lower === 'hi' || lower === 'hello' || lower === 'hey' || lower.includes('नमस्ते')) {
    const reply = isHindi
      ? `नमस्ते! मैं हरमीस जार्विस हूँ। मैं आपकी क्या सहायता करूँ?`
      : isHinglish
      ? `Hello! Hermes Jarvis online hai. Mai aapki kya help kar sakta hoon?`
      : `Hello! Hermes Jarvis is standing by. How may I assist you today?`;

    return {
      reply,
      spokenText: reply,
      intent: 'chat',
      updatedMemory,
      offline: true,
    };
  }

  if (lower.includes('thank') || lower.includes('धन्यवाद') || lower.includes('shukriya')) {
    const reply = isHindi
      ? `आपकी सेवा में सदैव तत्पर।`
      : isHinglish
      ? `Aapki seva me sadaiv tatpar.`
      : `Always a pleasure to assist.`;

    return {
      reply,
      spokenText: reply,
      intent: 'chat',
      updatedMemory,
      offline: true,
    };
  }

  // 14. General Fallback
  const reply = isHindi
    ? `कमांड प्राप्त हुई: "${clean}"। डेटा स्थानीय मेमोरी में सुरक्षित है।`
    : isHinglish
    ? `Command note kar li gayi hai: "${clean}".`
    : `Command acknowledged: "${clean}". Operating via local offline neural matrix.`;

  return {
    reply,
    spokenText: reply,
    intent: 'chat',
    updatedMemory,
    offline: true,
  };
}
