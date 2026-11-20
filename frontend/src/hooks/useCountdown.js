import { useEffect, useState } from 'react';

export function useCountdown(targetIso, serverTimeIso) {
  const [offsetMs, setOffsetMs] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  useEffect(() => {
    if (!serverTimeIso) return;
    const serverMs = new Date(serverTimeIso).getTime();
    setOffsetMs(serverMs - Date.now());
  }, [serverTimeIso]);

  useEffect(() => {
    if (!targetIso) return undefined;
    const update = () => {
      const targetMs = new Date(targetIso).getTime();
      const nowServerMs = Date.now() + offsetMs;
      setRemainingSeconds(Math.max(0, Math.floor((targetMs - nowServerMs) / 1000)));
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [targetIso, offsetMs]);

  return remainingSeconds;
}
