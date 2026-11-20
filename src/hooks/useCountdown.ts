import { useEffect, useState } from 'react';

export function useCountdown(targetIso: string | undefined, serverTimeIso: string | undefined): number {
  const [offsetMs, setOffsetMs] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  useEffect(() => {
    if (!serverTimeIso) return;
    setOffsetMs(Date.parse(serverTimeIso) - Date.now());
  }, [serverTimeIso]);

  useEffect(() => {
    if (!targetIso) return;
    const tick = () => {
      const targetMs = Date.parse(targetIso);
      const serverNowMs = Date.now() + offsetMs;
      setRemainingSeconds(Math.max(0, Math.floor((targetMs - serverNowMs) / 1000)));
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [targetIso, offsetMs]);

  return remainingSeconds;
}
