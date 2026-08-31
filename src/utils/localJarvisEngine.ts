import { IntentCategory, ActionDetail, MemoryStore } from '../types';

export interface LocalProcessingResult {
  reply: string;
  intent?: IntentCategory;
  actionExecuted?: boolean;
  actionDetail?: ActionDetail;
  updatedMemory?: MemoryStore;
  offline: boolean;
}

export function processOfflineCommand(
  text: string,
  currentMemory: MemoryStore,
  language: string = 'en-US'
): LocalProcessingResult {
  const clean = text.trim();
  const lower = clean.toLowerCase();
  const isHindi = language.startsWith('hi') || /[\u0900-\u097F]/.test(text);

  let updatedMemory: MemoryStore = {
    ...currentMemory,
    stats: {
      totalCommands: (currentMemory.stats?.totalCommands || 0) + 1,
      actionsExecuted: currentMemory.stats?.actionsExecuted || 0,
      lastActive: new Date().toISOString(),
    },
  };

  // 1. Identity Recognition (Setting Name)
  const nameMatchEn = clean.match(/(?:my name is|call me|i am)\s+([a-zA-Z0-9_\-\s]+)/i);
  const nameMatchHi = clean.match(/(?:मेरा नाम|मुझे)\s+([a-zA-Z0-9_\-\u0900-\u097F\s]+)\s+(?:है|बुलाओ)/i);
  if (nameMatchEn || nameMatchHi) {
    const extractedName = (nameMatchEn ? nameMatchEn[1] : nameMatchHi![1]).trim();
    updatedMemory = {
      ...updatedMemory,
      name: extractedName,
      stats: {
        ...updatedMemory.stats,
        actionsExecuted: updatedMemory.stats.actionsExecuted + 1,
      },
    };
    const reply = isHindi
      ? `नमस्ते ${extractedName} जी! मैंने आपका नाम ऑफ़लाइन मेमोरी में सुरक्षित कर लिया है।`
      : `Pleasure to know you, ${extractedName}! I have committed your identity to the local offline memory banks.`;
    return {
      reply,
      intent: 'set_name',
      actionExecuted: true,
      actionDetail: { type: 'set_name', title: `Set User Name to ${extractedName}` },
      updatedMemory,
      offline: true,
    };
  }

  // 2. Asking for Name
  if (lower.includes('my name') || lower.includes('who am i') || lower.includes('मेरा नाम') || lower.includes('मैं कौन')) {
    const currentName = updatedMemory.name;
    const reply = currentName
      ? isHindi
        ? `आपका नाम ${currentName} है, जैसा कि मेमोरी में दर्ज है।`
        : `Your name is ${currentName}, as recorded in our offline memory banks.`
      : isHindi
      ? 'मैंने अभी तक आपका नाम दर्ज नहीं किया है। आप कह सकते हैं: "मेरा नाम [Name] है"।'
      : 'You haven\'t informed me of your name yet, Sir. You may say: "My name is [Name]".';
    return {
      reply,
      intent: 'get_name',
      updatedMemory,
      offline: true,
    };
  }

  // 3. Calculator & Math Expressions
  if (lower.includes('calculator') || lower.includes('कैलकुलेटर')) {
    updatedMemory.stats.actionsExecuted += 1;
    return {
      reply: isHindi ? 'कैलकुलेटर खोला जा रहा है...' : 'Launching the Calculator interface now, Sir.',
      intent: 'open_calculator',
      actionExecuted: true,
      actionDetail: { type: 'open_calculator', title: 'Open Calculator Tool' },
      updatedMemory,
      offline: true,
    };
  }

  // Check direct math evaluation (e.g. "what is 25 + 75", "calculate 40 * 12")
  const mathQueryMatch = clean.match(/(?:calculate|what is|compute|solve|\bhow much is\b)\s+([0-9+\-*/().\s]+)/i);
  if (mathQueryMatch && /[0-9]/.test(mathQueryMatch[1])) {
    try {
      const sanitized = mathQueryMatch[1].replace(/×/g, '*').replace(/÷/g, '/').trim();
      if (/^[0-9+\-*/().\s]+$/.test(sanitized)) {
        const val = new Function(`'use strict'; return (${sanitized})`)();
        if (typeof val === 'number' && Number.isFinite(val)) {
          const resStr = String(Math.round(val * 1000000) / 1000000);
          return {
            reply: isHindi
              ? `गणना परिणाम: ${sanitized} = ${resStr}`
              : `The calculated result for ${sanitized} is ${resStr}, Sir.`,
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

  // 4. Notepad & File Creation
  if (lower.includes('notepad') || lower.includes('create file') || lower.includes('नोटपैड') || lower.includes('फाइल बनाओ') || lower.includes('write note')) {
    updatedMemory.stats.actionsExecuted += 1;
    return {
      reply: isHindi ? 'नोटपैड खोला जा रहा है...' : 'Opening Notepad for live document editing, Sir.',
      intent: 'open_notepad',
      actionExecuted: true,
      actionDetail: { type: 'open_notepad', title: 'Open Notepad Workspace' },
      updatedMemory,
      offline: true,
    };
  }

  // 5. Paint & Canvas
  if (lower.includes('paint') || lower.includes('drawing') || lower.includes('पेंट')) {
    updatedMemory.stats.actionsExecuted += 1;
    return {
      reply: isHindi ? 'पेंट कैनवास खोला जा रहा है...' : 'Accessing digital drawing matrix and paint tool.',
      intent: 'open_paint',
      actionExecuted: true,
      actionDetail: { type: 'open_paint', title: 'Open Paint Canvas' },
      updatedMemory,
      offline: true,
    };
  }

  // 6. Screenshot Tool
  if (lower.includes('screenshot') || lower.includes('screen capture') || lower.includes('स्क्रीनशॉट')) {
    updatedMemory.stats.actionsExecuted += 1;
    return {
      reply: isHindi ? 'स्क्रीन कैप्चर टूल खोला जा रहा है...' : 'Opening screen capture and visual inspector tool.',
      intent: 'take_screenshot',
      actionExecuted: true,
      actionDetail: { type: 'take_screenshot', title: 'Take Screenshot' },
      updatedMemory,
      offline: true,
    };
  }

  // 7. Blueprint / Project Check
  if (lower.includes('project') || lower.includes('blueprint') || lower.includes('प्रोजेक्ट') || lower.includes('ब्लूप्रिंट') || lower.includes('roadmap')) {
    updatedMemory.stats.actionsExecuted += 1;
    return {
      reply: isHindi
        ? 'मास्टर ब्लूप्रिंट और प्रोजेक्ट स्थिति खोली जा रही है। फेज 0 (सेफ्टी) और फेज 1 (क्लाउड वीएम) तैयार हैं।'
        : 'Displaying Master Blueprint Phase 0 to 9. System architecture and roadmap are operational.',
      intent: 'check_project',
      actionExecuted: true,
      actionDetail: { type: 'check_project', title: 'Open Master Blueprint Roadmap' },
      updatedMemory,
      offline: true,
    };
  }

  // 8. Freelance Pipeline & Quotations
  if (lower.includes('quotation') || lower.includes('freelance') || lower.includes('proposal') || lower.includes('क्लाइंट') || lower.includes('कोटेशन')) {
    updatedMemory.stats.actionsExecuted += 1;
    return {
      reply: isHindi
        ? 'फ्रीलांस लीड्स और कोटेशन जनरेटर खोला जा रहा है।'
        : 'Opening Freelance Pipeline CRM & Automated Quotation Engine.',
      intent: 'generate_quotation',
      actionExecuted: true,
      actionDetail: { type: 'generate_quotation', title: 'Open Freelance CRM' },
      updatedMemory,
      offline: true,
    };
  }

  // 9. Social Media Post Generator
  if (lower.includes('social') || lower.includes('linkedin') || lower.includes('twitter') || lower.includes('पोस्ट') || lower.includes('सोशल')) {
    updatedMemory.stats.actionsExecuted += 1;
    return {
      reply: isHindi
        ? 'सोशल मीडिया पोस्ट ड्राफ्टिंग और अप्रूवल कंसोल खोला जा रहा है।'
        : 'Launching Social Media Generator & Human Approval Matrix.',
      intent: 'create_social_post',
      actionExecuted: true,
      actionDetail: { type: 'create_social_post', title: 'Open Social Media Console' },
      updatedMemory,
      offline: true,
    };
  }

  // 10. Proactive Routines & Morning Report
  if (lower.includes('routine') || lower.includes('morning report') || lower.includes('briefing') || lower.includes('रिपोर्ट') || lower.includes('रूटीन')) {
    updatedMemory.stats.actionsExecuted += 1;
    return {
      reply: isHindi
        ? 'दैनिक रूटीन और 4-टाइम स्लॉट प्रोएक्टिव ब्रीफिंग खोली जा रही है।'
        : 'Opening Proactive Routines & Daily AI Dispatch Matrix.',
      intent: 'schedule_morning_report',
      actionExecuted: true,
      actionDetail: { type: 'schedule_morning_report', title: 'Open Daily Routines' },
      updatedMemory,
      offline: true,
    };
  }

  // 11. Oracle Cloud & Infrastructure
  if (lower.includes('oracle') || lower.includes('cloud') || lower.includes('vm') || lower.includes('server') || lower.includes('क्लाउड')) {
    updatedMemory.stats.actionsExecuted += 1;
    return {
      reply: isHindi
        ? 'ओरेकल क्लाउड Always Free ARM64 टेलीमेट्री खोली जा रही है।'
        : 'Displaying Oracle Cloud Always Free ARM64 infrastructure and port telemetry.',
      intent: 'cloud_telemetry',
      actionExecuted: true,
      actionDetail: { type: 'cloud_telemetry', title: 'Open Oracle Cloud Telemetry' },
      updatedMemory,
      offline: true,
    };
  }

  // 12. Security Matrix & Permissions
  if (lower.includes('security') || lower.includes('safety') || lower.includes('सुरक्षा') || lower.includes('level')) {
    updatedMemory.stats.actionsExecuted += 1;
    return {
      reply: isHindi
        ? '4-लेवल सुरक्षा मैट्रिक्स और ऑडिट लॉग्स खोले जा रहे हैं।'
        : 'Opening Security Matrix & 4-Level Autonomous Safety Policy.',
      intent: 'security_audit',
      actionExecuted: true,
      actionDetail: { type: 'security_audit', title: 'Open Security Matrix' },
      updatedMemory,
      offline: true,
    };
  }

  // 13. System Time / Date Query
  if (lower.includes('time') || lower.includes('date') || lower.includes('समय') || lower.includes('तारीख')) {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const dateStr = now.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const reply = isHindi
      ? `वर्तमान समय ${timeStr} है और आज ${dateStr} है।`
      : `The current system time is ${timeStr} on ${dateStr}, Sir.`;
    return {
      reply,
      intent: 'system_diagnostic',
      updatedMemory,
      offline: true,
    };
  }

  // 14. Volume Controls
  if (lower.includes('volume up') || lower.includes('आवाज बढ़ाओ')) {
    return {
      reply: isHindi ? 'ऑडियो वॉल्यूम बढ़ाया गया।' : 'Increasing voice synthesizer volume, Sir.',
      intent: 'volume_up',
      actionExecuted: true,
      actionDetail: { type: 'volume_up', title: 'Volume Increased' },
      updatedMemory,
      offline: true,
    };
  }

  if (lower.includes('volume down') || lower.includes('आवाज कम करो')) {
    return {
      reply: isHindi ? 'ऑडियो वॉल्यूम घटाया गया।' : 'Decreasing voice synthesizer volume, Sir.',
      intent: 'volume_down',
      actionExecuted: true,
      actionDetail: { type: 'volume_down', title: 'Volume Decreased' },
      updatedMemory,
      offline: true,
    };
  }

  // 15. Search / Browser
  if (lower.includes('search') || lower.includes('google') || lower.includes('सर्च')) {
    const searchPart = clean.replace(/^(?:search for|search|google search|google|ढूंढो|सर्च करो)\s*/i, '');
    updatedMemory.stats.actionsExecuted += 1;
    return {
      reply: isHindi ? `वेब ब्राउज़र खोला जा रहा है: "${searchPart}"` : `Launching embedded web search for: "${searchPart}"`,
      intent: 'google_search',
      actionExecuted: true,
      actionDetail: { type: 'google_search', title: `Search for ${searchPart}`, payload: { query: searchPart } },
      updatedMemory,
      offline: true,
    };
  }

  // 16. General Offline Fallback Greeting / Conversational Response
  const userName = updatedMemory.name || 'Sir';
  const offlineNote = isHindi
    ? `कमांड स्वीकार की गई, ${userName}। मैं वर्तमान में लोकल ऑफ़लाइन मोड में काम कर रहा हूँ। आपका डेटा स्थानीय मेमोरी में सुरक्षित है।`
    : `Command acknowledged, ${userName}. Operating via local offline neural matrix. All state and notes are preserved in persistent local memory.`;

  return {
    reply: offlineNote,
    intent: 'chat',
    updatedMemory,
    offline: true,
  };
}
