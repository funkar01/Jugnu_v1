export type SportType = 'cricket' | 'basketball' | 'football' | 'f1';

export interface SportTheme {
  id: SportType;
  name: string;
  stadiumName: string;
  primaryColor: string; // Hex or tailwind color class
  secondaryColor: string; // Hex or tailwind class
  accentColor: string;
  glowClass: string;
  badgeText: string;
}

export interface TelemetryMetrics {
  fps: number;
  cpuLoad: number;
  memoryAllocated: string;
  activeEntities: number;
  latencyMs: number;
}

export interface CompanionExpression {
  state: 'calm' | 'happy' | 'sad' | 'wink';
  color: string;
  glowColor: string;
  message: string;
}
