/**
 * 🔔 AlarmService.ts
 * Handles alarm sound playback and device vibration for alertness challenges.
 *
 * Uses expo-audio (Expo SDK 55) for audio and expo-haptics for vibration.
 * Falls back gracefully when native modules are unavailable.
 */

import { createAudioPlayer } from "expo-audio";
import * as Haptics from "expo-haptics";

class AlarmService {
  private player: any = null;
  private vibrationInterval: ReturnType<typeof setInterval> | null = null;
  private isPlaying = false;

  /** Start loud alarm + continuous vibration */
  async startAlarm(): Promise<void> {
    if (this.isPlaying) return;
    this.isPlaying = true;

    // Vibration loop (every 800 ms)
    this.startVibration();

    // Audio alarm using expo-audio (SDK 55 standard)
    try {
      if (!this.player) {
        this.player = createAudioPlayer(require("../assets/sounds/alert.mp3"));
        if (this.player) {
          this.player.loop = true;
        }
      }
      if (this.player && typeof this.player.play === "function") {
        this.player.play();
      }
    } catch (err) {
      // If audio fails we still vibrate — degrade gracefully
      console.warn("⚠️ AlarmService: audio failed, vibrating only:", (err as Error).message);
    }
  }

  /** Stop alarm sound and vibration */
  async stopAlarm(): Promise<void> {
    this.isPlaying = false;
    this.stopVibration();

    try {
      if (this.player) {
        if (typeof this.player.pause === "function") {
          this.player.pause();
        }
        if (typeof this.player.release === "function") {
          this.player.release();
        } else if (typeof this.player.remove === "function") {
          this.player.remove();
        }
        this.player = null;
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
