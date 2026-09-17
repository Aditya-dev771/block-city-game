import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { TownScene } from './scenes/TownScene';
import { gameEvents } from './events';
import { useGameStore } from '../stores/gameStore';

export function GameCanvas() {
  const host = useRef<HTMLDivElement>(null);
  const arriveAt = useGameStore((state) => state.arriveAt);
  const propertyLevel = useGameStore((state) => state.player?.property.level ?? 1);
  const businessTypes = useGameStore((state) => state.player?.businesses.map((business) => business.type).sort().join(',') ?? '');

  useEffect(() => gameEvents.onArrival((location) => void arriveAt(location)), [arriveAt]);
  useEffect(() => {
    if (!host.current) return;
    const game = new Phaser.Game({ type: Phaser.AUTO, parent: host.current, backgroundColor: '#90b879', callbacks: { preBoot: (instance) => { instance.registry.set('propertyLevel',propertyLevel); instance.registry.set('businessTypes',businessTypes); } }, scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' }, render: { antialias: true, pixelArt: false }, scene: [TownScene] });
    return () => game.destroy(true);
  }, [propertyLevel,businessTypes]);

  return <div ref={host} className="h-full w-full" aria-label="Interactive town map" />;
}
