import {
  AndroidDeviceCapabilities,
  AndroidCallEventPayload,
  AndroidNotificationPayload,
  AndroidPendingEvent,
  AndroidBridgeStatus,
  MobilePermissionMatrix,
} from '../types/mobileBridge';
import { androidBridgeEngine } from './androidBridgeEngine';

export interface AndroidBridgeAdapter {
  readonly isSimulation: boolean;
  connect(authToken?: string): Promise<{ success: boolean; status: AndroidBridgeStatus; message: string }>;
  disconnect(): Promise<void>;
  getStatus(): AndroidBridgeStatus;
  getCapabilities(): AndroidDeviceCapabilities | null;
  answerCall(callId: string, approved?: boolean): Promise<{ success: boolean; status: string; message: string }>;
  sendReply(
    notificationId: string,
    replyText: string,
    approved?: boolean
  ): Promise<{ success: boolean; status: string; message: string }>;
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
  private reportedCapabilities: AndroidDeviceCapabilities | null = null;
  private reportedPermissions: Partial<MobilePermissionMatrix> | null = null;

  constructor(authToken?: string) {
    if (authToken) {
      this.authToken = authToken;
    }
  }

  /**
   * Register the capabilities that the out-of-process Android bridge daemon
   * reports for this device. The server requires this payload at connect time,
   * so a real connection cannot be established without it.
   */
  public setReportedCapabilities(caps: AndroidDeviceCapabilities): void {
    this.reportedCapabilities = caps;
  }

  public setReportedPermissions(permissions: Partial<MobilePermissionMatrix>): void {
    this.reportedPermissions = permissions;
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
        body: JSON.stringify({
          device: this.reportedCapabilities ?? undefined,
          permissions: this.reportedPermissions ?? undefined,
        }),
      });

      if (!res.ok) {
        let detail = `Bridge returned status ${res.status}`;
        try {
          const errBody = await res.json();
          if (errBody?.error) detail = errBody.error;
        } catch {}
        return {
          success: false,
          status: 'ERROR',
          message: detail,
        };
      }

      const data = await res.json();
      const capabilities = data.device ?? data.capabilities;
      if (capabilities) {
        androidBridgeEngine.connectDevice(
          {
            ...capabilities,
            isSimulation: Boolean(capabilities.isSimulation),
          },
          this.reportedPermissions ?? undefined
        );
      }

      return {
        success: true,
        status: data.status || androidBridgeEngine.getStatus(),
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

  public async answerCall(
    callId: string,
    approved: boolean = false
  ): Promise<{ success: boolean; status: string; message: string }> {
    // Answering a live call is an outward, irreversible action. The server
    // already rejects an unapproved dispatch, so refuse locally and report the
    // authorization outcome truthfully instead of a generic FAILED round-trip.
    if (approved !== true) {
      return {
        success: false,
        status: 'AUTHORIZATION_REQUIRED',
        message:
          'Explicit human approval (approved: true) is required before answering a call on the device.',
      };
    }
    try {
      const res = await fetch(`${this.endpoint}/call/answer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.authToken ? { 'X-JARVIS-AUTH-TOKEN': this.authToken } : {}),
        },
        body: JSON.stringify({ callId, approved: true }),
      });
      const data = await res.json();
      return {
        success: data.success || false,
        // The gateway reports its verdict as `outcome`; keep that vocabulary so a
        // BLOCKED/NOT_CONFIGURED/DISPATCHED result is not flattened into FAILED.
        status: data.status || data.outcome || 'FAILED',
        message: data.message || data.error || 'Call answer executed',
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
    replyText: string,
    approved: boolean = false
  ): Promise<{ success: boolean; status: string; message: string }> {
    // Sending a reply is an outward action. Refuse locally when unapproved so the
    // caller gets a clear authorization verdict rather than a server round-trip.
    if (!approved) {
      return {
        success: false,
        status: 'AUTHORIZATION_REQUIRED',
        message: 'Explicit human approval (approved: true) is required to send a message reply.',
      };
    }
    try {
      const res = await fetch(`${this.endpoint}/message/reply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.authToken ? { 'X-JARVIS-AUTH-TOKEN': this.authToken } : {}),
        },
        body: JSON.stringify({ notificationId, replyText, approved }),
      });
      const data = await res.json();
      return {
        success: data.success || false,
        status: data.status || data.outcome || 'FAILED',
        message: data.message || data.error || 'Reply executed',
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
    replyText: string,
    approved: boolean = false
  ): Promise<{ success: boolean; status: string; message: string }> {
    if (!approved) {
      return {
        success: false,
        status: 'AUTHORIZATION_REQUIRED',
        message: 'Explicit human approval required to send message reply.',
      };
    }
    const res = androidBridgeEngine.executeMessageReply(replyText);
    return {
      success: res.success,
      status: res.status,
      message: `[SIMULATION_ONLY] ${res.messageEn}`,
    };
  }

  public async openApp(packageName: string): Promise<{ success: boolean; message: string }> {
    // Delegate to the engine so the simulation cannot report a success the
    // bridge gates would have refused.
    const res = androidBridgeEngine.openApplication(packageName);
    return {
      success: res.success,
      message: `[SIMULATION_ONLY] ${res.message}`,
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
