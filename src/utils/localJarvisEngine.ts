import { IntentCategory, ActionDetail, MemoryStore, MobileStatusData } from '../types';
import { detectSpeechLanguage, detectLanguageSwitchCommand, isSpeechInterruptionCommand } from './languages';
import {
  maskPhoneNumber,
  DEFAULT_CLINIC_CONFIG,
  evaluateClinicSafety,
  checkHumanHandoffIntent,
} from './telephonyPermissions';
import { TelephonyProviderRegistry } from './telephonyAdapters';
import { androidBridgeEngine } from './androidBridgeEngine';
import {
  youtubeOfflineStatusReply,
  offlineTokenFreshness,
  type YouTubeVoiceMode,
} from './hardening/youtubeVoiceStatusTruth';
import {
  offlineOperatorVerdict,
  offlineOperatorReply,
  offlineOperatorCountsAsHostWork,
} from './computerOperator/offlineOperatorTruth';

let stagedOutboundCall: { destination: string; masked: string; isScheduled?: boolean } | null = null;

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
  // `hinglish` must be tested before the `hi` prefix check: `'hinglish'`
  // starts with `'hi'`, so the old order made the Hinglish branch dead code
  // and answered a Hinglish request in Devanagari.
  const detectedLang = language === 'auto'
    ? detectSpeechLanguage(clean, language)
    : language === 'hinglish'
    ? 'hinglish'
    : language.startsWith('hi')
    ? 'hindi'
    : 'english';

  const isHindi = detectedLang === 'hindi' || detectedLang === 'hi-IN';
  const isHinglish = detectedLang === 'hinglish';
  const operatorLang: 'hindi' | 'hinglish' | 'english' = isHindi
    ? 'hindi'
    : isHinglish
    ? 'hinglish'
    : 'english';

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
      intent: 'language_switch',
      languageChangedTo: langSwitch.newLang,
      actionExecuted: true,
      actionDetail: { type: 'language_switch', title: `Switch Language to ${langSwitch.newLang}`, payload: { language: langSwitch.newLang } },
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

  // 0.5 Android Mobile Assistant: Contextual Pending Call / Message Approval & Response
  const activePendingEvent = androidBridgeEngine.getPendingEvent();
  if (activePendingEvent && activePendingEvent.status === 'AWAITING_APPROVAL') {
    const evaluation = androidBridgeEngine.evaluateOwnerApproval(clean);

    if (evaluation.decision === 'APPROVE') {
      if (evaluation.targetType === 'CALL') {
        const capability = androidBridgeEngine.evaluateCallAnswerSupport();
        if (!capability.supported) {
          const reply = isHindi
            ? 'सर, इस Android device पर JARVIS को अभी call answer करने की अनुमति नहीं मिली है।'
            : isHinglish
            ? 'Sir, is Android device par JARVIS ko abhi call answer karne ki permission nahi mili hai.'
            : 'Sir, JARVIS does not have permission to answer calls on this Android device yet.';

          return {
            reply,
            spokenText: reply,
            intent: 'answer_call',
            actionExecuted: false,
            actionDetail: { type: 'answer_call', title: 'Call Answering Unsupported', payload: { error: capability.reason } },
            updatedMemory,
            offline: true,
          };
        }

        const answerResult = androidBridgeEngine.executeCallAnswer();
        // The phone has been told to answer, but has not confirmed it. Say so.
        const reply = isHindi
          ? 'सर, कॉल उठाने का निर्देश डिवाइस को भेज दिया गया है। डिवाइस की पुष्टि आते ही बताऊँगा।'
          : 'Sir, the answer command has been dispatched to the device. I will confirm once the device reports back.';
        return {
          reply,
          spokenText: reply,
          intent: 'answer_call',
          actionExecuted: answerResult.success,
          actionDetail: {
            type: 'answer_call',
            title: 'Call Answer Dispatched (unconfirmed)',
            payload: { status: answerResult.status, receipt: androidBridgeEngine.getLastReceipt() },
          },
          updatedMemory,
          offline: true,
        };
      } else if (evaluation.targetType === 'MESSAGE') {
        const replyResult = androidBridgeEngine.executeMessageReply('Approved by user');
        const reply =
          replyResult.actionType === 'OPEN_APP'
            ? isHindi
              ? 'सर, ऐप खोल दिया गया है। संदेश अभी भेजा नहीं गया — आपको ऐप में भेजना होगा।'
              : 'Sir, the app has been opened. The message has NOT been sent yet — you need to send it in the app.'
            : isHindi
            ? 'सर, संदेश का उत्तर डिवाइस को भेज दिया गया है। डिलीवरी की पुष्टि बाकी है।'
            : 'Sir, the reply has been handed to the device. Delivery is not yet confirmed.';

        return {
          reply,
          spokenText: reply,
          actionExecuted: replyResult.success,
          actionDetail: {
            type: 'open_notepad',
            title: 'Message Reply Dispatched (delivery unconfirmed)',
            payload: { status: replyResult.status, actionType: replyResult.actionType },
          },
          updatedMemory,
          offline: true,
        };
      }
    } else if (evaluation.decision === 'REJECT') {
      if (evaluation.targetType === 'CALL') {
        androidBridgeEngine.clearPendingEvent();
        const reply = isHindi
          ? 'सर, कॉल अस्वीकार कर दी गई है।'
          : 'Sir, the incoming call has been declined.';

        return {
          reply,
          spokenText: reply,
          intent: 'reject_call',
          actionExecuted: true,
          actionDetail: { type: 'reject_call', title: 'Call Declined' },
          updatedMemory,
          offline: true,
        };
      } else if (evaluation.targetType === 'MESSAGE') {
        androidBridgeEngine.clearPendingEvent();
        const reply = isHindi
          ? 'सर, संदेश का उत्तर रद्द कर दिया गया है।'
          : 'Sir, message reply cancelled.';

        return {
          reply,
          spokenText: reply,
          actionExecuted: true,
          actionDetail: { type: 'open_notepad', title: 'Message Dismissed' },
          updatedMemory,
          offline: true,
        };
      }
    }
  }

  // 0.51 Direct Call Answer / Decline Commands even outside contextual approval
  if (
    lower.includes('answer call') ||
    lower.includes('कॉल उठाओ') ||
    lower.includes('कॉल उठा लो') ||
    lower.includes('फोन उठाओ') ||
    lower.includes('call uthao') ||
    lower.includes('call utha lo')
  ) {
    if (activePendingEvent && activePendingEvent.type === 'CALL') {
      const capability = androidBridgeEngine.evaluateCallAnswerSupport();
      if (!capability.supported) {
        const reply = isHindi
          ? 'सर, इस Android device पर JARVIS को अभी call answer करने की अनुमति नहीं मिली है।'
          : isHinglish
          ? 'Sir, is Android device par JARVIS ko abhi call answer karne ki permission nahi mili hai.'
          : 'Sir, JARVIS does not have permission to answer calls on this Android device yet.';
        return {
          reply,
          spokenText: reply,
          intent: 'answer_call',
          actionExecuted: false,
          actionDetail: { type: 'answer_call', title: 'Call Answering Unsupported', payload: { error: capability.reason } },
          updatedMemory,
          offline: true,
        };
      }
      const answerResult = androidBridgeEngine.executeCallAnswer();
      const reply = isHindi
        ? 'सर, कॉल उठाने का निर्देश डिवाइस को भेज दिया गया है। डिवाइस की पुष्टि आते ही बताऊँगा।'
        : 'Sir, the answer command has been dispatched to the device. I will confirm once the device reports back.';
      return {
        reply,
        spokenText: reply,
        intent: 'answer_call',
        actionExecuted: answerResult.success,
        actionDetail: {
          type: 'answer_call',
          title: 'Call Answer Dispatched (unconfirmed)',
          payload: { status: answerResult.status, receipt: androidBridgeEngine.getLastReceipt() },
        },
        updatedMemory,
        offline: true,
      };
    } else {
      const reply = isHindi
        ? 'सर, इस समय कोई सक्रिय incoming कॉल नहीं है।'
        : 'Sir, there is no active incoming call to answer.';
      return {
        reply,
        spokenText: reply,
        intent: 'answer_call',
        actionExecuted: false,
        actionDetail: { type: 'answer_call', title: 'No Active Call' },
        updatedMemory,
        offline: true,
      };
    }
  }

  if (
    lower.includes('decline call') ||
    lower.includes('reject call') ||
    lower.includes('कॉल काटो') ||
    lower.includes('कॉल काट दो') ||
    lower.includes('फोन काटो') ||
    lower.includes('कॉल मत उठाओ') ||
    lower.includes('call kato') ||
    lower.includes('call mat uthao')
  ) {
    if (activePendingEvent && activePendingEvent.type === 'CALL') {
      androidBridgeEngine.clearPendingEvent();
      const reply = isHindi ? 'सर, कॉल अस्वीकार कर दी गई है।' : 'Sir, the call has been declined.';
      return {
        reply,
        spokenText: reply,
        intent: 'reject_call',
        actionExecuted: true,
        actionDetail: { type: 'reject_call', title: 'Call Declined via Android Bridge' },
        updatedMemory,
        offline: true,
      };
    } else {
      const reply = isHindi
        ? 'सर, इस समय कोई सक्रिय incoming कॉल नहीं है जिसे काटा जा सके।'
        : 'Sir, there is no active incoming call to decline.';
      return {
        reply,
        spokenText: reply,
        intent: 'reject_call',
        actionExecuted: false,
        actionDetail: { type: 'reject_call', title: 'No Active Call' },
        updatedMemory,
        offline: true,
      };
    }
  }

  // 0.6 Android Mobile Assistant Inquiries ("किसका कॉल है", "who is calling", "कोई notification आया क्या")
  if (
    lower.includes('किसका कॉल') ||
    lower.includes('kiska call') ||
    lower.includes('who is calling') ||
    lower.includes('who is on the phone') ||
    lower.includes('caller id') ||
    lower.includes('कॉलर कौन है')
  ) {
    if (activePendingEvent && activePendingEvent.type === 'CALL') {
      const reply = activePendingEvent.spokenAnnouncement;
      return {
        reply,
        spokenText: reply,
        intent: 'answer_call',
        actionExecuted: true,
        actionDetail: { type: 'answer_call', title: `Caller: ${activePendingEvent.sender}` },
        updatedMemory,
        offline: true,
      };
    } else {
      const reply = isHindi
        ? 'सर, इस समय कोई सक्रिय incoming कॉल नहीं है।'
        : isHinglish
        ? 'Sir, is samay koi active incoming call nahi hai.'
        : 'Sir, there is no active incoming call at this moment.';
      return {
        reply,
        spokenText: reply,
        offline: true,
      };
    }
  }

  if (
    lower.includes('notification') ||
    lower.includes('नोटिफिकेशन') ||
    lower.includes('सूचना')
  ) {
    if (activePendingEvent && activePendingEvent.type === 'MESSAGE') {
      const reply = activePendingEvent.spokenAnnouncement;
      return {
        reply,
        spokenText: reply,
        intent: 'open_notepad',
        actionExecuted: true,
        actionDetail: { type: 'open_notepad', title: `Notification: ${activePendingEvent.appName}` },
        updatedMemory,
        offline: true,
      };
    } else {
      const reply = isHindi
        ? 'सर, इस समय कोई नया पेंडिंग नोटिफिकेशन नहीं है।'
        : isHinglish
        ? 'Sir, is samay koi pending notification nahi hai.'
        : 'Sir, there are no pending notifications at this moment.';
      return {
        reply,
        spokenText: reply,
        offline: true,
      };
    }
  }
  if (
    (lower.includes('youtube') || lower.includes('यूट्यूब')) &&
    (lower.includes('status') || lower.includes('update') || lower.includes('क्या') || lower.includes('kya status') || lower.includes('connected') || lower.includes('channel') || lower.includes('अपडेट') || lower.includes('स्थिति') || lower.includes('stats') || lower.includes('चैनल') || lower.includes('जुड़ा'))
  ) {
    updatedMemory.stats.actionsExecuted += 1;
    const yt = currentMemory.youTubeConnection;
    const isConnected = Boolean(yt && yt.connected && (yt.channelTitle || yt.channelId));
    const mode: YouTubeVoiceMode = isHindi ? 'hi' : isHinglish ? 'hinglish' : 'en';

    // The offline engine performs no provider call. The reply may only state
    // what the local record holds; it previously claimed "connected and
    // verified" with a "ready" Level-4 pipeline, and named a hardcoded
    // 'Connected Channel' when no channel had ever been read.
    const reply = youtubeOfflineStatusReply(
      {
        connected: isConnected,
        channelTitle: yt?.channelTitle,
        scopes: yt?.scopes,
        expiresAt: yt?.expiresAt,
      },
      mode
    );

    return {
      reply,
      spokenText: reply,
      intent: 'youtube_status_inquiry',
      actionExecuted: true,
      actionDetail: {
        type: 'youtube_status_inquiry',
        title: isConnected
          ? `YouTube Status: ${yt?.channelTitle?.trim() || 'channel not read'}`
          : 'YouTube Status: Not Connected',
        payload: {
          connected: isConnected,
          channelVerified: false,
          tokenFreshness: offlineTokenFreshness(yt?.expiresAt, new Date()),
          channel: yt?.channelTitle ?? null,
        },
      },
      updatedMemory,
      offline: true,
    };
  }

  // ==============================================================================
  // 1.5 COMPUTER OPERATOR & SCREEN RESEARCHER ENGINE
  // Handles: "Open VS Code and fix the project error", "स्क्रीन देखकर बताओ क्या समस्या है",
  // "जार्विस, VS Code खोलो", "computer operator", "inspect screen", "काम बंद करो"
  // ==============================================================================

  // 1.5.1 Cancellation Command
  if (
    lower.includes('cancel task') ||
    lower.includes('stop task') ||
    lower.includes('काम बंद करो') ||
    lower.includes('ऑपरेटर रोको') ||
    lower.includes('cancel operator') ||
    lower.includes('stop operator')
  ) {
    const verdict = offlineOperatorVerdict('cancel_computer_task');
    const reply = offlineOperatorReply('cancel_computer_task', operatorLang);

    return {
      reply,
      spokenText: reply,
      intent: 'cancel_computer_task',
      actionExecuted: offlineOperatorCountsAsHostWork('cancel_computer_task'),
      actionDetail: {
        type: 'cancel_computer_task',
        title: verdict.title,
        payload: { objective: clean, offlineHostWork: false },
      },
      updatedMemory,
      offline: true,
    };
  }

  // 1.5.2 "Open VS Code and fix the project error" / "इस error को ठीक करो"
  if (
    (lower.includes('vs code') || lower.includes('vscode') || lower.includes('project')) &&
    (lower.includes('error') || lower.includes('fix') || lower.includes('समस्या') || lower.includes('ठीक करो') || lower.includes('ठीक कर'))
  ) {
    const verdict = offlineOperatorVerdict('fix_project_error');
    const reply = offlineOperatorReply('fix_project_error', operatorLang);

    return {
      reply,
      spokenText: reply,
      intent: 'fix_project_error',
      actionExecuted: offlineOperatorCountsAsHostWork('fix_project_error'),
      actionDetail: {
        type: 'fix_project_error',
        title: verdict.title,
        target: 'VS Code',
        payload: { objective: clean, app: 'VS Code', mode: 'hybrid', offlineHostWork: false },
      },
      updatedMemory,
      offline: true,
    };
  }

  // 1.5.3 "स्क्रीन देखकर बताओ क्या समस्या है" / "Inspect screen and tell me what the problem is"
  if (
    lower.includes('स्क्रीन देखकर') ||
    lower.includes('स्क्रीन देखो') ||
    lower.includes('क्या समस्या है') ||
    lower.includes('inspect screen') ||
    lower.includes('screen research') ||
    lower.includes('what is on the screen') ||
    (lower.includes('screen') && lower.includes('error'))
  ) {
    const verdict = offlineOperatorVerdict('inspect_screen');
    const reply = offlineOperatorReply('inspect_screen', operatorLang);

    return {
      reply,
      spokenText: reply,
      intent: 'inspect_screen',
      actionExecuted: offlineOperatorCountsAsHostWork('inspect_screen'),
      actionDetail: {
        type: 'inspect_screen',
        title: verdict.title,
        payload: { objective: clean, offlineHostWork: false },
      },
      updatedMemory,
      offline: true,
    };
  }

  // 1.5.4 "जार्विस, VS Code खोलो" / "Open VS Code"
  if (
    lower.includes('vs code') ||
    lower.includes('vscode') ||
    (lower.includes('visual studio') && lower.includes('code'))
  ) {
    const verdict = offlineOperatorVerdict('operate_vscode');
    const reply = offlineOperatorReply('operate_vscode', operatorLang);

    return {
      reply,
      spokenText: reply,
      intent: 'operate_vscode',
      actionExecuted: offlineOperatorCountsAsHostWork('operate_vscode'),
      actionDetail: {
        type: 'operate_vscode',
        title: verdict.title,
        target: 'VS Code',
        payload: { app: 'VS Code', offlineHostWork: false },
      },
      updatedMemory,
      offline: true,
    };
  }

  // 1.5.5 "Computer Operator खोलो" / "Open Computer Operator"
  if (
    lower.includes('computer operator') ||
    lower.includes('कंप्यूटर ऑपरेटर') ||
    lower.includes('स्क्रीन ऑपरेटर')
  ) {
    const verdict = offlineOperatorVerdict('open_computer_operator');
    const reply = offlineOperatorReply('open_computer_operator', operatorLang);
    updatedMemory.stats.actionsExecuted += 1;

    return {
      reply,
      spokenText: reply,
      intent: 'open_computer_operator',
      actionExecuted: offlineOperatorCountsAsHostWork('open_computer_operator'),
      actionDetail: {
        type: 'open_computer_operator',
        title: verdict.title,
        payload: { offlineHostWork: false },
      },
      updatedMemory,
      offline: true,
    };
  }

  // 1.5.6 "जार्विस, browser खोलो" / "Open Browser"
  if (
    lower.includes('browser खोलो') ||
    lower.includes('ब्राउज़र खोलो') ||
    lower.includes('open browser') ||
    lower.includes('chrome खोलो')
  ) {
    const verdict = offlineOperatorVerdict('operate_browser');
    const reply = offlineOperatorReply('operate_browser', operatorLang);

    return {
      reply,
      spokenText: reply,
      intent: 'operate_browser',
      actionExecuted: offlineOperatorCountsAsHostWork('operate_browser'),
      actionDetail: {
        type: 'operate_browser',
        title: verdict.title,
        target: 'Chrome',
        payload: { offlineHostWork: false },
      },
      updatedMemory,
      offline: true,
    };
  }

  // 1.5.7 "जार्विस, terminal खोलो" / "Open Terminal" / "PowerShell"
  if (
    lower.includes('terminal खोलो') ||
    lower.includes('टर्मिनल खोलो') ||
    lower.includes('open terminal') ||
    lower.includes('open powershell') ||
    lower.includes('powershell खोलो')
  ) {
    const verdict = offlineOperatorVerdict('operate_terminal');
    const reply = offlineOperatorReply('operate_terminal', operatorLang);

    return {
      reply,
      spokenText: reply,
      intent: 'operate_terminal',
      actionExecuted: offlineOperatorCountsAsHostWork('operate_terminal'),
      actionDetail: {
        type: 'operate_terminal',
        title: verdict.title,
        target: 'Terminal',
        payload: { offlineHostWork: false },
      },
      updatedMemory,
      offline: true,
    };
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

  // 5.0 Dedicated Weather Inquiry ("आज का मौसम बताओ", "मौसम कैसा है", "what is the weather", "weather update")
  if (
    (lower.includes('मौसम') || lower.includes('weather') || lower.includes('तापमान') || lower.includes('temperature') || lower.includes('forecast')) &&
    !lower.includes('good morning') && !lower.includes('सुप्रभात') && !lower.includes('ब्रीफिंग') && !lower.includes('briefing') && !lower.includes('बैटरी')
  ) {
    updatedMemory.stats.actionsExecuted += 1;
    const weatherData = mobileStatus?.weather;

    // No weather source means no reading. Previously each field fell back to a
    // constant (27°C, 48%, 'New Delhi'), so the reply presented invented
    // readings as current conditions. A fixture sample counts as no source.
    if (!weatherData || weatherData.isSample === true || weatherData.available === false) {
      const unavailable = isHindi
        ? 'अभी कोई मौसम स्रोत कनेक्टेड नहीं है, इसलिए मौसम या तापमान का डेटा उपलब्ध नहीं है।'
        : isHinglish
        ? 'Abhi koi weather source connected nahi hai, isliye weather ya temperature data available nahi hai.'
        : 'No weather source is connected, so no weather or temperature data is available.';
      return {
        reply: unavailable,
        spokenText: unavailable,
        intent: 'weather_inquiry',
        actionExecuted: false,
        actionDetail: { type: 'weather_inquiry', title: 'Weather Unavailable' },
        updatedMemory,
        offline: true,
      };
    }

    const condition = weatherData.condition || 'Unknown';
    const tempC = weatherData.temperatureC;
    const humidity = weatherData.humidity;
    const location = weatherData.location || 'unknown location';

    const reply = isHindi
      ? `आज का मौसम ${condition === 'Clear Sky' ? 'साफ (Clear Sky)' : condition} है। वर्तमान तापमान लगभग ${tempC}°C (${location}) और आर्द्रता ${humidity}% है।`
      : isHinglish
      ? `Aaj ka weather ${condition} hai, temperature ${tempC}°C (${location}), humidity ${humidity}%.`
      : `Today's weather in ${location} is ${condition} with a temperature of ${tempC}°C and ${humidity}% humidity.`;

    return {
      reply,
      spokenText: reply,
      intent: 'weather_inquiry',
      actionExecuted: true,
      actionDetail: { type: 'weather_inquiry', title: `Weather: ${tempC}°C, ${condition}`, payload: { temperatureC: tempC, condition, location, humidity } },
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

    // Check actual permissions in mobileStatus or memory. With no connected
    // phone there is no telemetry, so each permission starts false; the caller
    // has supplied `mobileStatus` when a device really is attached. Previously
    // these all defaulted to true and the values below each fell back to a
    // plausible-looking constant (78%, 27°C, 5 notifications, 3 events,
    // 2 emails), so a briefing with no device attached reported invented
    // readings as if they were measured.
    const perms = mobileStatus?.permissions || {
      BATTERY_STATUS: false,
      WEATHER_LOCATION: false,
      NOTIFICATIONS: false,
      CALENDAR_EVENTS: false,
      EMAIL_INBOX: false,
      DEVICE_HEALTH: false,
    };

    // `available` alone is not enough: the mobile status engine returns
    // placeholder fixtures with available === true for notifications, calendar,
    // email and device health whenever the permission flag is set. Speaking
    // those numbers would present invented readings as measured ones, so an
    // isSample section is never treated as a real data source here.
    const batteryAvailable = perms.BATTERY_STATUS && mobileStatus?.battery?.available !== false && mobileStatus?.battery?.isSample !== true;
    const weatherAvailable = perms.WEATHER_LOCATION && mobileStatus?.weather?.available !== false && mobileStatus?.weather?.isSample !== true;
    const notifsAvailable = perms.NOTIFICATIONS && mobileStatus?.notifications?.available !== false && mobileStatus?.notifications?.isSample !== true;
    const calAvailable = perms.CALENDAR_EVENTS && mobileStatus?.calendar?.available !== false && mobileStatus?.calendar?.isSample !== true;
    const mailAvailable = perms.EMAIL_INBOX && mobileStatus?.email?.available !== false && mobileStatus?.email?.isSample !== true;

    const batteryLvl = mobileStatus?.battery?.level ?? null;
    const tempC = mobileStatus?.weather?.temperatureC ?? null;
    const condition = isHindi ? (mobileStatus?.weather?.conditionHi || null) : (mobileStatus?.weather?.condition || null);
    const notifCount = mobileStatus?.notifications?.totalCount ?? null;
    const calCount = mobileStatus?.calendar?.todayEventsCount ?? null;
    const mailCount = mobileStatus?.email?.unreadCount ?? null;

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
    } else if (perms.BATTERY_STATUS) {
      hiLines.push('बैटरी की रीडिंग इस रनटाइम पर उपलब्ध नहीं है।');
      enLines.push('No battery reading is available in this runtime.');
      hinglishLines.push('Battery reading is runtime par available nahi hai.');
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
    } else if (perms.WEATHER_LOCATION) {
      hiLines.push('मौसम की जानकारी उपलब्ध नहीं है — कोई मौसम स्रोत कनेक्टेड नहीं है।');
      enLines.push('Weather is not available — no weather source is connected.');
      hinglishLines.push('Weather data available nahi hai — koi weather source connected nahi hai.');
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
    } else if (perms.NOTIFICATIONS) {
      hiLines.push('नोटिफिकेशन्स इस रनटाइम पर पढ़े नहीं जा सके — कोई डिवाइस स्रोत जुड़ा नहीं है।');
      enLines.push('Notifications could not be read — no device notification source is connected.');
      hinglishLines.push('Notifications read nahi ho sake — koi device source connected nahi hai.');
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
    } else if (perms.CALENDAR_EVENTS) {
      enLines.push('No calendar reading is available — no device calendar source is connected.');
    }
    if (mailAvailable) {
      hiLines.push(`इनबॉक्स में ${mailCount} जरूरी ईमेल्स हैं।`);
      enLines.push(`${mailCount} unread emails in inbox.`);
      hinglishLines.push(`Inbox me ${mailCount} unread emails hain.`);
    } else if (perms.EMAIL_INBOX) {
      enLines.push('No inbox reading is available — no device email source is connected.');
    }

    // No device attached means no telemetry. Say so rather than asserting
    // health nobody measured.
    if (!mobileStatus) {
      hiLines.push('कोई फ़ोन जुड़ा नहीं है, इसलिए बैटरी, मौसम और टास्क डेटा उपलब्ध नहीं है।');
      enLines.push('No phone is connected, so battery, weather and task telemetry are not available.');
      hinglishLines.push('Koi phone connected nahi hai, isliye battery, weather aur task data available nahi hai.');
    }

    const reply = isHindi ? hiLines.join('\n') : isHinglish ? hinglishLines.join('\n') : enLines.join(' ');
    const spokenText = isHindi
      ? `${greetingHi} ${batteryAvailable ? `बैटरी ${batteryLvl} प्रतिशत है।` : ''} ${weatherAvailable ? `मौसम ${condition} है।` : ''} ${notifsAvailable ? `${notifCount} नए नोटिफिकेशन्स हैं।` : ''}`
      : isHinglish
      ? `${greetingHinglish} ${batteryAvailable ? `Battery ${batteryLvl}% hai.` : ''} ${weatherAvailable ? `Weather ${condition} hai.` : ''} ${notifsAvailable ? `${notifCount} new notifications hain.` : ''}`
      : `${greetingEn} ${batteryAvailable ? `Battery is at ${batteryLvl}%.` : ''} ${weatherAvailable ? `Weather is ${condition} at ${tempC} degrees.` : ''} ${notifsAvailable ? `You have ${notifCount} priority notifications.` : ''}`;

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

  // 5.5 Location Services & Geolocation Coordinates Inquiry
  if (
    lower.includes('where am i') ||
    lower.includes('my location') ||
    lower.includes('current location') ||
    lower.includes('show map') ||
    lower.includes('open map') ||
    lower.includes('location services') ||
    lower.includes('gps coordinates') ||
    lower.includes('my coordinates') ||
    lower.includes('gps status') ||
    lower.includes('geolocation') ||
    lower.includes('मेरा लोकेशन') ||
    lower.includes('मेरी लोकेशन') ||
    lower.includes('कहाँ हूँ') ||
    lower.includes('लोकेशन बताओ')
  ) {
    updatedMemory.stats.actionsExecuted += 1;
    const reply = isHindi
      ? 'जियोलोकेशन और टैक्टिकल मैप मोड्यूल खोला जा रहा है। आपके जीपीएस निर्देशांक प्राप्त किए जा रहे हैं।'
      : isHinglish
      ? 'Location Services & Tactical Map open ho raha hai. Real-time GPS telemetry acquire ki ja rahi hai.'
      : 'Accessing Geolocation API and orbital positioning telemetry. Opening Tactical Location Services.';

    return {
      reply,
      spokenText: isHindi
        ? 'लोकेशन सर्विसेज और जीपीएस मैप खोला जा रहा है।'
        : isHinglish
        ? 'Opening Location Services and tactical GPS map.'
        : 'Accessing orbital telemetry. Opening Geolocation HUD.',
      intent: 'location_services',
      actionExecuted: true,
      actionDetail: {
        type: 'location_services',
        title: 'Launch Location Services & Tactical Map',
      },
      updatedMemory,
      offline: true,
    };
  }

  // 6. Calculator & Math Expressions (Supports English, Hindi phrases e.g. "2 + 2 कितना होता है", and raw arithmetic)
  const isCallingCommand =
    lower.startsWith('call ') ||
    lower.startsWith('dial ') ||
    lower.includes('phone') ||
    lower.includes('कॉल') ||
    lower.includes('फोन') ||
    lower.includes('call lagao');

  const mathQueryMatch =
    !isCallingCommand &&
    (clean.match(/(?:calculate|what is|compute|solve|\bhow much is\b)\s+([0-9+\-*/().\s×÷]+)/i) ||
      clean.match(/([0-9]+(?:\.[0-9]+)?(?:\s*[\+\-\*\/×÷]\s*[0-9]+(?:\.[0-9]+)?)+)(?:\s*(?:कितना होता है|कितना है|होता है|kitna hota hai|kitna hai|kya hoga|\?))?/i));

  if (mathQueryMatch && /[0-9]/.test(mathQueryMatch[1])) {
    try {
      const expr = mathQueryMatch[1].trim();
      const sanitized = expr.replace(/×/g, '*').replace(/÷/g, '/').trim();
      if (/^[0-9+\-*/().\s]+$/.test(sanitized)) {
        const val = new Function(`'use strict'; return (${sanitized})`)();
        if (typeof val === 'number' && Number.isFinite(val)) {
          updatedMemory.stats.actionsExecuted += 1;
          const resStr = String(Math.round(val * 1000000) / 1000000);
          const reply = isHindi ? `${expr} का मान ${resStr} होता है, सर।` : isHinglish ? `Result: ${expr} = ${resStr}` : `${expr} is ${resStr}.`;
          return {
            reply,
            spokenText: isHindi ? `${expr} बराबर ${resStr} होता है।` : isHinglish ? `${expr} is equal to ${resStr}.` : `The result of ${expr} is ${resStr}.`,
            intent: 'open_calculator',
            actionExecuted: true,
            actionDetail: { type: 'open_calculator', title: `Computed: ${expr} = ${resStr}`, payload: { expression: expr, result: val } },
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
    const reply = isHindi
      ? 'इन-ऐप कैलकुलेटर दृश्य खोला जा रहा है। ऑफ़लाइन मोड में कोई वास्तविक डेस्कटॉप कैलकुलेटर ऐप नहीं खुलता।'
      : isHinglish
      ? 'In-app calculator view khol raha hoon, Sir. Offline mode mein asli desktop Calculator app nahi khulta.'
      : 'Opening the in-app calculator view. Offline mode does not open a real desktop Calculator application.';
    return {
      reply,
      spokenText: reply,
      intent: 'open_calculator',
      actionExecuted: true,
      actionDetail: { type: 'open_calculator', title: 'Open Calculator View (in-app)' },
      updatedMemory,
      offline: true,
    };
  }

  // 7. Notepad & Workspace
  if (lower.includes('notepad') || lower.includes('create file') || lower.includes('नोटपैड') || lower.includes('फाइल बनाओ') || lower.includes('write note')) {
    updatedMemory.stats.actionsExecuted += 1;
    const reply = isHindi
      ? 'इन-ऐप नोट्स वर्कस्पेस खोला जा रहा है। ऑफ़लाइन मोड में कोई वास्तविक नोटपैड ऐप नहीं खुलता।'
      : isHinglish
      ? 'In-app notes workspace khol raha hoon, Sir. Offline mode mein asli Notepad app nahi khulta.'
      : 'Opening the in-app notes workspace. Offline mode does not open a real Notepad application.';
    return {
      reply,
      spokenText: reply,
      intent: 'open_notepad',
      actionExecuted: true,
      actionDetail: { type: 'open_notepad', title: 'Open Notes Workspace (in-app)' },
      updatedMemory,
      offline: true,
    };
  }

  // 7.1 Telephony & Voice Calling ("call Dr. Wayne", "answer call", "hang up", "open dialer", etc.)
  // Mandatory Level-4 Outbound Authorization (Section H)
  if (
    lower.includes('कल इस नंबर पर फोन') ||
    lower.includes('कल फोन करना') ||
    lower.includes('schedule call tomorrow')
  ) {
    updatedMemory.stats.actionsExecuted += 1;
    const targetMatch = clean.match(/(?:नंबर पर फोन|कल फोन करना|schedule call tomorrow)\s*(.*)/i);
    const target = targetMatch && targetMatch[1].trim() ? targetMatch[1].trim() : '+91 9876543210';
    const masked = maskPhoneNumber(target);
    stagedOutboundCall = { destination: target, masked, isScheduled: true };
    const reply = isHindi
      ? `कल के लिए ${masked} पर आउटबाउंड कॉल रिक्वेस्ट दर्ज कर ली गई है।`
      : `Scheduled pending outbound call request for tomorrow to ${masked}.`;
    return {
      reply,
      spokenText: reply,
      intent: 'outbound_call_authorization',
      actionExecuted: true,
      actionDetail: { type: 'outbound_call_authorization', title: `Scheduled Call: ${masked}`, payload: { target, masked, scheduled: true } },
      updatedMemory,
      offline: true,
    };
  }

  // Explicit confirmation for staged call ("हाँ, कॉल करो", "yes call", "approve call")
  if (
    (lower === 'हाँ, कॉल करो' ||
      lower === 'हाँ कॉल करो' ||
      lower.includes('call now') ||
      lower.includes('yes, call') ||
      lower.includes('yes call') ||
      lower.includes('approve call') ||
      lower === 'हाँ' ||
      lower === 'yes' ||
      lower === 'approve') &&
    stagedOutboundCall
  ) {
    updatedMemory.stats.actionsExecuted += 1;
    const { destination, masked } = stagedOutboundCall;
    const providerStatus = TelephonyProviderRegistry.getActiveStatus();

    if (providerStatus === 'NOT_CONFIGURED') {
      stagedOutboundCall = null;
      const reply = isHindi
        ? `कॉल नहीं की जा सकी क्योंकि टेलीफोनी क्रेडेंशियल्स कॉन्फ़िगर नहीं हैं (TELEPHONY_NOT_CONFIGURED)।`
        : `Cannot place outbound call because telephony credentials are missing (TELEPHONY_NOT_CONFIGURED).`;
      return {
        reply,
        spokenText: reply,
        intent: 'outbound_call_authorization',
        actionExecuted: false,
        actionDetail: { type: 'outbound_call_authorization', title: 'Telephony Not Configured', payload: { status: 'TELEPHONY_NOT_CONFIGURED' } },
        updatedMemory,
        offline: true,
      };
    }

    stagedOutboundCall = null;
    const reply = isHindi
      ? `कॉल अधिकृत हो गई है। ${masked} पर आउटबाउंड कॉल शुरू की जा रही है।`
      : `Call authorized. Placing outbound call to ${masked} through carrier gateway.`;
    return {
      reply,
      spokenText: reply,
      intent: 'make_call',
      actionExecuted: true,
      actionDetail: { type: 'make_call', title: `Calling ${masked}`, payload: { destination, autoDial: true } },
      updatedMemory,
      offline: true,
    };
  }

  // Explicit cancellation ("रहने दो", "cancel call", "don't call")
  if (
    lower.includes('रहने दो') ||
    lower.includes('cancel call') ||
    lower.includes('don\'t call') ||
    lower.includes('कॉल रद्द करो')
  ) {
    stagedOutboundCall = null;
    updatedMemory.stats.actionsExecuted += 1;
    const reply = isHindi ? 'आउटबाउंड कॉल रद्द कर दी गई है।' : 'Outbound call has been cancelled.';
    return {
      reply,
      spokenText: reply,
      intent: 'outbound_call_authorization',
      actionExecuted: true,
      actionDetail: { type: 'outbound_call_authorization', title: 'Outbound Call Cancelled' },
      updatedMemory,
      offline: true,
    };
  }

  // Outbound call command - Requires Level-4 Human Authorization (Section H)
  if (
    lower.startsWith('call ') ||
    lower.startsWith('dial ') ||
    lower.includes('phone call') ||
    lower.includes('make a call') ||
    lower.includes('कॉल करो') ||
    lower.includes('फोन करो') ||
    lower.includes('call lagao') ||
    lower.includes('इस नंबर पर फोन करो')
  ) {
    updatedMemory.stats.actionsExecuted += 1;
    const targetMatch = clean.match(/(?:call|dial|फोन करो|कॉल करो|call lagao|इस नंबर पर फोन करो)\s+(.+)/i);
    const target = targetMatch ? targetMatch[1].trim() : '+91 9876543210';
    const masked = maskPhoneNumber(target);

    // Stage for Level-4 Authorization
    stagedOutboundCall = { destination: target, masked };

    const reply = isHindi
      ? `सर, मैं इस नंबर पर कॉल करने वाला हूँ: ${masked}। क्या आप अनुमति देते हैं?`
      : `Sir, I am about to call: ${masked}. Do you authorize this outbound call?`;
    return {
      reply,
      spokenText: reply,
      intent: 'outbound_call_authorization',
      actionExecuted: true,
      actionDetail: {
        type: 'outbound_call_authorization',
        title: `Authorization Required: ${masked}`,
        payload: { target, masked, requiresApproval: true },
      },
      updatedMemory,
      offline: true,
    };
  }

  // 7.2 Clinic Operating Hours Query (Section C & X)
  if (
    lower.includes('क्लिनिक कितने बजे') ||
    lower.includes('क्लिनिक खुलेगा') ||
    lower.includes('clinic hours') ||
    lower.includes('clinic timing') ||
    lower.includes('when does the clinic open') ||
    lower.includes('what time does the clinic open')
  ) {
    updatedMemory.stats.actionsExecuted += 1;
    const reply = isHindi
      ? `क्लिनिक सोमवार से शुक्रवार सुबह 9:00 बजे से शाम 6:00 बजे तक और शनिवार को सुबह 9:00 बजे से दोपहर 2:00 बजे तक खुला रहता है।`
      : `The clinic is open Monday through Friday from 9:00 AM to 6:00 PM, and Saturday from 9:00 AM to 2:00 PM.`;
    return {
      reply,
      spokenText: reply,
      intent: 'clinic_hours',
      actionExecuted: true,
      actionDetail: { type: 'clinic_hours', title: 'Clinic Hours Telemetry' },
      updatedMemory,
      offline: true,
    };
  }

  // 7.3 Clinic Appointment Process Query (Section C & X)
  if (
    lower.includes('अपॉइंटमेंट कैसे मिलेगा') ||
    lower.includes('अपॉइंटमेंट के लिए क्या करना होगा') ||
    lower.includes('appointment के लिए क्या करना') ||
    lower.includes('how to get an appointment') ||
    lower.includes('book appointment') ||
    lower.includes('appointment process')
  ) {
    updatedMemory.stats.actionsExecuted += 1;
    const reply = isHindi
      ? DEFAULT_CLINIC_CONFIG.appointmentProcess.hi
      : DEFAULT_CLINIC_CONFIG.appointmentProcess.en;
    return {
      reply,
      spokenText: reply,
      intent: 'appointment_process',
      actionExecuted: true,
      actionDetail: { type: 'appointment_process', title: 'Appointment Booking Process' },
      updatedMemory,
      offline: true,
    };
  }

  // 7.4 Human Handoff Intent (Section G & X)
  if (checkHumanHandoffIntent(clean)) {
    updatedMemory.stats.actionsExecuted += 1;
    const provider = TelephonyProviderRegistry.getProvider();
    let reply = '';
    if (provider.isConfigured()) {
      reply = isHindi
        ? 'मैं आपकी कॉल क्लिनिक कर्मचारी को ट्रांसफर कर रहा हूँ, कृपया प्रतीक्षा करें।'
        : 'Attempting to transfer your call to our human clinic staff, please hold.';
    } else {
      reply = isHindi
        ? 'माफ़ कीजिए, अभी क्लिनिक स्टाफ सीधे उपलब्ध नहीं है। क्या मैं आपका कोई संदेश नोट कर सकता हूँ?'
        : 'I apologize, our human staff is not directly reachable on this line right now. Would you like to leave a message?';
    }
    return {
      reply,
      spokenText: reply,
      intent: 'human_handoff',
      actionExecuted: true,
      actionDetail: { type: 'human_handoff', title: 'Human Staff Handoff' },
      updatedMemory,
      offline: true,
    };
  }

  if (
    lower.includes('answer call') ||
    lower.includes('pick up the phone') ||
    lower.includes('pick up the call') ||
    lower.includes('कॉल उठाओ') ||
    lower.includes('फोन उठाओ') ||
    lower.includes('phone uthao')
  ) {
    updatedMemory.stats.actionsExecuted += 1;
    const reply = isHindi ? 'कॉल कनेक्ट किया जा रहा है।' : 'Connecting call with caller.';
    return {
      reply,
      spokenText: reply,
      intent: 'answer_call',
      actionExecuted: true,
      actionDetail: { type: 'answer_call', title: 'Call Connected' },
      updatedMemory,
      offline: true,
    };
  }

  if (
    lower.includes('hang up') ||
    lower.includes('end call') ||
    lower.includes('cut the call') ||
    lower.includes('disconnect call') ||
    lower.includes('कॉल काटो') ||
    lower.includes('फोन काटो') ||
    lower.includes('call kato')
  ) {
    updatedMemory.stats.actionsExecuted += 1;
    const reply = isHindi ? 'फोन कॉल समाप्त कर दिया गया है।' : 'Terminating active phone call.';
    return {
      reply,
      spokenText: reply,
      intent: 'hangup_call',
      actionExecuted: true,
      actionDetail: { type: 'hangup_call', title: 'Call Ended' },
      updatedMemory,
      offline: true,
    };
  }

  if (
    lower.includes('reject call') ||
    lower.includes('decline call') ||
    lower.includes('कॉल रिजेक्ट करो')
  ) {
    updatedMemory.stats.actionsExecuted += 1;
    const reply = isHindi ? 'कॉल रिजेक्ट कर दिया गया है।' : 'Declining incoming call.';
    return {
      reply,
      spokenText: reply,
      intent: 'reject_call',
      actionExecuted: true,
      actionDetail: { type: 'reject_call', title: 'Call Declined' },
      updatedMemory,
      offline: true,
    };
  }

  if (
    lower.includes('call hub') ||
    lower.includes('open dialer') ||
    lower.includes('open phone') ||
    lower.includes('phone dialer') ||
    lower.includes('telephony') ||
    lower.includes('कॉल हब') ||
    lower.includes('फोन डायलर')
  ) {
    updatedMemory.stats.actionsExecuted += 1;
    const reply = isHindi ? 'टेलीफोनी हब खोला जा रहा है।' : isHinglish ? 'Telephony Hub open ho raha hai.' : 'Opening the in-app Voice AI Telephony Hub. No external phone dialer is opened.';
    return {
      reply,
      spokenText: reply,
      intent: 'telephony_hub',
      actionExecuted: true,
      actionDetail: { type: 'telephony_hub', title: 'In-App Telephony Hub (external dialer not opened)' },
      updatedMemory,
      offline: true,
    };
  }

  if (
    lower.includes('call history') ||
    lower.includes('call logs') ||
    lower.includes('recent calls') ||
    lower.includes('who called') ||
    lower.includes('कॉल हिस्ट्री')
  ) {
    updatedMemory.stats.actionsExecuted += 1;
    const reply = isHindi ? 'इस ऐप में दर्ज कॉल हिस्ट्री दिखाई जा रही है।' : 'Showing the call logs and transcripts recorded in this app.';
    return {
      reply,
      spokenText: reply,
      intent: 'call_history',
      actionExecuted: true,
      actionDetail: { type: 'call_history', title: 'In-App Call Logs (no external phone records read)' },
      updatedMemory,
      offline: true,
    };
  }

  // 8. Paint & Canvas
  if (lower.includes('paint') || lower.includes('drawing') || lower.includes('पेंट')) {
    updatedMemory.stats.actionsExecuted += 1;
    const reply = isHindi
      ? 'इन-ऐप पेंट कैनवास खोला जा रहा है। ऑफ़लाइन मोड में कोई वास्तविक पेंट ऐप नहीं खुलता।'
      : isHinglish
      ? 'In-app paint canvas khol raha hoon, Sir. Offline mode mein asli Paint app nahi khulta.'
      : 'Opening the in-app paint canvas. Offline mode does not open a real desktop Paint application.';
    return {
      reply,
      spokenText: reply,
      intent: 'open_paint',
      actionExecuted: true,
      actionDetail: { type: 'open_paint', title: 'Open Paint Canvas (in-app)' },
      updatedMemory,
      offline: true,
    };
  }

  // 8.1 Screenshot Tool
  if (lower.includes('take screenshot') || lower.includes('screenshot') || lower.includes('स्क्रीनशॉट') || lower.includes('screen capture')) {
    // This offline path captures nothing: it has no capture backend, and the
    // browser/desktop route is chosen by the caller. It must not speak as though
    // a screen capture happened. The real capture lives in
    // `captureScreenshot()` and reports NOT_AVAILABLE on a headless host.
    const reply = isHindi
      ? 'स्क्रीनशॉट अनुरोध दर्ज किया गया, परंतु ऑफ़लाइन मोड में कोई कैप्चर बैकएंड नहीं है — कोई छवि नहीं बनी।'
      : isHinglish
      ? 'Screenshot request note kar liya, lekin offline mode mein capture backend nahi hai — koi image nahi bani.'
      : 'Screenshot request registered, but this offline path has no capture backend, so no image was captured.';
    return {
      reply,
      spokenText: reply,
      intent: 'take_screenshot',
      actionExecuted: false,
      actionDetail: { type: 'take_screenshot', title: 'Screen Capture Not Available (offline path)' },
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
  // No mixer backend is reached from here, so these branches must not speak as
  // though the system output level moved. The honest in-app slider verdict comes
  // from `volumeVerdict()` on the `/api/chat` path.
  if (lower.includes('volume up') || lower.includes('आवाज बढ़ाओ') || lower.includes('increase volume') || lower.includes('louder')) {
    const reply = isHindi
      ? 'इन-ऐप वॉइस आउटपुट बढ़ाया जा सकता है; सिस्टम वॉल्यूम मिक्सर ऑफ़लाइन मोड से नहीं बदला जाता।'
      : isHinglish
      ? 'In-app voice output badha sakta hoon; system volume mixer offline mode se nahi badalta.'
      : 'The in-app voice output can be raised, but the system volume mixer is not changed from offline mode.';
    return {
      reply,
      spokenText: reply,
      intent: 'volume_up',
      actionExecuted: false,
      actionDetail: { type: 'volume_up', title: 'In-App Volume Only (system mixer not changed)' },
      updatedMemory,
      offline: true,
    };
  }

  if (lower.includes('volume down') || lower.includes('आवाज कम करो') || lower.includes('decrease volume') || lower.includes('quieter')) {
    const reply = isHindi
      ? 'इन-ऐप वॉइस आउटपुट कम किया जा सकता है; सिस्टम वॉल्यूम मिक्सर ऑफ़लाइन मोड से नहीं बदला जाता।'
      : isHinglish
      ? 'In-app voice output kam kar sakta hoon; system volume mixer offline mode se nahi badalta.'
      : 'The in-app voice output can be lowered, but the system volume mixer is not changed from offline mode.';
    return {
      reply,
      spokenText: reply,
      intent: 'volume_down',
      actionExecuted: false,
      actionDetail: { type: 'volume_down', title: 'In-App Volume Only (system mixer not changed)' },
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

  // 12.0 System Diagnostics & Full System Time/Date Report ("what is the current time and date", "diagnostics")
  if (
    lower.includes('current time and date') ||
    lower.includes('diagnostic') ||
    lower.includes('system status') ||
    lower.includes('diagnostics')
  ) {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateStr = now.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    // No subsystem probe runs here, so this branch reports the clock and says
    // so plainly instead of asserting that systems are healthy.
    const reply = isHindi
      ? `वर्तमान समय ${timeStr} है और आज ${dateStr} है। मैंने डायग्नोस्टिक्स नहीं चलाए हैं।`
      : isHinglish
      ? `Abhi time ${timeStr} hai, date ${dateStr}. Maine diagnostics nahi chalaye.`
      : `The current system time is ${timeStr} on ${dateStr}. I have not run any system diagnostics.`;

    return {
      reply,
      spokenText: reply,
      intent: 'system_diagnostic',
      actionExecuted: true,
      actionDetail: { type: 'system_diagnostic', title: 'Clock reported (no diagnostics run)' },
      updatedMemory,
      offline: true,
    };
  }

  // 12.1 Time & Date / Clock Inquiry ("time kya hai", "kitne baje", "abhi ka time kya ho raha hai", "abhi kitne baje hain")
  if (
    lower.includes('time') ||
    lower.includes('date') ||
    lower.includes('समय') ||
    lower.includes('तारीख') ||
    lower.includes('waqt') ||
    lower.includes('बजे') ||
    lower.includes('कितने बजे') ||
    lower.includes('घड़ी') ||
    lower.includes('clock')
  ) {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateStr = now.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    // Answering the clock is not a health check; do not claim system health.
    const reply = isHindi
      ? `वर्तमान समय ${timeStr} है और आज ${dateStr} है।`
      : isHinglish
      ? `Abhi time ${timeStr} hai, date ${dateStr}.`
      : `The current system time is ${timeStr} on ${dateStr}.`;

    return {
      reply,
      spokenText: reply,
      intent: 'time_inquiry',
      actionExecuted: true,
      actionDetail: { type: 'time_inquiry', title: `Current Time: ${timeStr}`, payload: { timeStr, dateStr } },
      updatedMemory,
      offline: true,
    };
  }

  // 12.5 JARVIS Capabilities & Help Inquiry ("JARVIS क्या कर सकता है?", "What can you do?")
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
    lower.includes('what can jarvis do')
  ) {
    const reply = isHindi
      ? `मैं HERMES JARVIS हूँ — आपका ऑटोनॉमस AI असिस्टेंट। मुख्य क्षमताएं:\n1. 📱 मोबाइल स्थिति, मौसम व सुबह की ब्रीफिंग\n2. 🛡️ 4-लेवल सुरक्षा व अनुमति नियंत्रण\n3. 💼 फ्रीलांस कोटेशन व लीड प्रबंधन\n4. 📱 सोशल मीडिया पोस्ट्स जनरेशन\n5. 💻 गिट ऑडिट, फाइल्स व ऑटोनॉमस टूल्स\n6. 🌐 यूट्यूब वीडियो सारांश व ओरेकल क्लाउड मॉनिटरिंग`
      : isHinglish
      ? `Mai HERMES JARVIS hoon. Key capabilities: Mobile status & weather, freelance quotations, social media drafts, git/code audit, youtube summary, and Oracle Cloud monitoring.`
      : `I am HERMES JARVIS — your autonomous AI assistant. Key capabilities include:\n1. Mobile Personal Status, weather & morning briefings\n2. 4-Level Security Matrix & Human Consent Gateway\n3. Freelance pipeline & instant quotation generation\n4. Social media drafts with Level-4 publishing approval\n5. Autonomous tools: Git audit, file manager & web research\n6. YouTube video summarization & Oracle Cloud VM monitoring`;

    return {
      reply,
      spokenText: isHindi
        ? `मैं हरमीस जार्विस हूँ। मैं मोबाइल स्टेटस, मौसम, सुरक्षा गेटवे, फ्रीलांस कोटेशन, सोशल मीडिया और गिट टूल्स में आपकी सहायता कर सकता हूँ।`
        : reply,
      intent: 'capabilities_inquiry',
      actionExecuted: true,
      actionDetail: { type: 'capabilities_inquiry', title: 'JARVIS Capabilities Matrix' },
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
      ? `मैं अपनी स्वयं की स्वास्थ्य जाँच नहीं कर सकता, इसलिए "सब ठीक है" कहना असत्य होगा। आपने जो पूछा उसके लिए मैं तैयार हूँ।`
      : isHinglish
      ? `Main apni health khud check nahi kar sakta, isliye "sab theek hai" kehna galat hoga. Aapke agle command ke liye ready hoon.`
      : `I cannot health-check myself, so I will not claim all systems are nominal. Ready for your next command.`;

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
