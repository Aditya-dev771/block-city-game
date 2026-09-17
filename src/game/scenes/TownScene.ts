import Phaser from 'phaser';
import { gameEvents } from '../events';
import type { LocationId } from '../../types/game';

interface TownSpot { id: LocationId; label: string; x: number; y: number; color: number; icon: string; locked?: boolean }

const SPOTS: TownSpot[] = [
  { id: 'forest', label: 'Whisperwood', x: 110, y: 125, color: 0x386641, icon: '♣' },
  { id: 'mine', label: 'Old Mine', x: 690, y: 125, color: 0x5d5b63, icon: '◆' },
  { id: 'farm', label: 'Sunfield Farm', x: 112, y: 410, color: 0xd4a373, icon: '♒' },
  { id: 'town-hall', label: 'Town Hall', x: 395, y: 150, color: 0xc87941, icon: '★' },
  { id: 'market', label: 'Market', x: 618, y: 355, color: 0xe0a72e, icon: '₵' },
  { id: 'workshop', label: 'Workshop', x: 390, y: 430, color: 0x8b5e3c, icon: '⚒' },
  { id: 'home', label: 'Your Home', x: 220, y: 300, color: 0xb85c45, icon: '⌂' },
  { id: 'industrial', label: 'Industrial District', x: 690, y: 470, color: 0x474747, icon: '▥', locked: true }
];

export class TownScene extends Phaser.Scene {
  private resident?: Phaser.GameObjects.Container;
  private target?: Phaser.Math.Vector2;
  private destination?: LocationId;

  constructor() { super('town'); }

  create() {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#90b879');
    this.drawWorld(width, height);
    SPOTS.forEach((spot) => this.createSpot(spot, width, height));
    this.createResident(width * 0.5, height * 0.52);
    this.scale.on('resize', () => this.scene.restart());
  }

  private drawWorld(width: number, height: number) {
    const g = this.add.graphics();
    g.fillStyle(0x9fc47f).fillRect(0, 0, width, height);
    g.fillStyle(0x6f9b62, 0.45);
    for (let i = 0; i < 18; i += 1) g.fillCircle((i * 97) % width, (i * 61) % height, 16 + (i % 4) * 5);
    g.lineStyle(Math.max(28, width * 0.045), 0xdbc898, 1);
    g.beginPath().moveTo(width * 0.5, height * 0.5).lineTo(width * 0.13, height * 0.22);
    g.moveTo(width * 0.5, height * 0.5).lineTo(width * 0.86, height * 0.22);
    g.moveTo(width * 0.5, height * 0.5).lineTo(width * 0.15, height * 0.78);
    g.moveTo(width * 0.5, height * 0.5).lineTo(width * 0.78, height * 0.7);
    g.strokePath();
    g.fillStyle(0x6c9bb5, 0.7).fillEllipse(width * 0.52, height * 0.93, width * 0.8, height * 0.18);
    this.add.text(18, 18, 'FOUNDING ERA', { fontFamily: 'Georgia', fontSize: `${Math.max(15, width * 0.018)}px`, color: '#f8f2df', backgroundColor: '#17261dcc', padding: { x: 10, y: 6 } }).setDepth(5);
  }

  private createSpot(spot: TownSpot, baseWidth: number, baseHeight: number) {
    const x = (spot.x / 800) * baseWidth;
    const y = (spot.y / 560) * baseHeight;
    const propertyLevel = spot.id === 'home' ? Number(this.registry.get('propertyLevel') ?? 1) : 1;
    const size = Phaser.Math.Clamp(baseWidth * 0.07, 34, 65) * (spot.id === 'home' ? 1 + (propertyLevel - 1) * 0.12 : 1);
    const buildingColor = spot.id === 'home' && propertyLevel === 2 ? 0xc87941 : spot.id === 'home' && propertyLevel === 3 ? 0x376a8b : spot.color;
    const spotLabel = spot.id === 'home' ? ['','Starter Home','House','Workshop Home'][propertyLevel] ?? 'Your Home' : spot.label;
    const group = this.add.container(x, y).setDepth(2);
    const shadow = this.add.ellipse(0, size * 0.56, size * 1.5, size * 0.38, 0x17261d, 0.25);
    const building = this.add.rectangle(0, 0, size * 1.35, size, buildingColor).setStrokeStyle(3, 0xf8f2df, 0.7);
    const roof = this.add.triangle(0, -size * 0.75, -size * 0.85, size * 0.35, size * 0.85, size * 0.35, 0, -size * 0.6, Phaser.Display.Color.ValueToColor(buildingColor).darken(18).color);
    const icon = this.add.text(0, -size * 0.08, spot.locked ? '🔒' : spot.icon, { fontSize: `${size * 0.48}px`, color: '#fff' }).setOrigin(0.5);
    const label = this.add.text(0, size * 0.85, spotLabel, { fontFamily: 'Arial', fontStyle: 'bold', fontSize: `${Phaser.Math.Clamp(baseWidth * 0.016, 10, 15)}px`, color: '#17261d', backgroundColor: '#f8f2dfee', padding: { x: 5, y: 3 }, align: 'center' }).setOrigin(0.5);
    group.add([shadow, building, roof, icon, label]);
    if(spot.id==='home'){
      const types=String(this.registry.get('businessTypes')??'').split(',').filter(Boolean).slice(0,2);
      types.forEach((type,index)=>{const marker=this.add.text((index===0?-1:1)*size*.72,size*.18,type==='restaurant'?'🍲':type==='workshop'?'🔧':'🛒',{fontSize:`${size*.32}px`,backgroundColor:'#17261ddd',padding:{x:4,y:3}}).setOrigin(.5);group.add(marker);});
    }
    if (!spot.locked) group.setSize(size * 1.8, size * 2).setInteractive({ useHandCursor: true }).on('pointerdown', () => this.walkTo(x, y + size * 0.8, spot.id));
  }

  private createResident(x: number, y: number) {
    const shadow = this.add.ellipse(0, 18, 28, 10, 0x17261d, 0.3);
    const body = this.add.rectangle(0, 2, 18, 26, 0x376a8b).setStrokeStyle(2, 0xf8f2df);
    const head = this.add.circle(0, -17, 10, 0xe0ad7a).setStrokeStyle(2, 0x5b3826);
    const hair = this.add.arc(0, -20, 10, 180, 360, false, 0x493126);
    this.resident = this.add.container(x, y, [shadow, body, head, hair]).setDepth(6);
    this.tweens.add({ targets: this.resident, y: y - 2, duration: 650, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
  }

  private walkTo(x: number, y: number, destination: LocationId) {
    this.target = new Phaser.Math.Vector2(x, y);
    this.destination = destination;
  }

  update(_: number, delta: number) {
    if (!this.resident || !this.target) return;
    const distance = Phaser.Math.Distance.Between(this.resident.x, this.resident.y, this.target.x, this.target.y);
    if (distance < 5) {
      this.resident.setPosition(this.target.x, this.target.y);
      const arrived = this.destination;
      this.target = undefined;
      this.destination = undefined;
      if (arrived) gameEvents.arrived(arrived);
      return;
    }
    const angle = Phaser.Math.Angle.Between(this.resident.x, this.resident.y, this.target.x, this.target.y);
    const speed = Math.min(180, Math.max(105, this.scale.width * 0.16));
    this.resident.x += Math.cos(angle) * speed * (delta / 1000);
    this.resident.y += Math.sin(angle) * speed * (delta / 1000);
    this.resident.rotation = Math.sin(this.time.now / 80) * 0.035;
  }
}
