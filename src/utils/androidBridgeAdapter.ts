import {
  AndroidDeviceCapabilities,
  AndroidCallEventPayload,
  AndroidNotificationPayload,
  AndroidPendingEvent,
  AndroidBridgeStatus,
} from '../types/mobileBridge';
import { androidBridgeEngine } from './androidBridgeEngine';

export interface AndroidBridgeAdapter {
  readonly isSimulation: boolean;
  connect(authToken?: string): Promise<{ success: boolean; status: AndroidBridgeStatus; message: string }>;
  disconnect(): Promise<void>;
  getStatus(): AndroidBridgeStatus;
  getCapabilities(): AndroidDeviceCapabilities | null;
  answerCall(callId: string): Promise<{ success: boolean; status: string; message: string }>;
  sendReply(notificationId: string, replyText: string): Promise<{ success: boolean; status: string; message: string }>;
  openApp(packageName: string): Promise<{ success: boolean; message: string }>;
}

/**
 * Real Android Bridge Adapter
 * Communicates with the local Android Bridge Daemon over authenticated HTTP/WebSocket channel
 */
export class RealAndroidBridgeAdapter implements AndroidBridgeAdapter {
  public readonly isSimulation = false;
  private endpoint = '/api/mobile/bridge';
  private authToken: string | null = null;

  constructor(authToken?: string) {
    if (authToken) {
      this.authToken = authToken;
    }
  }

  public async connect(authToken?: string): Promise<{ success: boolean; status: AndroidBridgeStatus; message: string }> {
    if (authToken) this.authToken = authToken;

    try {
      const res = await fetch(`${this.endpoint}/connect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.authToken ? { 'X-JARVIS-AUTH-TOKEN': this.authToken } : {}),
        },
      });

      if (!res.ok) {
        return {
          success: false,
          status: 'ERROR',
          message: `Bridge returned status ${res.status}`,
        };
      }

      const data = await res.json();
      if (data.capabilities) {
        androidBridgeEngine.connectDevice({
          ...data.capabilities,
          isSimulation: false,
        });
      }

      return {
        success: true,
        status: androidBridgeEngine.getStatus(),
        message: 'Real Android Bridge connected successfully.',
      };
    } catch (err: any) {
      return {
        success: false,
        status: 'MOBILE_NOT_CONNECTED',
        message: `Failed to reach Android bridge daemon: ${err?.message || 'Network error'}`,
      };
    }
  }

  public async disconnect(): Promise<void> {
    try {
      await fetch(`${this.endpoint}/disconnect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.authToken ? { 'X-JARVIS-AUTH-TOKEN': this.authToken } : {}),
        },
      });
    } catch {}
    androidBridgeEngine.disconnectDevice('User requested disconnect');
  }

  public getStatus(): AndroidBridgeStatus {
    return androidBridgeEngine.getStatus();
  }

  public getCapabilities(): AndroidDeviceCapabilities | null {
    return androidBridgeEngine.getCapabilities();
  }

  public async answerCall(callId: string): Promise<{ success: boolean; status: string; message: string }> {
    try {
      const res = await fetch(`${this.endpoint}/call/answer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.authToken ? { 'X-JARVIS-AUTH-TOKEN': this.authToken } : {}),
        },
        body: JSON.stringify({ callId }),
      });
      const data = await res.json();
      return {
        success: data.success || false,
        status: data.status || 'FAILED',
        message: data.message || 'Call answer executed',
      };
    } catch (err: any) {
      return {
        success: false,
        status: 'NETWORK_ERROR',
        message: `Failed to dispatch call answer to Android device: ${err.message}`,
      };
    }
  }

  public async sendReply(
    notificationId: string,
    replyText: string
  ): Promise<{ success: boolean; status: string; message: string }> {
    try {
      const res = await fetch(`${this.endpoint}/message/reply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.authToken ? { 'X-JARVIS-AUTH-TOKEN': this.authToken } : {}),
        },
        body: JSON.stringify({ notificationId, replyText }),
      });
      const data = await res.json();
      return {
        success: data.success || false,
        status: data.status || 'FAILED',
        message: data.message || 'Reply executed',
      };
    } catch (err: any) {
      return {
        success: false,
        status: 'NETWORK_ERROR',
        message: `Failed to dispatch reply: ${err.message}`,
      };
    }
  }

  public async openApp(packageName: string): Promise<{ success: boolean; message: string }> {
    try {
      const res = await fetch(`${this.endpoint}/app/open`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.authToken ? { 'X-JARVIS-AUTH-TOKEN': this.authToken } : {}),
        },
        body: JSON.stringify({ packageName }),
      });
      const data = await res.json();
      return { success: data.success || false, message: data.message || 'App opened' };
    } catch (err: any) {
      return { success: false, message: `Failed to open app: ${err.message}` };
    }
  }
}

