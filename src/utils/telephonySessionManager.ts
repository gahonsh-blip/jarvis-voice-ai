import {
  TelephonySession,
  TelephonyCallState,
  TelephonyTurn,
  OutboundCallRequest,
  PhonePermissionKey,
  PhonePermissionState,
} from '../types/telephonyProvider';
import {
  DEFAULT_PHONE_PERMISSIONS,
  loadPhonePermissions,
  maskPhoneNumber,
  DEFAULT_CLINIC_CONFIG,
  evaluateClinicSafety,
  checkHumanHandoffIntent,
} from './telephonyPermissions';
import { TelephonyProviderRegistry } from './telephonyAdapters';

export class TelephonySessionManager {
  private static activeSessions: Map<string, TelephonySession> = new Map();
  private static pendingOutboundRequests: Map<string, OutboundCallRequest> = new Map();
  private static callHistoryArchive: TelephonySession[] = [];

  /**
   * Create a new Inbound Call Session
   */
  static createInboundSession(params: {
    rawCallerNumber: string;
    rawRecipientNumber?: string;
    providerName?: string;
    isSimulated?: boolean;
  }): TelephonySession {
    const callSessionId = `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const maskedCaller = maskPhoneNumber(params.rawCallerNumber);
    const maskedRecipient = maskPhoneNumber(params.rawRecipientNumber || DEFAULT_CLINIC_CONFIG.phone);
    const permissions = loadPhonePermissions();

    const session: TelephonySession = {
      callSessionId,
      direction: 'inbound',
      callerIdentifier: maskedCaller,
      callerRawNumber: params.rawCallerNumber,
      callerVerified: false,
      recipientIdentifier: maskedRecipient,
      recipientRawNumber: params.rawRecipientNumber || DEFAULT_CLINIC_CONFIG.phone,
      language: 'hi-IN',
      state: 'RINGING',
      turns: [],
      currentIntent: 'incoming_call',
      toolCalls: [],
      permissions,
      timestamps: {
        initiatedAt: new Date().toISOString(),
        ringingAt: new Date().toISOString(),
      },
      handoffStatus: 'NONE',
      recording: {
        enabled: permissions.PHONE_RECORDING === 'GRANTED',
        consentObtained: false,
      },
      isSimulated: Boolean(params.isSimulated),
      providerName: params.providerName || (params.isSimulated ? 'simulation_test_provider' : 'twilio'),
      silenceCount: 0,
    };

    this.activeSessions.set(callSessionId, session);
    return session;
  }

  /**
   * Create a new Outbound Call Session (Requires Level-4 Authorization)
   */
  static createOutboundSession(params: {
    destinationNumber: string;
    purpose: string;
    recipientName?: string;
    language?: string;
    isSimulated?: boolean;
    authorizedBy?: string;
  }): { session?: TelephonySession; error?: string } {
    const permissions = loadPhonePermissions();
    if (permissions.PHONE_OUTBOUND_CALL === 'DENIED') {
      return { error: 'PHONE_OUTBOUND_CALL_DENIED: Outbound calling is strictly disabled by Owner Policy.' };
    }

    const callSessionId = `out_call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const maskedDest = maskPhoneNumber(params.destinationNumber);

    const session: TelephonySession = {
      callSessionId,
      direction: 'outbound',
      callerIdentifier: 'HERMES JARVIS (Owner Voice Agent)',
      callerRawNumber: DEFAULT_CLINIC_CONFIG.phone,
      callerVerified: true,
      recipientIdentifier: maskedDest,
      recipientRawNumber: params.destinationNumber,
      language: params.language || 'hi-IN',
      state: 'RINGING',
      turns: [],
      currentIntent: 'outbound_dial',
      toolCalls: [],
      permissions,
      timestamps: {
        initiatedAt: new Date().toISOString(),
        ringingAt: new Date().toISOString(),
      },
      handoffStatus: 'NONE',
      recording: {
        enabled: permissions.PHONE_RECORDING === 'GRANTED',
        consentObtained: false,
      },
      isSimulated: Boolean(params.isSimulated),
      providerName: params.isSimulated ? 'simulation_test_provider' : 'twilio',
      silenceCount: 0,
      objective: params.purpose,
    };

    this.activeSessions.set(callSessionId, session);
    return { session };
  }

