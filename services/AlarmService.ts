/**
 * 🔔 AlarmService.ts
 * Handles alarm sound playback and device vibration for alertness challenges.
 *
 * Uses expo-av for audio and expo-haptics for vibration.
 * Falls back gracefully when native modules are unavailable.
 */

import { Audio } from "expo-av";
import * as Haptics from "expo-haptics";

class AlarmService {
  private sound: Audio.Sound | null = null;
  private vibrationInterval: ReturnType<typeof setInterval> | null = null;
  private isPlaying = false;

  /** Start loud alarm + continuous vibration */
  async startAlarm(): Promise<void> {
    if (this.isPlaying) return;
    this.isPlaying = true;

    // Vibration loop (every 800 ms)
    this.startVibration();

    // Audio alarm
    try {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: false,
      });

      const { sound } = await Audio.Sound.createAsync(
        require("../assets/sounds/alert.mp3"),
        {
          shouldPlay: true,
          isLooping: true,
          volume: 1.0,
        }
      );
      this.sound = sound;
    } catch (err) {
      // If no alarm.mp3 is present we still vibrate — degrade gracefully
      console.warn("⚠️ AlarmService: audio failed, vibrating only:", (err as Error).message);
    }
  }

  /** Stop alarm sound and vibration */
  async stopAlarm(): Promise<void> {
    this.isPlaying = false;
    this.stopVibration();

    try {
      if (this.sound) {
        await this.sound.stopAsync();
        await this.sound.unloadAsync();
        this.sound = null;
      }
    } catch (err) {
      console.warn("⚠️ AlarmService: stop audio error:", (err as Error).message);
    }
  }

  startVibration(): void {
    this.stopVibration(); // ensure no duplicate
    this.vibrationInterval = setInterval(async () => {
      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      } catch (_) {}
    }, 800);
  }

  stopVibration(): void {
    if (this.vibrationInterval !== null) {
      clearInterval(this.vibrationInterval);
      this.vibrationInterval = null;
    }
  }

  get playing(): boolean {
    return this.isPlaying;
  }
}

export const alarmService = new AlarmService();