/**
 * Simulated Android Bridge Adapter
 * For automated unit tests and sandbox preview ONLY
 */
export class SimulatedAndroidBridgeAdapter implements AndroidBridgeAdapter {
  public readonly isSimulation = true;

  private mockCapabilities: AndroidDeviceCapabilities = {
    deviceId: 'android_sim_pixel_8_pro',
    deviceName: 'Google Pixel 8 Pro (Sandbox Testbed)',
    model: 'Pixel 8 Pro',
    osVersion: 'Android 14 (API 34)',
    bridgeVersion: 'HERMES-ANDROID-BRIDGE/2.4.0-SIM',
    canDetectCalls: true,
    canAnswerCalls: true,
    telecomRoleDialer: true,
    answerCallsPermission: true,
    canReadNotifications: true,
    canInlineReply: true,
    canOpenApp: true,
    canLookupContacts: true,
    isSimulation: true,
  };

  public setMockCapabilities(overrides: Partial<AndroidDeviceCapabilities>): void {
    this.mockCapabilities = { ...this.mockCapabilities, ...overrides };
    if (androidBridgeEngine.getStatus() !== 'MOBILE_NOT_CONNECTED') {
      androidBridgeEngine.connectDevice(this.mockCapabilities);
    }
  }

  public async connect(): Promise<{ success: boolean; status: AndroidBridgeStatus; message: string }> {
    const res = androidBridgeEngine.connectDevice(this.mockCapabilities);
    return {
      success: true,
      status: res.status,
      message: '[SIMULATION_ONLY] Android Virtual Testbed Connected',
    };
  }

  public async disconnect(): Promise<void> {
    androidBridgeEngine.disconnectDevice('[SIMULATION_ONLY] Testbed reset');
  }

  public getStatus(): AndroidBridgeStatus {
    return androidBridgeEngine.getStatus();
  }

  public getCapabilities(): AndroidDeviceCapabilities | null {
    return this.mockCapabilities;
  }

  public async answerCall(callId: string): Promise<{ success: boolean; status: string; message: string }> {
    const res = androidBridgeEngine.executeCallAnswer();
    return {
      success: res.success,
      status: res.status,
      message: `[SIMULATION_ONLY] ${res.messageEn}`,
    };
  }

  public async sendReply(
    notificationId: string,
    replyText: string
  ): Promise<{ success: boolean; status: string; message: string }> {
    const res = androidBridgeEngine.executeMessageReply(replyText);
    return {
      success: res.success,
      status: res.status,
      message: `[SIMULATION_ONLY] ${res.messageEn}`,
    };
  }

  public async openApp(packageName: string): Promise<{ success: boolean; message: string }> {
    return {
      success: true,
      message: `[SIMULATION_ONLY] Launch intent triggered for ${packageName}`,
    };
  }

  // Simulation helpers for tests and developer preview
  public simulateIncomingCall(callerName: string | null, callerNumber: string): {
    announced: boolean;
    spokenText?: string;
    pendingEvent?: AndroidPendingEvent;
  } {
    return androidBridgeEngine.handleIncomingCall({
      callId: `sim_call_${Date.now()}`,
      callerName,
      callerNumber,
      timestamp: new Date().toISOString(),
      state: 'RINGING',
    });
  }

  public simulateIncomingNotification(payload: {
    appName: string;
    packageName: string;
    title: string;
    text: string;
    sender?: string;
    category?: any;
    hasInlineReply?: boolean;
  }): {
    announced: boolean;
    spokenText?: string;
    pendingEvent?: AndroidPendingEvent;
  } {
    return androidBridgeEngine.handleIncomingNotification({
      notificationId: `sim_notif_${Date.now()}`,
      appName: payload.appName,
      packageName: payload.packageName,
      title: payload.title,
      text: payload.text,
      sender: payload.sender || payload.title,
      category: payload.category || 'WHATSAPP',
      timestamp: new Date().toISOString(),
      hasInlineReply: payload.hasInlineReply ?? true,
    });
  }
}

export const simulatedAndroidAdapter = new SimulatedAndroidBridgeAdapter();
export const realAndroidAdapter = new RealAndroidBridgeAdapter();