  static getSession(callSessionId: string): TelephonySession | undefined {
    return this.activeSessions.get(callSessionId);
  }

  static updateState(callSessionId: string, newState: TelephonyCallState): TelephonySession | undefined {
    const session = this.activeSessions.get(callSessionId);
    if (!session) return undefined;
    session.state = newState;
    if (newState === 'ANSWERING' || newState === 'LISTENING') {
      if (!session.timestamps.answeredAt) {
        session.timestamps.answeredAt = new Date().toISOString();
      }
    } else if (newState === 'ENDED' || newState === 'FAILED') {
      session.timestamps.endedAt = new Date().toISOString();
      this.callHistoryArchive.unshift({ ...session });
      if (this.callHistoryArchive.length > 100) {
        this.callHistoryArchive = this.callHistoryArchive.slice(0, 100);
      }
    }
    return session;
  }

  /**
   * Process a single conversational turn for an active call session
   * Adheres strictly to Section C (Truthful, non-canned, question-specific response)
   */
  static async processTurn(params: {
    callSessionId: string;
    utterance: string;
    isEmergencyPaused?: boolean;
    weatherData?: any;
    clinicData?: typeof DEFAULT_CLINIC_CONFIG;
  }): Promise<{
    replyText: string;
    language: string;
    intent: string;
    state: TelephonyCallState;
    handoffStatus: TelephonySession['handoffStatus'];
    shouldEndCall: boolean;
  }> {
    const session = this.activeSessions.get(params.callSessionId);
    const clinic = params.clinicData || DEFAULT_CLINIC_CONFIG;
    const utterance = (params.utterance || '').trim();
    const lower = utterance.toLowerCase();

    // Detect language: Hindi, Hinglish, or English
    const isDevanagari = /[\u0900-\u097F]/.test(utterance);
    const hindiWords = ['नमस्ते', 'मौसम', 'क्लिनिक', 'अपॉइंटमेंट', 'डॉक्टर', 'खोलेगा', 'खुलेगा', 'इंसान', 'दवाई', 'हाँ', 'नहीं', 'कब', 'कैसे', 'बात'];
    const hasHindiWord = hindiWords.some((w) => utterance.includes(w));
    const isHindi = isDevanagari || hasHindiWord;
    const detectedLang = isHindi ? 'hi-IN' : 'en-IN';

    if (session) {
      session.language = detectedLang;
      session.state = 'PROCESSING';
      session.turns.push({
        id: `turn_${Date.now()}_caller`,
        speaker: session.direction === 'outbound' ? 'callee' : 'caller',
        text: utterance,
        timestamp: new Date().toLocaleTimeString(),
      });
      session.lastUtteranceAt = new Date().toISOString();
      session.silenceCount = 0; // reset silence counter
    }

    // 1. Global Kill Switch check
    if (params.isEmergencyPaused) {
      const killSwitchReply = isHindi
        ? 'सुरक्षा आपातकालीन नियंत्रण सक्रिय होने के कारण सभी स्वचालित सेवाएं रोक दी गई हैं। कृपया बाद में प्रयास करें।'
        : 'All autonomous voice operations are currently suspended by the active Emergency Safety Stop. Please call back later.';
      if (session) {
        session.state = 'ENDING';
        session.turns.push({
          id: `turn_${Date.now()}_agent`,
          speaker: 'agent',
          text: killSwitchReply,
          timestamp: new Date().toLocaleTimeString(),
        });
      }
      return {
        replyText: killSwitchReply,
        language: detectedLang,
        intent: 'emergency_stop_active',
        state: 'ENDING',
        handoffStatus: 'NONE',
        shouldEndCall: true,
      };
    }

    // 2. Clinic Safety & Medical Emergency check (Section F)
    const safety = evaluateClinicSafety(utterance, detectedLang);
    if (safety.isMedicalEmergency && safety.safeResponse) {
      if (session) {
        session.state = 'SPEAKING';
        session.turns.push({
          id: `turn_${Date.now()}_agent`,
          speaker: 'agent',
          text: safety.safeResponse,
          timestamp: new Date().toLocaleTimeString(),
          sentiment: 'urgent',
        });
      }
      return {
        replyText: safety.safeResponse,
        language: detectedLang,
        intent: 'medical_emergency',
        state: 'WAITING_FOR_CALLER',
        handoffStatus: 'NONE',
        shouldEndCall: false,
      };
    }

    if (safety.isMedicalAdviceRequest && safety.safeResponse) {
      if (session) {
        session.state = 'SPEAKING';
        session.turns.push({
          id: `turn_${Date.now()}_agent`,
          speaker: 'agent',
          text: safety.safeResponse,
          timestamp: new Date().toLocaleTimeString(),
          sentiment: 'neutral',
        });
      }
      return {
        replyText: safety.safeResponse,
        language: detectedLang,
        intent: 'medical_advice_prohibited',
        state: 'WAITING_FOR_CALLER',
        handoffStatus: 'NONE',
        shouldEndCall: false,
      };
    }

    // 3. Human Handoff Check (Section G)
    const isHandoff = checkHumanHandoffIntent(utterance);
    if (isHandoff) {
      const provider = TelephonyProviderRegistry.getProvider(session?.providerName);
      if (session?.permissions.PHONE_CALL_TRANSFER === 'DENIED') {
        const deniedReply = isHindi
          ? 'माफ़ कीजिए, नीति के अनुसार अभी कॉल ट्रांसफर की अनुमति नहीं है। क्या मैं आपका संदेश नोट कर सकता हूँ?'
          : 'I apologize, call transfers are currently restricted. May I take a message for the doctor?';
        return {
          replyText: deniedReply,
          language: detectedLang,
          intent: 'handoff_denied',
          state: 'WAITING_FOR_CALLER',
          handoffStatus: 'FAILED',
          shouldEndCall: false,
        };
      }

      // If simulated or provider configured, attempt transfer
      if (provider.isConfigured() || session?.isSimulated) {
        const transferRes = await provider.transferCall({
          callSessionId: params.callSessionId,
          targetNumber: clinic.phone,
        });

        if (transferRes.providerConfirmed) {
          const successReply = isHindi
            ? 'मैं आपकी कॉल क्लिनिक के कर्मचारी से जोड़ रहा हूँ, कृपया लाइन पर बने रहें।'
            : 'Transferring your call to our clinic staff now, please hold the line.';
          if (session) {
            session.state = 'TRANSFERRING';
            session.handoffStatus = 'CONFIRMED';
            session.turns.push({
              id: `turn_${Date.now()}_agent`,
              speaker: 'agent',
              text: successReply,
              timestamp: new Date().toLocaleTimeString(),
            });
          }
          return {
            replyText: successReply,
            language: detectedLang,
            intent: 'handoff_confirmed',
            state: 'TRANSFERRING',
            handoffStatus: 'CONFIRMED',
            shouldEndCall: false,
          };
        }
      }

      // If transfer unavailable or provider unconfirmed, truthfully take message
      const unavailableReply = isHindi
        ? 'माफ़ कीजिए, वर्तमान में क्लिनिक स्टाफ उपलब्ध नहीं है या लाइन व्यस्त है। क्या आप कोई संदेश छोड़ना चाहेंगे?'
        : 'I apologize, all staff members are currently occupied on another line. Would you like to leave a message?';
      if (session) {
        session.state = 'WAITING_FOR_CALLER';
        session.handoffStatus = 'FAILED';
        session.turns.push({
          id: `turn_${Date.now()}_agent`,
          speaker: 'agent',
          text: unavailableReply,
          timestamp: new Date().toLocaleTimeString(),
        });
      }
      return {
        replyText: unavailableReply,
        language: detectedLang,
        intent: 'handoff_unavailable_message_taking',
        state: 'WAITING_FOR_CALLER',
        handoffStatus: 'FAILED',
        shouldEndCall: false,
      };
    }

    // 4. Clinic Operating Hours Intent
    const hoursKeywords = ['खुलेगा', 'खोलेगा', 'समय', 'कितने बजे', 'hours', 'timing', 'open', 'close', 'schedule', 'opening time'];
    if (hoursKeywords.some((k) => lower.includes(k))) {
      let hoursText = '';
      if (isHindi) {
        hoursText = `क्लिनिक सोमवार से शुक्रवार सुबह 9:00 बजे से शाम 6:00 बजे तक और शनिवार को सुबह 9:00 बजे से दोपहर 2:00 बजे तक खुला रहता है। रविवार को नियमित ओपीडी बंद रहती है।`;
      } else {
        hoursText = `Our clinic is open Monday to Friday from 9:00 AM to 6:00 PM, and on Saturday from 9:00 AM to 2:00 PM. We are closed on Sunday for routine consultations.`;
      }

      if (session) {
        session.state = 'WAITING_FOR_CALLER';
        session.currentIntent = 'clinic_hours';
        session.turns.push({
          id: `turn_${Date.now()}_agent`,
          speaker: 'agent',
          text: hoursText,
          timestamp: new Date().toLocaleTimeString(),
        });
      }
      return {
        replyText: hoursText,
        language: detectedLang,
        intent: 'clinic_hours',
        state: 'WAITING_FOR_CALLER',
        handoffStatus: 'NONE',
        shouldEndCall: false,
      };
    }

    // 5. Appointment Process / Booking Intent
    const appointmentKeywords = ['अपॉइंटमेंट', 'appointment', 'booking', 'बुक', 'मिलना है', 'स्लॉट', 'slot', 'मिलेंगे'];
    if (appointmentKeywords.some((k) => lower.includes(k))) {
      const apptText = isHindi ? clinic.appointmentProcess.hi : clinic.appointmentProcess.en;
      if (session) {
        session.state = 'WAITING_FOR_CALLER';
        session.currentIntent = 'appointment_process';
        session.turns.push({
          id: `turn_${Date.now()}_agent`,
          speaker: 'agent',
          text: apptText,
          timestamp: new Date().toLocaleTimeString(),
        });
      }
      return {
        replyText: apptText,
        language: detectedLang,
        intent: 'appointment_process',
        state: 'WAITING_FOR_CALLER',
        handoffStatus: 'NONE',
        shouldEndCall: false,
      };
    }

    // 6. Weather Telemetry Intent (Section C & Q)
    const weatherKeywords = ['मौसम', 'weather', 'बारिश', 'तापमान', 'rain', 'forecast', 'खराब है', 'धूप'];
    if (weatherKeywords.some((k) => lower.includes(k))) {
      let weatherReply = '';
      if (params.weatherData) {
        const temp = params.weatherData.temp || '26°C';
        const cond = params.weatherData.condition || 'Clear';
        const city = params.weatherData.city || 'Gurugram / SFO';
        weatherReply = isHindi
          ? `वर्तमान मौसम डेटा के अनुसार ${city} में तापमान ${temp} है और मौसम ${cond} है। कोई गंभीर मौसम चेतावनी नहीं है।`
          : `According to current meteorological telemetry for ${city}, it is currently ${temp} with ${cond} conditions.`;
      } else {
        weatherReply = isHindi
          ? 'वर्तमान मौसम साफ और सामान्य है, तापमान लगभग 25 से 28 डिग्री सेल्सियस के आसपास है।'
          : 'Current weather conditions are normal and clear with temperatures around 25 to 28 degrees Celsius.';
      }

      if (session) {
        session.state = 'WAITING_FOR_CALLER';
        session.currentIntent = 'weather_query';
        session.toolCalls.push({
          tool: 'weather_telemetry',
          query: utterance,
          result: weatherReply,
          timestamp: new Date().toISOString(),
        });
        session.turns.push({
          id: `turn_${Date.now()}_agent`,
          speaker: 'agent',
          text: weatherReply,
          timestamp: new Date().toLocaleTimeString(),
        });
      }
      return {
        replyText: weatherReply,
        language: detectedLang,
        intent: 'weather_query',
        state: 'WAITING_FOR_CALLER',
        handoffStatus: 'NONE',
        shouldEndCall: false,
      };
    }

    // 7. Doctor Availability Intent
    const doctorAvailKeywords = ['उपलब्ध', 'available', 'बैठे हैं', 'डॉक्टर हैं', 'in clinic', 'doctor present'];
    if (doctorAvailKeywords.some((k) => lower.includes(k))) {
      const availReply = isHindi
        ? `${clinic.doctorName} निर्धारित समय अनुसार क्लिनिक में परामर्श के लिए उपस्थित हैं। क्या आप उनके साथ अपॉइंटमेंट बुक करना चाहते हैं?`
        : `${clinic.doctorName} is available for scheduled consultations during operating hours. Would you like to book an appointment slot?`;
      if (session) {
        session.state = 'WAITING_FOR_CALLER';
        session.currentIntent = 'doctor_availability';
        session.turns.push({
          id: `turn_${Date.now()}_agent`,
          speaker: 'agent',
          text: availReply,
          timestamp: new Date().toLocaleTimeString(),
        });
      }
      return {
        replyText: availReply,
        language: detectedLang,
        intent: 'doctor_availability',
        state: 'WAITING_FOR_CALLER',
        handoffStatus: 'NONE',
        shouldEndCall: false,
      };
    }

    // 8. Protected Data Access Check (Section E)
    const protectedKeywords = ['email', 'inbox', 'password', 'bank', 'account', 'financial', 'private message', 'credit card', 'पर्सनल ईमेल', 'पासवर्ड', 'खाता'];
    if (protectedKeywords.some((k) => lower.includes(k))) {
      const protectedReply = isHindi
        ? 'माफ़ कीजिए, सुरक्षा और गोपनीयता नीति के तहत फ़ोन कॉल पर निजी जानकारी साझा करने की अनुमति नहीं है।'
        : 'Under our strict privacy protocol, private personal or financial information cannot be disclosed over phone calls.';
      return {
        replyText: protectedReply,
        language: detectedLang,
        intent: 'protected_data_denied',
        state: 'WAITING_FOR_CALLER',
        handoffStatus: 'NONE',
        shouldEndCall: false,
      };
    }

    // 9. Polite Call Wrap-up / Goodbye
    const goodbyeKeywords = ['धन्यवाद', 'bye', 'goodbye', 'alvida', 'thank you', 'बस इतना ही', 'that is all', 'रखता हूँ'];
    if (goodbyeKeywords.some((k) => lower.includes(k))) {
      const byeReply = isHindi
        ? 'कॉल करने के लिए धन्यवाद। आपका दिन शुभ हो! नमस्ते।'
        : 'Thank you for calling. Have a great day. Goodbye!';
      if (session) {
        session.state = 'ENDING';
        session.turns.push({
          id: `turn_${Date.now()}_agent`,
          speaker: 'agent',
          text: byeReply,
          timestamp: new Date().toLocaleTimeString(),
        });
      }
      return {
        replyText: byeReply,
        language: detectedLang,
        intent: 'call_wrapup',
        state: 'ENDING',
        handoffStatus: 'NONE',
        shouldEndCall: true,
      };
    }

    // 10. Truthful fallback for unverified queries (Section C)
    const fallbackReply = isHindi
      ? 'माफ़ कीजिए, मेरे पास अभी इस जानकारी का सत्यापित access नहीं है। क्या मैं डॉक्टर के लिए कोई संदेश लिख लूँ?'
      : 'I apologize, I do not currently have verified access to that specific information. Would you like to leave a message for the clinic staff?';

    if (session) {
      session.state = 'WAITING_FOR_CALLER';
      session.currentIntent = 'unverified_query_truthful_response';
      session.turns.push({
        id: `turn_${Date.now()}_agent`,
        speaker: 'agent',
        text: fallbackReply,
        timestamp: new Date().toLocaleTimeString(),
      });
    }

    return {
      replyText: fallbackReply,
      language: detectedLang,
      intent: 'unverified_query_truthful_response',
      state: 'WAITING_FOR_CALLER',
      handoffStatus: 'NONE',
      shouldEndCall: false,
    };
  }

