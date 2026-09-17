import type { LocationId } from '../types/game';

type ArrivalListener = (location: LocationId) => void;
const listeners = new Set<ArrivalListener>();

export const gameEvents = {
  onArrival(listener: ArrivalListener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  arrived(location: LocationId) { listeners.forEach((listener) => listener(location)); }
};
