import { TrackingPoint } from '../types/gps';

/**
 * Calculates current, average, and maximum speeds from a history of tracking points.
 * All speeds returned in km/h.
 */
export const calculateSpeeds = (history: TrackingPoint[]) => {
  if (!history || history.length < 2) {
    const point = history?.[0];
    const speed = (point && point.speed != null && point.speed > 0) ? point.speed * 3.6 : 0; // m/s to km/h
    return {
      currentSpeed: speed,
      averageSpeed: speed,
      maxSpeed: speed,
    };
  }

  let maxSpeed = 0;
  let totalSpeed = 0;
  let speedCount = 0;

  for (const pt of history) {
    if (pt.speed != null && pt.speed > 0) {
      const speedKmH = pt.speed * 3.6;
      if (speedKmH > maxSpeed) maxSpeed = speedKmH;
      totalSpeed += speedKmH;
      speedCount++;
    }
  }

  const latestPoint = history[history.length - 1];
  const currentSpeed = (latestPoint.speed != null && latestPoint.speed > 0) ? latestPoint.speed * 3.6 : 0;
  const averageSpeed = speedCount > 0 ? totalSpeed / speedCount : 0;

  return {
    currentSpeed,
    averageSpeed,
    maxSpeed,
  };
};