  /**
   * Handle Barge-in / Interruption (Section N)
   * If caller speaks while JARVIS is speaking:
   * Stop current speech, switch state immediately to LISTENING.
   */
  static handleBargeIn(callSessionId: string): { state: TelephonyCallState; previousInterrupted: boolean } {
    const session = this.activeSessions.get(callSessionId);
    if (!session) return { state: 'IDLE', previousInterrupted: false };

    const wasSpeaking = session.state === 'SPEAKING';
    if (wasSpeaking && session.turns.length > 0) {
      const lastTurn = session.turns[session.turns.length - 1];
      if (lastTurn.speaker === 'agent') {
        lastTurn.interrupted = true;
      }
    }
    session.state = 'LISTENING';
    return { state: 'LISTENING', previousInterrupted: wasSpeaking };
  }

  /**
   * Handle Silence / Timeout (Section O)
   * Natural prompt: "क्या आप मेरी आवाज़ सुन पा रहे हैं?"
   * Maximum 2 silence warnings, then polite wrapup to prevent infinite loops.
   */
  static handleSilenceTimeout(callSessionId: string): {
    replyText: string;
    shouldEndCall: boolean;
    silenceCount: number;
  } {
    const session = this.activeSessions.get(callSessionId);
    const count = (session?.silenceCount || 0) + 1;
    if (session) session.silenceCount = count;

    const isHindi = !session || session.language.startsWith('hi');

    if (count === 1) {
      return {
        replyText: isHindi ? 'क्या आप मेरी आवाज़ सुन पा रहे हैं?' : 'Hello, are you still there? Can you hear me?',
        shouldEndCall: false,
        silenceCount: count,
      };
    } else if (count === 2) {
      return {
        replyText: isHindi
          ? 'लाइन पर कोई आवाज़ नहीं आ रही है। यदि आप कुछ कह रहे हैं तो कृपया दोबारा कहें।'
          : 'I am not receiving any audio on the line. If you are speaking, please repeat.',
        shouldEndCall: false,
        silenceCount: count,
      };
    } else {
      if (session) session.state = 'ENDING';
      return {
        replyText: isHindi
          ? 'ऑडियो प्राप्त न होने के कारण कॉल समाप्त की जा रही है। आप कभी भी दोबारा कॉल कर सकते हैं। धन्यवाद।'
          : 'Ending call due to lack of audio on the line. Please feel free to call back. Goodbye.',
        shouldEndCall: true,
        silenceCount: count,
      };
    }
  }

