import { describe, it, expect } from 'vitest';
import {
  compileMobileStatusData,
  generateMorningBriefing,
  DEFAULT_MOBILE_PERMISSIONS,
  MOBILE_PERMISSION_DEFINITIONS,
  getRealOrSimulatedBattery,
  getRealOrEstimatedWeather,
} from '../utils/mobileStatusEngine';
import { MobileStatusData } from '../types';

describe('Mobile Personal Status Engine & Hindi Morning Briefing Suite', () => {
  describe('1. Permission Schema & Definitions', () => {
    it('should have 6 categorized permissions configured', () => {
      expect(MOBILE_PERMISSION_DEFINITIONS.length).toBe(6);
      const categories = MOBILE_PERMISSION_DEFINITIONS.map((p) => p.category);
      expect(categories).toContain('BATTERY_STATUS');
      expect(categories).toContain('WEATHER_LOCATION');
      expect(categories).toContain('NOTIFICATIONS');
      expect(categories).toContain('CALENDAR_EVENTS');
      expect(categories).toContain('EMAIL_INBOX');
      expect(categories).toContain('DEVICE_HEALTH');
    });

    it('should enforce Level 4 Human Consent for private notification and email access', () => {
      const notifDef = MOBILE_PERMISSION_DEFINITIONS.find((p) => p.category === 'NOTIFICATIONS');
      const emailDef = MOBILE_PERMISSION_DEFINITIONS.find((p) => p.category === 'EMAIL_INBOX');
      const calDef = MOBILE_PERMISSION_DEFINITIONS.find((p) => p.category === 'CALENDAR_EVENTS');

      expect(notifDef?.securityLevel).toBe('LEVEL 4 HUMAN CONSENT');
      expect(emailDef?.securityLevel).toBe('LEVEL 4 HUMAN CONSENT');
      expect(calDef?.securityLevel).toBe('LEVEL 4 HUMAN CONSENT');
    });
  });

  describe('2. Battery & Telemetry Handlers', () => {
    it('should return valid battery telemetry data', async () => {
      const battery = await getRealOrSimulatedBattery();
      expect(battery.level).toBeGreaterThanOrEqual(0);
      expect(battery.level).toBeLessThanOrEqual(100);
      expect(typeof battery.charging).toBe('boolean');
      expect(typeof battery.temperatureC).toBe('number');
      expect(['Normal', 'Power Saving', 'Performance']).toContain(battery.powerMode);
    });

    it('should return valid meteorological telemetry', async () => {
      const weather = await getRealOrEstimatedWeather('New Delhi');
      expect(weather.location).toBeDefined();
      expect(typeof weather.temperatureC).toBe('number');
      expect(weather.condition).toBeDefined();
      expect(weather.conditionHi).toBeDefined();
    });
  });

  describe('3. Morning Briefing Compilation & Multilingual Generation', () => {
    it('should compile full mobile status data with default permissions', async () => {
      const statusData = await compileMobileStatusData();
      expect(statusData.battery).toBeDefined();
      expect(statusData.weather).toBeDefined();
      expect(statusData.notifications).toBeDefined();
      expect(statusData.calendar).toBeDefined();
      expect(statusData.email).toBeDefined();
      expect(statusData.deviceHealth).toBeDefined();
      expect(statusData.permissions).toBeDefined();
    });

    it('should generate fluent Hindi and English morning briefings', () => {
      const mockStatus: MobileStatusData = {
        lastUpdated: new Date().toISOString(),
        battery: {
          level: 85,
          charging: false,
          temperatureC: 30.2,
          powerMode: 'Normal',
          statusText: '85% (Nominal)',
          available: true,
        },
        weather: {
          location: 'New Delhi',
          temperatureC: 28,
          condition: 'Clear and Sunny',
          conditionHi: 'साफ और धूप खिली',
          humidity: 50,
          windKmh: 12,
          feelsLikeC: 29,
          available: true,
        },
        notifications: {
          totalCount: 1,
          criticalCount: 1,
          items: [
            {
              id: 'n1',
              app: 'WhatsApp',
              sender: 'Client Rohit',
              summary: 'Proposal approved',
              timestamp: '10m ago',
              priority: 'high',
            },
          ],
          available: true,
        },
        calendar: {
          todayEventsCount: 1,
          events: [
            {
              id: 'c1',
              title: 'Project Review',
              titleHi: 'प्रोजेक्ट रिव्यू',
              time: '11:00 AM',
              location: 'Online',
              priority: 'high',
              category: 'meeting',
            },
          ],
          available: true,
        },
        email: {
          unreadCount: 1,
          importantCount: 1,
          summaries: [
            {
              id: 'e1',
              from: 'Tech Corp',
              subject: 'Agreement Signed',
              snippet: 'All terms agreed',
              time: '08:00 AM',
              isImportant: true,
            },
          ],
          available: true,
        },
        deviceHealth: {
          ramUsageMb: 3800,
          ramTotalMb: 8000,
          storageFreeGb: 45,
          storageTotalGb: 128,
          deviceModel: 'Android 14 (Hermes Subsystem)',
          osVersion: 'Android 14',
          networkType: 'WiFi',
          available: true,
        },
        permissions: DEFAULT_MOBILE_PERMISSIONS,
      };

      const briefing = generateMorningBriefing(mockStatus, 'Vikram Sir');

      expect(briefing.greetingHi).toContain('सुप्रभात');
      expect(briefing.greetingHi).toContain('Vikram Sir');
      expect(briefing.greetingEn).toContain('Good Morning');
      expect(briefing.spokenTextHi).toContain('85 प्रतिशत');
      expect(briefing.spokenTextHi).toContain('New Delhi');
      expect(briefing.spokenTextEn).toContain('85%');
      expect(briefing.keyHighlights.length).toBeGreaterThanOrEqual(4);
    });

    it('should respect revoked permissions and omit restricted data from speech synthesis', () => {
      const restrictedPermissions = {
        ...DEFAULT_MOBILE_PERMISSIONS,
        NOTIFICATIONS: false,
        EMAIL_INBOX: false,
        CALENDAR_EVENTS: false,
      };

      const mockStatus: MobileStatusData = {
        lastUpdated: new Date().toISOString(),
        battery: {
          level: 70,
          charging: true,
          temperatureC: 32,
          powerMode: 'Normal',
          statusText: '70% Charging',
          available: true,
        },
        weather: {
          location: 'Bengaluru',
          temperatureC: 24,
          condition: 'Pleasant',
          conditionHi: 'सुहावना मौसम',
          humidity: 60,
          windKmh: 10,
          feelsLikeC: 24,
          available: true,
        },
        notifications: {
          totalCount: 0,
          criticalCount: 0,
          items: [],
          available: false,
        },
        calendar: {
          todayEventsCount: 0,
          events: [],
          available: false,
        },
        email: {
          unreadCount: 0,
          importantCount: 0,
          summaries: [],
          available: false,
        },
        deviceHealth: {
          ramUsageMb: 4000,
          ramTotalMb: 8000,
          storageFreeGb: 30,
          storageTotalGb: 128,
          deviceModel: 'Android 14',
          osVersion: 'Android 14',
          networkType: 'WiFi',
          available: true,
        },
        permissions: restrictedPermissions,
      };

      const briefing = generateMorningBriefing(mockStatus, 'Sir');
      expect(briefing.spokenTextHi).not.toContain('व्हाट्सएप');
      expect(briefing.spokenTextEn).not.toContain('calendar meetings');
    });
  });
});
