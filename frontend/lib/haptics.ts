export function vibrate(pattern: number | number[] = 10) {
  if (typeof navigator === 'undefined') return false;
  if (!('vibrate' in navigator)) return false;
  try {
    return navigator.vibrate(pattern);
  } catch {
    return false;
  }
}

export function hapticLight() {
  return vibrate(12);
}

export function hapticMedium() {
  return vibrate([8, 12, 8]);
}

export function hapticHeavy() {
  return vibrate([20, 30, 20]);
}