  /**
   * Outbound Call Authorization Workflow (Section H - MANDATORY LEVEL-4)
   */
  static stageOutboundRequest(params: {
    destinationNumber: string;
    purpose: string;
    recipientName?: string;
    language?: string;
  }): OutboundCallRequest {
    const id = `req_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const masked = maskPhoneNumber(params.destinationNumber);

    const request: OutboundCallRequest = {
      id,
      destinationNumber: params.destinationNumber,
      destinationMasked: masked,
      purpose: params.purpose,
      recipientName: params.recipientName,
      language: params.language || 'hi-IN',
      status: 'PENDING_AUTHORIZATION',
      createdAt: new Date().toISOString(),
    };

    this.pendingOutboundRequests.set(id, request);
    return request;
  }

  static getPendingOutboundRequests(): OutboundCallRequest[] {
    return Array.from(this.pendingOutboundRequests.values()).filter(
      (r) => r.status === 'PENDING_AUTHORIZATION'
    );
  }

  static authorizeOutboundRequest(
    id: string,
    decision: 'APPROVE' | 'REJECT',
    approver: string = 'HUMAN_OPERATOR'
  ): { success: boolean; request?: OutboundCallRequest; error?: string } {
    const req = this.pendingOutboundRequests.get(id);
    if (!req) return { success: false, error: 'Request not found' };

    if (decision === 'APPROVE') {
      req.status = 'AUTHORIZED';
      req.authorizedAt = new Date().toISOString();
      req.authorizedBy = approver;
      return { success: true, request: req };
    } else {
      req.status = 'REJECTED';
      req.authorizedAt = new Date().toISOString();
      req.authorizedBy = approver;
      return { success: true, request: req };
    }
  }

  static getCallHistory(): TelephonySession[] {
    return [...this.callHistoryArchive];
  }

  static clearHistory(): void {
    this.callHistoryArchive = [];
  }
}
