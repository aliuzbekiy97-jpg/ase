/**
 * scenes/World3D.ts — Three.js 3D Virtual Campus World
 * Clean 3D low-poly aesthetic with wooden shop house, purple tent, pine trees,
 * stone/dirt roads, and floating pill name tags.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { getSocket, emitMove, type PlayerData, type MovePayload } from '../lib/socket';
import { setProximityVolume, onParticipantSpeaking } from '../lib/livekit';

// ─── Constants ────────────────────────────────────────────────────────────────
const MOVE_SPEED     = 0.14;
const EMIT_INTERVAL  = 100;
const WORLD_BOUND    = 85;

const BOY_SHIRTS  = [0x3b82f6, 0x10b981, 0xf59e0b, 0xef4444, 0x14b8a6];
const GIRL_SHIRTS = [0xec4899, 0xa855f7, 0xf43f5e, 0x8b5cf6, 0xf97316];
const HAIRS       = [0x2b1a0e, 0x6b3f1d, 0xd9a441, 0x1a1a2e, 0x8b4513];
const SKINS       = [0xf5cba7, 0xe8b48a, 0xc68863, 0xffdbc0];

// ─── Remote player interface ──────────────────────────────────────────────────
interface RemoteChar {
  group:    THREE.Group;
  data:     PlayerData;
  cleanup?: () => void;
}

// ─── Pill Name Tag Generator ──────────────────────────────────────────────────
function makeLabel(text: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;

  ctx.font = 'bold 24px Inter, system-ui, sans-serif';
  const textMetrics = ctx.measureText(text);
  const textWidth = textMetrics.width;
  const pillWidth = Math.max(90, textWidth + 44);
  const pillHeight = 44;
  const x = (256 - pillWidth) / 2;
  const y = (64 - pillHeight) / 2;
  const radius = pillHeight / 2;

  // Dark rounded pill background
  ctx.beginPath();
  if ((ctx as any).roundRect) {
    (ctx as any).roundRect(x, y, pillWidth, pillHeight, radius);
  } else {
    ctx.arc(x + radius, y + radius, radius, Math.PI / 2, (3 * Math.PI) / 2);
    ctx.lineTo(x + pillWidth - radius, y);
    ctx.arc(x + pillWidth - radius, y + radius, radius, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(x + radius, y + pillHeight);
  }
  ctx.closePath();
  ctx.fillStyle = 'rgba(15, 15, 15, 0.85)';
  ctx.fill();

  // White text
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 24px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 32);

  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(3.2, 0.8, 1);
  return sprite;
}

// ─── Canvas Face Texture for Minecraft Head ────────────────────────────────────
function makeMinecraftHeadMaterials(hairHex: string, skinHex = '#f5cba7', isGirl = false): THREE.MeshStandardMaterial[] {
  function face(draw: (ctx: CanvasRenderingContext2D, s: number) => void) {
    const s = 64;
    const c = document.createElement('canvas');
    c.width = s; c.height = s;
    const ctx = c.getContext('2d')!;
    draw(ctx, s);
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 });
  }

  // Front face (Minecraft Steve/Alex style face)
  const front = face((ctx, s) => {
    ctx.fillStyle = skinHex;
    ctx.fillRect(0, 0, s, s);

    // Hair top fringe
    ctx.fillStyle = hairHex;
    ctx.fillRect(0, 0, s, 16);
    if (isGirl) {
      // Long side strands on front
      ctx.fillRect(0, 16, 12, 48);
      ctx.fillRect(s - 12, 16, 12, 48);
    } else {
      ctx.fillRect(0, 16, 8, 20);
      ctx.fillRect(s - 8, 16, 8, 20);
    }

    // Minecraft Eyes (Big blocky pixel eyes)
    const eyeY = 24;
    // Outer white
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(12, eyeY, 14, 10);
    ctx.fillRect(38, eyeY, 14, 10);

    // Iris (Blue for boy, Violet/Emerald for girl)
    ctx.fillStyle = isGirl ? '#8b2be2' : '#2563eb';
    ctx.fillRect(isGirl ? 18 : 12, eyeY, 8, 10);
    ctx.fillRect(isGirl ? 38 : 44, eyeY, 8, 10);

    // Pupil
    ctx.fillStyle = '#0f0f1a';
    ctx.fillRect(isGirl ? 20 : 14, eyeY + 2, 4, 6);
    ctx.fillRect(isGirl ? 40 : 44, eyeY + 2, 4, 6);

    // Eye shines
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(isGirl ? 19 : 13, eyeY + 1, 3, 3);
    ctx.fillRect(isGirl ? 39 : 43, eyeY + 1, 3, 3);

    // Eyebrows
    ctx.fillStyle = hairHex;
    ctx.fillRect(12, eyeY - 5, 14, 3);
    ctx.fillRect(38, eyeY - 5, 14, 3);

    // Nose
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(28, 38, 8, 5);

    // Mouth
    ctx.fillStyle = isGirl ? '#e05275' : '#8a4b38';
    ctx.fillRect(24, 47, 16, 4);

    if (isGirl) {
      // Cheeks blush
      ctx.fillStyle = 'rgba(255, 120, 160, 0.4)';
      ctx.fillRect(8, 38, 10, 6);
      ctx.fillRect(46, 38, 10, 6);
    }
  });

  const back = face((ctx, s) => {
    ctx.fillStyle = hairHex;
    ctx.fillRect(0, 0, s, s);
    if (!isGirl) {
      ctx.fillStyle = skinHex;
      ctx.fillRect(12, 44, 40, 20);
    }
  });

  const side = face((ctx, s) => {
    ctx.fillStyle = skinHex;
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = hairHex;
    ctx.fillRect(0, 0, s, 24);
    if (isGirl) {
      ctx.fillRect(0, 24, s, 40); // Full hair length for girls
    } else {
      ctx.fillRect(0, 24, 16, 24);
    }
  });

  const top = face((ctx, s) => {
    ctx.fillStyle = hairHex;
    ctx.fillRect(0, 0, s, s);
  });

  const bottom = face((ctx, s) => {
    ctx.fillStyle = skinHex;
    ctx.fillRect(0, 0, s, s);
  });

  // Yumuq ko'z varianti
  const frontClosed = face((ctx, s) => {
    ctx.fillStyle = skinHex;
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = hairHex;
    ctx.fillRect(0, 0, s, 16);
    if (isGirl) { ctx.fillRect(0, 16, 12, 48); ctx.fillRect(s - 12, 16, 12, 48); }
    else { ctx.fillRect(0, 16, 8, 20); ctx.fillRect(s - 8, 16, 8, 20); }
    // Yumuq ko'zlar — bitta chiziq
    ctx.fillStyle = '#3a2a1a';
    ctx.fillRect(12, 28, 14, 3);
    ctx.fillRect(38, 28, 14, 3);
    ctx.fillStyle = hairHex;
    ctx.fillRect(12, 19, 14, 3); ctx.fillRect(38, 19, 14, 3);
    ctx.fillStyle = isGirl ? '#e05275' : '#8a4b38';
    ctx.fillRect(24, 47, 16, 4);
  });

  const mats = [side, side, top, bottom, front, back];
  (mats as any).frontOpen = front;
  (mats as any).frontClosed = frontClosed;
  return mats;
}

// ─── Character Model (Minecraft Block Head + Boy/Girl variations) ──────────────
function makeCharacter(
  shirtColor = 0x2363d1,
  hairColor = 0xffd524,
  skinHex = 0xf5cba7,
  gender: 'boy' | 'girl' = 'boy'
): THREE.Group {
  const g = new THREE.Group();
  const mat = (color: number, rough = 0.7) => new THREE.MeshStandardMaterial({ color, roughness: rough });
  const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

  const isGirl   = gender === 'girl';
  const skinCss  = typeof skinHex === 'number' ? '#' + skinHex.toString(16).padStart(6, '0') : skinHex;
  const hairHex  = typeof hairColor === 'number' ? '#' + hairColor.toString(16).padStart(6, '0') : hairColor;

  const skinMat  = mat(typeof skinHex === 'number' ? skinHex : parseInt(skinCss.replace('#',''), 16));
  const shirtMat = mat(isGirl ? (shirtColor === 0x2363d1 ? 0xe040a0 : shirtColor) : shirtColor);
  const pantsMat = mat(isGirl ? 0x6b21a8 : 0x17449c);
  const shoeMat  = mat(0x222222);
  const hairMat  = mat(typeof hairColor === 'number' ? hairColor : parseInt(hairHex.replace('#',''), 16));

  // 1. Minecraft Block Head
  const headMats = makeMinecraftHeadMaterials(hairHex, skinCss, isGirl);
  const head = new THREE.Mesh(box(0.56, 0.56, 0.56), headMats);
  head.position.y = 1.72;
  head.castShadow = true;

  (g as any).headMesh = head;
  (g as any).frontOpen = (headMats as any).frontOpen;
  (g as any).frontClosed = (headMats as any).frontClosed;

  // Tasodifiy pirpirash
  setInterval(() => {
    const h = (g as any).headMesh;
    if (!h) return;
    (h.material as any)[4] = (g as any).frontClosed;
    setTimeout(() => { (h.material as any)[4] = (g as any).frontOpen; }, 140);
  }, 2800 + Math.random() * 2500);

  // 2. Hair Cap
  const hairCap = new THREE.Mesh(box(0.58, 0.18, 0.58), hairMat);
  hairCap.position.set(0, 1.92, 0);
  hairCap.castShadow = true;
  g.add(hairCap);

  if (isGirl) {
    // Girl Long Hair Strands (Minecraft Alex style falling over shoulders)
    const lHairStrand = new THREE.Mesh(box(0.16, 0.65, 0.2), hairMat);
    lHairStrand.position.set(-0.28, 1.42, 0.05);
    lHairStrand.castShadow = true;

    const rHairStrand = new THREE.Mesh(box(0.16, 0.65, 0.2), hairMat);
    rHairStrand.position.set(0.28, 1.42, 0.05);
    rHairStrand.castShadow = true;

    const backHair = new THREE.Mesh(box(0.56, 0.75, 0.16), hairMat);
    backHair.position.set(0, 1.40, -0.22);
    backHair.castShadow = true;

    // Hair Bow / Ribbon
    const bowMat = mat(0xff3366);
    const bow = new THREE.Mesh(box(0.16, 0.12, 0.1), bowMat);
    bow.position.set(0.18, 1.98, 0.22);

    g.add(lHairStrand, rHairStrand, backHair, bow);
  }

  // 3. Body / Shirt
  const body = new THREE.Mesh(box(0.55, 0.72, 0.32), shirtMat);
  body.position.y = 1.08;
  body.castShadow = true;

  // 4. Arms (Pivoting arm groups)
  const lArmGroup = new THREE.Group();
  lArmGroup.position.set(-0.38, 1.38, 0);
  const lArm = new THREE.Mesh(box(0.2, 0.65, 0.22), shirtMat);
  lArm.position.y = -0.32;
  lArm.castShadow = true;
  const lHand = new THREE.Mesh(box(0.18, 0.12, 0.18), skinMat);
  lHand.position.y = -0.68;
  lArmGroup.add(lArm, lHand);

  const rArmGroup = new THREE.Group();
  rArmGroup.position.set(0.38, 1.38, 0);
  const rArm = new THREE.Mesh(box(0.2, 0.65, 0.22), shirtMat);
  rArm.position.y = -0.32;
  rArm.castShadow = true;
  const rHand = new THREE.Mesh(box(0.18, 0.12, 0.18), skinMat);
  rHand.position.y = -0.68;
  rArmGroup.add(rArm, rHand);

  // 5. Legs (Pivoting leg groups)
  const lLegGroup = new THREE.Group();
  lLegGroup.position.set(-0.15, 0.70, 0);
  const lLeg = new THREE.Mesh(box(0.22, 0.62, 0.24), pantsMat);
  lLeg.position.y = -0.31;
  lLeg.castShadow = true;
  const lShoe = new THREE.Mesh(box(0.24, 0.12, 0.28), shoeMat);
  lShoe.position.set(0, -0.64, 0.02);
  lShoe.castShadow = true;
  lLegGroup.add(lLeg, lShoe);

  const rLegGroup = new THREE.Group();
  rLegGroup.position.set(0.15, 0.70, 0);
  const rLeg = new THREE.Mesh(box(0.22, 0.62, 0.24), pantsMat);
  rLeg.position.y = -0.31;
  rLeg.castShadow = true;
  const rShoe = new THREE.Mesh(box(0.24, 0.12, 0.28), shoeMat);
  rShoe.position.set(0, -0.64, 0.02);
  rShoe.castShadow = true;
  rLegGroup.add(rLeg, rShoe);

  g.add(head, body, lArmGroup, rArmGroup, lLegGroup, rLegGroup);

  // Save joint references for walking animation
  (g as any).lArmGroup = lArmGroup;
  (g as any).rArmGroup = rArmGroup;
  (g as any).lLegGroup = lLegGroup;
  (g as any).rLegGroup = rLegGroup;

  // Yumshoq soya-blob
  const shCanvas = document.createElement('canvas');
  shCanvas.width = 64; shCanvas.height = 64;
  const shCtx = shCanvas.getContext('2d')!;
  const rg = shCtx.createRadialGradient(32, 32, 4, 32, 32, 30);
  rg.addColorStop(0, 'rgba(0,0,0,0.35)');
  rg.addColorStop(1, 'rgba(0,0,0,0)');
  shCtx.fillStyle = rg;
  shCtx.fillRect(0, 0, 64, 64);
  const blob = new THREE.Mesh(
    new THREE.PlaneGeometry(1.1, 1.1),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(shCanvas), transparent: true, depthWrite: false })
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.03;
  g.add(blob);

  return g;
}

// ─── Pine Tree Model ──────────────────────────────────────────────────────────
function makePineTree(): THREE.Group {
  const g = new THREE.Group();
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5c3a1e });
  const foliageMat = new THREE.MeshLambertMaterial({ color: 0x1e5c27 });

  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, 2.5, 8), trunkMat);
  trunk.position.y = 1.25;
  trunk.castShadow = true;
  g.add(trunk);

  const tiers = [
    { r: 2.8, h: 2.6, y: 2.4 },
    { r: 2.2, h: 2.3, y: 3.6 },
    { r: 1.6, h: 2.0, y: 4.7 },
    { r: 1.0, h: 1.6, y: 5.6 },
  ];

  tiers.forEach(t => {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(t.r, t.h, 8), foliageMat);
    cone.position.y = t.y;
    cone.castShadow = true;
    cone.receiveShadow = true;
    g.add(cone);
  });

  return g;
}

// ─── Shop House Model ─────────────────────────────────────────────────────────
function makeShopHouse(): THREE.Group {
  const g = new THREE.Group();
  const wallMat = new THREE.MeshLambertMaterial({ color: 0x8a5229 });
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x54321a });
  const doorMat = new THREE.MeshLambertMaterial({ color: 0x381f0d });

  const walls = new THREE.Mesh(new THREE.BoxGeometry(7, 4.5, 6), wallMat);
  walls.position.y = 2.25;
  walls.castShadow = true;
  walls.receiveShadow = true;
  g.add(walls);

  const roof = new THREE.Mesh(new THREE.ConeGeometry(5.8, 3, 4), roofMat);
  roof.position.y = 6.0;
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(1.1, 1, 1.1);
  roof.castShadow = true;
  g.add(roof);

  const door = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.4, 0.2), doorMat);
  door.position.set(0, 1.2, 3.01);
  g.add(door);

  // Shop signboard
  const signCanvas = document.createElement('canvas');
  signCanvas.width = 128; signCanvas.height = 64;
  const sCtx = signCanvas.getContext('2d')!;
  sCtx.fillStyle = '#7a4b26';
  sCtx.fillRect(0, 0, 128, 64);
  sCtx.lineWidth = 4;
  sCtx.strokeStyle = '#4a2b12';
  sCtx.strokeRect(2, 2, 124, 60);
  sCtx.fillStyle = '#ffffff';
  sCtx.font = 'bold 28px Inter, sans-serif';
  sCtx.textAlign = 'center';
  sCtx.textBaseline = 'middle';
  sCtx.fillText('shop', 64, 32);

  const signTex = new THREE.CanvasTexture(signCanvas);
  const signMat = new THREE.MeshBasicMaterial({ map: signTex });
  const signBoard = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.2, 0.15), signMat);
  signBoard.position.set(0, 6.0, 3.2);
  g.add(signBoard);

  return g;
}

// ─── Purple Tent Model ────────────────────────────────────────────────────────
function makePurpleTent(): THREE.Group {
  const g = new THREE.Group();
  const tentMat  = new THREE.MeshLambertMaterial({ color: 0x7b2696 });
  const innerMat = new THREE.MeshLambertMaterial({ color: 0x330c42 });

  const body = new THREE.Mesh(new THREE.ConeGeometry(5.5, 6, 4), tentMat);
  body.position.y = 3;
  body.rotation.y = Math.PI / 4;
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);

  const opening = new THREE.Mesh(new THREE.ConeGeometry(2.2, 3.2, 4), innerMat);
  opening.position.set(0, 1.6, 2.2);
  opening.rotation.y = Math.PI / 4;
  g.add(opening);

  return g;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Room Definitions & Data
// ═══════════════════════════════════════════════════════════════════════════════
export interface RoomConfig {
  id:            string;
  name:          string;
  icon:          string;
  entrancePos:   { x: number; z: number }; // Door position on NYC Street
  spawnPos:      { x: number; z: number }; // Spawn inside room
  exitDoorPos:   { x: number; z: number }; // Exit door inside room
  buildingColor: number;
}

export const ROOMS: Record<string, RoomConfig> = {
  coffee_shop: {
    id: 'coffee_shop',
    name: 'NYC Coffee House ☕',
    icon: '☕',
    entrancePos: { x: -75, z: -16 },
    spawnPos:    { x: 200, z: 8 },
    exitDoorPos: { x: 200, z: 14 },
    buildingColor: 0x8b3a2b, // Red Brick
  },
  library: {
    id: 'library',
    name: 'Central Library 📚',
    icon: '📚',
    entrancePos: { x: -45, z: -16 },
    spawnPos:    { x: 350, z: 8 },
    exitDoorPos: { x: 350, z: 14 },
    buildingColor: 0x8a7a63, // Classical Limestone
  },
  speaking_club: {
    id: 'speaking_club',
    name: 'English Speaking Club 🗣️',
    icon: '🗣️',
    entrancePos: { x: -15, z: -16 },
    spawnPos:    { x: 500, z: 8 },
    exitDoorPos: { x: 500, z: 14 },
    buildingColor: 0x1d4ed8, // Blue Modern Glass
  },
  cinema: {
    id: 'cinema',
    name: 'Broadway Cinema 🎬',
    icon: '🎬',
    entrancePos: { x: 15, z: -16 },
    spawnPos:    { x: 650, z: 8 },
    exitDoorPos: { x: 650, z: 14 },
    buildingColor: 0x1e1b2e, // Marquee Dark Theater
  },
  game_zone: {
    id: 'game_zone',
    name: 'Arcade & Game Zone 🎮',
    icon: '🎮',
    entrancePos: { x: 45, z: -16 },
    spawnPos:    { x: 800, z: 8 },
    exitDoorPos: { x: 800, z: 14 },
    buildingColor: 0x6b21a8, // Cyberpunk Neon
  },
  office: {
    id: 'office',
    name: 'Campus Reception Office 🏢',
    icon: '🏢',
    entrancePos: { x: 75, z: -16 },
    spawnPos:    { x: 950, z: 8 },
    exitDoorPos: { x: 950, z: 14 },
    buildingColor: 0x334155, // Steel Skyscraper
  },
};

// ─── Floating Sign Sprite ──────────────────────────────────────────────────────
function makeSignSprite(text: string, bgColor = 'rgba(15, 23, 42, 0.9)', textColor = '#ffffff'): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 96;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = bgColor;
  ctx.beginPath();
  if ((ctx as any).roundRect) {
    (ctx as any).roundRect(8, 8, 368, 80, 16);
  } else {
    ctx.rect(8, 8, 368, 80);
  }
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(91, 156, 246, 0.6)';
  ctx.stroke();

  ctx.fillStyle = textColor;
  ctx.font = 'bold 30px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 192, 48);

  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(5.5, 1.38, 1);
  return sprite;
}

// ─── Realistic Low-Poly Sedan ─────────────────────────────────────────────────
function makeLowPolyCar(bodyColor: number, hasRoofSign = false, roofSignColor = 0xffffff): THREE.Group {
  const g = new THREE.Group();
  const bodyMat  = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.35, metalness: 0.5 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x1a2332, roughness: 0.1, metalness: 0.9, transparent: true, opacity: 0.75 });
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xcdd5e0, metalness: 0.95, roughness: 0.1 });
  const headlightMat = new THREE.MeshBasicMaterial({ color: 0xfff8e0 });
  const taillightMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });

  // Lower body (chassis)
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.55, 5.0), bodyMat);
  chassis.position.y = 0.48;
  chassis.castShadow = true;
  g.add(chassis);

  // Front hood (slight slope)
  const hood = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.15, 1.2), bodyMat);
  hood.position.set(0, 0.82, 1.7);
  hood.rotation.x = -0.12;
  g.add(hood);

  // Trunk
  const trunk = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.15, 1.0), bodyMat);
  trunk.position.set(0, 0.82, -1.8);
  trunk.rotation.x = 0.08;
  g.add(trunk);

  // Cabin
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.7, 2.2), bodyMat);
  cabin.position.set(0, 1.15, -0.15);
  cabin.castShadow = true;
  g.add(cabin);

  // Windshield (front glass, angled)
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.65, 0.08), glassMat);
  windshield.position.set(0, 1.15, 0.96);
  windshield.rotation.x = -0.35;
  g.add(windshield);

  // Rear window
  const rearWin = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.55, 0.08), glassMat);
  rearWin.position.set(0, 1.15, -1.24);
  rearWin.rotation.x = 0.3;
  g.add(rearWin);

  // Side windows (left/right)
  [-1.02, 1.02].forEach(x => {
    const sideWin = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.45, 1.8), glassMat);
    sideWin.position.set(x, 1.2, -0.15);
    g.add(sideWin);
  });

  // Bumpers (front and back)
  const fBumper = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.25, 0.2), chromeMat);
  fBumper.position.set(0, 0.35, 2.55);
  g.add(fBumper);
  const rBumper = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.25, 0.2), chromeMat);
  rBumper.position.set(0, 0.35, -2.55);
  g.add(rBumper);

  // Headlights
  [-0.75, 0.75].forEach(x => {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.08), headlightMat);
    hl.position.set(x, 0.55, 2.52);
    g.add(hl);
  });

  // Tail lights
  [-0.8, 0.8].forEach(x => {
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.08), taillightMat);
    tl.position.set(x, 0.55, -2.52);
    g.add(tl);
  });

  // Side mirrors
  [-1.2, 1.2].forEach(x => {
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.25), chromeMat);
    mirror.position.set(x, 1.0, 0.7);
    g.add(mirror);
  });

  // Wheels with rims
  const wheelPositions = [
    [-1.0, 0.28, 1.4], [1.0, 0.28, 1.4],
    [-1.0, 0.28, -1.4], [1.0, 0.28, -1.4]
  ];
  wheelPositions.forEach(([x, y, z]) => {
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.22, 14), wheelMat);
    tire.rotation.z = Math.PI / 2;
    tire.position.set(x, y, z);
    tire.castShadow = true;
    g.add(tire);
    // Hub cap
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.24, 8), chromeMat);
    rim.rotation.z = Math.PI / 2;
    rim.position.set(x > 0 ? x + 0.01 : x - 0.01, y, z);
    g.add(rim);
  });

  // Optional roof sign (taxi, police, etc.)
  if (hasRoofSign) {
    const signMat = new THREE.MeshBasicMaterial({ color: roofSignColor });
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.2, 0.35), signMat);
    sign.position.set(0, 1.62, -0.15);
    g.add(sign);
  }

  return g;
}

// ─── NYC Yellow Taxi (uses sedan) ─────────────────────────────────────────────
function makeNYCTaxi(): THREE.Group {
  return makeLowPolyCar(0xf59e0b, true, 0xfff8dc);
}

// ─── Police Car ───────────────────────────────────────────────────────────────
function makePoliceCar(): THREE.Group {
  const car = makeLowPolyCar(0x1e40af, true, 0xef4444);
  // Add blue & red roof lights
  const redLight = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.15, 0.15), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
  redLight.position.set(-0.3, 1.72, -0.15);
  car.add(redLight);
  const blueLight = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.15, 0.15), new THREE.MeshBasicMaterial({ color: 0x3b82f6 }));
  blueLight.position.set(0.3, 1.72, -0.15);
  car.add(blueLight);
  return car;
}

// ─── Delivery Van ─────────────────────────────────────────────────────────────
function makeDeliveryVan(boxColor = 0xf0f0f0): THREE.Group {
  const g = new THREE.Group();
  const bodyMat  = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.4, metalness: 0.3 });
  const boxMat   = new THREE.MeshStandardMaterial({ color: boxColor, roughness: 0.5 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x1a2332, roughness: 0.1, metalness: 0.9, transparent: true, opacity: 0.7 });
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
  const headlightMat = new THREE.MeshBasicMaterial({ color: 0xfff8e0 });
  const taillightMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });

  // Cab
  const cab = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.6, 2.0), bodyMat);
  cab.position.set(0, 1.1, 1.8);
  cab.castShadow = true;
  g.add(cab);

  // Windshield
  const ws = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.9, 0.08), glassMat);
  ws.position.set(0, 1.3, 2.82);
  ws.rotation.x = -0.2;
  g.add(ws);

  // Cargo box
  const cargo = new THREE.Mesh(new THREE.BoxGeometry(2.5, 2.4, 4.2), boxMat);
  cargo.position.set(0, 1.5, -0.9);
  cargo.castShadow = true;
  g.add(cargo);

  // Headlights
  [-0.85, 0.85].forEach(x => {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.2, 0.08), headlightMat);
    hl.position.set(x, 0.7, 2.82);
    g.add(hl);
  });

  // Tail lights
  [-0.95, 0.95].forEach(x => {
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.18, 0.08), taillightMat);
    tl.position.set(x, 0.7, -3.0);
    g.add(tl);
  });

  // Wheels
  [[-1.15, 0.32, 1.5], [1.15, 0.32, 1.5], [-1.15, 0.32, -1.6], [1.15, 0.32, -1.6]].forEach(([x, y, z]) => {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.28, 14), wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, y, z);
    w.castShadow = true;
    g.add(w);
  });

  return g;
}

// ─── SUV / Minivan ────────────────────────────────────────────────────────────
function makeSUV(color: number): THREE.Group {
  const g = new THREE.Group();
  const bodyMat  = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.45 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x1a2332, roughness: 0.1, metalness: 0.9, transparent: true, opacity: 0.7 });
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xcdd5e0, metalness: 0.95, roughness: 0.1 });
  const headlightMat = new THREE.MeshBasicMaterial({ color: 0xfff8e0 });
  const taillightMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });

  // Body (taller than sedan)
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.7, 5.2), bodyMat);
  body.position.y = 0.65;
  body.castShadow = true;
  g.add(body);

  // Cabin (taller)
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.0, 3.0), bodyMat);
  cabin.position.set(0, 1.45, -0.2);
  cabin.castShadow = true;
  g.add(cabin);

  // Windshield
  const ws = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.85, 0.08), glassMat);
  ws.position.set(0, 1.45, 1.3);
  ws.rotation.x = -0.3;
  g.add(ws);

  // Rear window
  const rw = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.7, 0.08), glassMat);
  rw.position.set(0, 1.45, -1.7);
  rw.rotation.x = 0.2;
  g.add(rw);

  // Side windows
  [-1.22, 1.22].forEach(x => {
    const sw = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.65, 2.5), glassMat);
    sw.position.set(x, 1.5, -0.2);
    g.add(sw);
  });

  // Bumpers
  const fb = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.3, 0.22), chromeMat);
  fb.position.set(0, 0.42, 2.65);
  g.add(fb);
  const rb = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.3, 0.22), chromeMat);
  rb.position.set(0, 0.42, -2.65);
  g.add(rb);

  // Headlights
  [-0.85, 0.85].forEach(x => {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.22, 0.08), headlightMat);
    hl.position.set(x, 0.65, 2.62);
    g.add(hl);
  });

  // Tail lights
  [-0.9, 0.9].forEach(x => {
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.08), taillightMat);
    tl.position.set(x, 0.65, -2.62);
    g.add(tl);
  });

  // Roof rack bars
  [-0.9, 0.9].forEach(x => {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 2.6), chromeMat);
    bar.position.set(x, 2.0, -0.2);
    g.add(bar);
  });

  // Wheels (bigger)
  [[-1.15, 0.35, 1.6], [1.15, 0.35, 1.6], [-1.15, 0.35, -1.6], [1.15, 0.35, -1.6]].forEach(([x, y, z]) => {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.26, 14), wheelMat);
    t.rotation.z = Math.PI / 2;
    t.position.set(x, y, z);
    t.castShadow = true;
    g.add(t);
  });

  return g;
}

// ─── Colorful Balloon Cluster ─────────────────────────────────────────────────
function makeBalloonCluster(x: number, y: number, z: number): THREE.Group {
  const g = new THREE.Group();
  const colors = [0xef4444, 0x3b82f6, 0xf59e0b, 0x22c55e, 0xec4899, 0xa855f7, 0x06b6d4];
  const count = 3 + Math.floor(Math.random() * 4);
  for (let i = 0; i < count; i++) {
    const c = colors[Math.floor(Math.random() * colors.length)];
    const balloon = new THREE.Mesh(
      new THREE.SphereGeometry(0.25 + Math.random() * 0.15, 10, 8),
      new THREE.MeshStandardMaterial({ color: c, roughness: 0.3, metalness: 0.1 })
    );
    balloon.position.set(
      (Math.random() - 0.5) * 0.8,
      i * 0.45 + Math.random() * 0.3,
      (Math.random() - 0.5) * 0.8
    );
    g.add(balloon);

    // String
    const string = new THREE.Mesh(
      new THREE.CylinderGeometry(0.01, 0.01, balloon.position.y + 0.5, 4),
      new THREE.MeshBasicMaterial({ color: 0x888888 })
    );
    string.position.set(balloon.position.x, balloon.position.y / 2 - 0.25, balloon.position.z);
    g.add(string);
  }
  g.position.set(x, y, z);
  return g;
}

// ─── Background Skyscraper (decorative, non-interactive) ──────────────────────
function makeBgSkyscraper(
  height: number, width: number, depth: number, color: number, x: number, z: number,
  rotY = 0
): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.3 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), mat);
  body.position.set(0, height / 2, 0);
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);

  // Window grid on front face (+Z side)
  const winMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.15, metalness: 0.85, emissive: 0x0a1628, emissiveIntensity: 0.3 });
  const wRows = Math.floor(height / 3.5);
  const wCols = Math.floor(width / 3.5);
  for (let r = 0; r < wRows; r++) {
    for (let c = 0; c < wCols; c++) {
      if (Math.random() < 0.15) continue; // some windows dark
      const win = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.8, 0.15), winMat);
      const wx = - (width / 2) + 2.0 + c * 3.2;
      const wy = 3 + r * 3.5;
      win.position.set(wx, wy, depth / 2 + 0.08);
      g.add(win);
    }
  }

  // Rooftop antenna or water tower
  if (Math.random() > 0.5) {
    const antenna = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 4, 6),
      new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.7, roughness: 0.3 })
    );
    antenna.position.set(0, height + 2, 0);
    g.add(antenna);
  } else {
    const tower = new THREE.Mesh(
      new THREE.CylinderGeometry(0.8, 0.8, 2.5, 8),
      new THREE.MeshStandardMaterial({ color: 0x78716c, roughness: 0.7 })
    );
    tower.position.set((Math.random() - 0.5) * width * 0.4, height + 1.25, 0);
    g.add(tower);
  }

  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

// ─── Fire Hydrant ─────────────────────────────────────────────────────────────
function makeFireHydrant(): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.5 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.7, 8), mat);
  body.position.y = 0.35;
  g.add(body);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), mat);
  cap.position.y = 0.72;
  g.add(cap);
  // Side nozzles
  [-1, 1].forEach(side => {
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.18, 6), mat);
    nozzle.rotation.z = Math.PI / 2;
    nozzle.position.set(side * 0.28, 0.45, 0);
    g.add(nozzle);
  });
  return g;
}

// ─── Bench ────────────────────────────────────────────────────────────────────
function makeBench(): THREE.Group {
  const g = new THREE.Group();
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.7 });
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.7, roughness: 0.3 });
  // Seat
  const seat = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.1, 0.6), woodMat);
  seat.position.set(0, 0.55, 0);
  g.add(seat);
  // Back
  const back = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.6, 0.08), woodMat);
  back.position.set(0, 0.85, -0.28);
  back.rotation.x = -0.1;
  g.add(back);
  // Legs
  [[-0.85, 0, 0.2], [0.85, 0, 0.2], [-0.85, 0, -0.2], [0.85, 0, -0.2]].forEach(([x, _, z]) => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.55, 0.06), metalMat);
    leg.position.set(x, 0.275, z);
    g.add(leg);
  });
  return g;
}

// ─── Street Lamp Model (improved) ────────────────────────────────────────────
function makeStreetLamp(): THREE.Group {
  const g = new THREE.Group();
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.7, roughness: 0.3 });
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xffedd5 });

  // Base
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.25, 8), poleMat);
  base.position.y = 0.125;
  g.add(base);

  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 4.5, 8), poleMat);
  pole.position.y = 2.4;
  pole.castShadow = true;
  g.add(pole);

  // Curved arm
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 1.2), poleMat);
  arm.position.set(0, 4.55, 0.55);
  arm.rotation.x = -0.2;
  g.add(arm);

  const lampHead = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 12), lightMat);
  lampHead.position.set(0, 4.45, 1.0);
  g.add(lampHead);

  const pointLight = new THREE.PointLight(0xffecd1, 1.2, 14);
  pointLight.position.set(0, 4.3, 1.0);
  g.add(pointLight);

  return g;
}

// ═══════════════════════════════════════════════════════════════════════════════
// World3D Class Implementation
// ═══════════════════════════════════════════════════════════════════════════════
export class World3D {
  private scene!:    THREE.Scene;
  private camera!:   THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private composer!: EffectComposer;
  private clouds: THREE.Sprite[] = [];

  // Local player state
  private localChar!: THREE.Group;
  private pos = new THREE.Vector3(0, 0, 8);
  private facing = 0;
  private currentRoom = 'outdoor'; // 'outdoor' | 'coffee_shop' | 'library' | 'speaking_club' | 'cinema' | 'game_zone' | 'office'

  // Callbacks
  private roomChangeCallback?: (roomId: string, title: string) => void;

  // Camera orbit & pitch
  private cameraMode: '3rd_person' | '1st_person' = '3rd_person';
  private cameraDist = 7.5;
  private camAngle   = Math.PI;
  private isDragging = false;
  private lastMouseX = 0;
  private lastMouseY = 0;
  private camPitch   = 0.25;

  // Input
  private keys: Record<string, boolean> = {};

  // Network & state
  private socket   = getSocket();
  private remotes  = new Map<string, RemoteChar>();
  private lastEmit = 0;
  private isReady  = false;
  private pending: PlayerData[] = [];
  private lastDoorCooldown = 0;

  private animId = 0;
  private clock  = new THREE.Clock();
  private coffeeShopAudio: HTMLAudioElement | null = null;
  private isMobile = false;

  constructor(
    private container: HTMLElement,
    private name: string,
    private group: number,
    private gender: 'boy' | 'girl' = 'boy',
    color: string
  ) {
    this.isMobile = typeof navigator !== 'undefined' && (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768);
    this.initRenderer();
    this.initScene();
    this.initPostProcessing();
    this.buildWorld();
    this.spawnLocal();
    this.bindInput();
    this.bindSocket();

    this.isReady = true;
    this.pending.forEach(p => this.addRemote(p));
    this.pending = [];

    this.socket.emit('join', { name, group, gender: this.gender, currentRoom: this.currentRoom, x: this.pos.x, y: this.pos.z });
    this.loop();
  }

  public onRoomChange(fn: (roomId: string, title: string) => void) {
    this.roomChangeCallback = fn;
    fn(this.currentRoom, 'New York City Campus 🗽');
  }

  public exitToOutdoor() {
    if (this.currentRoom === 'outdoor') return;
    const config = ROOMS[this.currentRoom];
    if (config) {
      this.pos.set(config.entrancePos.x, 0, config.entrancePos.z + 4);
      this.currentRoom = 'outdoor';
      this.localChar.position.copy(this.pos);
      this.roomChangeCallback?.('outdoor', 'New York City Campus 🗽');
      emitMove(this.socket, { x: this.pos.x, y: this.pos.z, currentRoom: this.currentRoom });
    }
  }

  private initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isMobile,
      powerPreference: 'high-performance',
      precision: this.isMobile ? 'mediump' : 'highp',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.isMobile ? 1.0 : 1.5));

    if (this.isMobile) {
      this.renderer.shadowMap.enabled = false;
    } else {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }

    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    this.resize();
    this.container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(50, this.aspect(), 0.1, 500);

    window.addEventListener('resize', () => {
      this.resize();
      this.camera.aspect = this.aspect();
      this.camera.updateProjectionMatrix();
    });
  }

  private initPostProcessing() {
    if (this.isMobile) return; // Skip heavy Bloom shader pass on mobile for 60 FPS performance!
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.35,  // kuch — oshirib yubormang
      0.6,   // radius
      0.85   // threshold — faqat yorqin narsalar yonadi
    );
    this.composer.addPass(bloom);
  }

  private resize() {
    const w = this.container.clientWidth  || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    if (this.composer) {
      this.composer.setSize(w, h);
    }
  }

  private aspect() {
    return (this.container.clientWidth || window.innerWidth) /
           (this.container.clientHeight || window.innerHeight);
  }

  // ─── Gradient osmon ───
  private makeSky() {
    const canvas = document.createElement('canvas');
    canvas.width = 2; canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0.0, '#2f6fd8');   // tepada to'q moviy
    grad.addColorStop(0.5, '#7dc4f7');   // ufqqa yaqin och
    grad.addColorStop(1.0, '#ffe9c9');   // ufqda iliq shafaq
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 2, 512);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(400, 24, 16),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false })
    );
    this.scene.add(sky);
  }

  // ─── Bulutlar ───
  private makeClouds() {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    // Bir nechta yumshoq oq doiralar = bulut
    [[70,70,45],[120,60,55],[175,72,42],[100,85,38],[145,88,40]].forEach(([x,y,r]) => {
      const rg = ctx.createRadialGradient(x, y, 4, x, y, r);
      rg.addColorStop(0, 'rgba(255,255,255,0.95)');
      rg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, 256, 128);
    });
    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.9, fog: false });

    for (let i = 0; i < 14; i++) {
      const cloud = new THREE.Sprite(mat.clone());
      const s = 18 + Math.random() * 26;
      cloud.scale.set(s, s * 0.45, 1);
      cloud.position.set(
        -200 + Math.random() * 400,
        45 + Math.random() * 30,
        -120 + Math.random() * 180
      );
      (cloud as any).speed = 0.4 + Math.random() * 0.8;
      this.clouds.push(cloud);
      this.scene.add(cloud);
    }
  }

  private initScene() {
    this.scene = new THREE.Scene();
    this.makeSky();
    this.makeClouds();
    this.scene.fog = new THREE.FogExp2(0xbfe0ff, 0.002);

    // Sun & Ambient Lighting
    const sun = new THREE.DirectionalLight(0xfffde8, 1.5);
    sun.position.set(80, 120, 60);
    sun.castShadow = true;
    Object.assign(sun.shadow.camera, { near: 1, far: 400, left: -180, right: 180, top: 180, bottom: -180 });
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0003;
    this.scene.add(sun);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    this.scene.add(new THREE.HemisphereLight(0xbae6fd, 0x334155, 0.7));
  }

  private buildWorld() {
    this.buildNYCStreet();
    this.buildRoomInteriors();
  }

  // ─── 1. Build New York City Street (Outdoor Map) ─────────────────────────────
  private buildNYCStreet() {
    const nycGroup = new THREE.Group();

    // Grass terrain
    const grass = new THREE.Mesh(
      new THREE.PlaneGeometry(500, 300),
      new THREE.MeshLambertMaterial({ color: 0x475569 })
    );
    grass.rotation.x = -Math.PI / 2;
    grass.position.y = -0.02;
    grass.receiveShadow = true;
    nycGroup.add(grass);

    // Asphalt Main Avenue (Street)
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(280, 20),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 })
    );
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0, 0);
    road.receiveShadow = true;
    nycGroup.add(road);

    // Double Yellow Center Lane
    const yellowLine = new THREE.Mesh(
      new THREE.PlaneGeometry(280, 0.3),
      new THREE.MeshBasicMaterial({ color: 0xf59e0b })
    );
    yellowLine.rotation.x = -Math.PI / 2;
    yellowLine.position.set(0, 0.01, 0);
    nycGroup.add(yellowLine);

    // Sidewalk (North side for buildings)
    const northSidewalk = new THREE.Mesh(
      new THREE.PlaneGeometry(280, 16),
      new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.6 })
    );
    northSidewalk.rotation.x = -Math.PI / 2;
    northSidewalk.position.set(0, 0.02, -18);
    northSidewalk.receiveShadow = true;
    nycGroup.add(northSidewalk);

    // Sidewalk (South side)
    const southSidewalk = new THREE.Mesh(
      new THREE.PlaneGeometry(280, 10),
      new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.6 })
    );
    southSidewalk.rotation.x = -Math.PI / 2;
    southSidewalk.position.set(0, 0.02, 15);
    southSidewalk.receiveShadow = true;
    nycGroup.add(southSidewalk);

    // ═══ STREET LAMPS (both sides, denser) ═══════════════════════════════════════
    // South sidewalk lamps
    [-120, -100, -80, -60, -40, -20, 0, 20, 40, 60, 80, 100, 120].forEach(x => {
      const lamp = makeStreetLamp();
      lamp.position.set(x, 0, 12);
      nycGroup.add(lamp);
    });
    // North sidewalk lamps (between buildings)
    [-60, -30, 0, 30, 60].forEach(x => {
      const lamp = makeStreetLamp();
      lamp.position.set(x, 0, -12);
      lamp.rotation.y = Math.PI;
      nycGroup.add(lamp);
    });

    // ═══ VEHICLES — Diverse Fleet ══════════════════════════════════════════════
    // Yellow Taxis (parked along both curbs)
    const taxi1 = makeNYCTaxi();
    taxi1.position.set(-95, 0, 6); taxi1.rotation.y = Math.PI / 2;
    const taxi2 = makeNYCTaxi();
    taxi2.position.set(-30, 0, 6); taxi2.rotation.y = Math.PI / 2;
    const taxi3 = makeNYCTaxi();
    taxi3.position.set(25, 0, -6); taxi3.rotation.y = -Math.PI / 2;
    const taxi4 = makeNYCTaxi();
    taxi4.position.set(85, 0, 6); taxi4.rotation.y = Math.PI / 2;
    nycGroup.add(taxi1, taxi2, taxi3, taxi4);

    // Police Car
    const police = makePoliceCar();
    police.position.set(50, 0, -6); police.rotation.y = -Math.PI / 2;
    nycGroup.add(police);

    // Regular sedans (various colors)
    const sedanColors = [0xdc2626, 0x1d4ed8, 0x16a34a, 0x111827, 0xf5f5f4, 0x7c3aed];
    [[-65, 6], [10, 6], [70, -6], [-10, -6], [110, 6], [-110, -6]].forEach(([px, pz], i) => {
      const car = makeLowPolyCar(sedanColors[i % sedanColors.length]);
      car.position.set(px, 0, pz);
      car.rotation.y = pz > 0 ? Math.PI / 2 : -Math.PI / 2;
      nycGroup.add(car);
    });

    // SUVs
    const suv1 = makeSUV(0x1e293b);
    suv1.position.set(-50, 0, 6); suv1.rotation.y = Math.PI / 2;
    const suv2 = makeSUV(0x991b1b);
    suv2.position.set(95, 0, -6); suv2.rotation.y = -Math.PI / 2;
    nycGroup.add(suv1, suv2);

    // Delivery Vans
    const van1 = makeDeliveryVan(0xfef3c7); // cream
    van1.position.set(-80, 0, -6); van1.rotation.y = -Math.PI / 2;
    const van2 = makeDeliveryVan(0x1e40af); // blue
    van2.position.set(40, 0, 6); van2.rotation.y = Math.PI / 2;
    nycGroup.add(van1, van2);

    // ═══ 6 NYC BUILDINGS (main / interactive) ══════════════════════════════════
    Object.values(ROOMS).forEach(room => {
      const bGroup = new THREE.Group();
      const bColor = room.buildingColor;
      const bMat   = new THREE.MeshStandardMaterial({ color: bColor, roughness: 0.5 });
      const glassMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.2, metalness: 0.8 });

      // Skyscraper/Building Main Body
      const building = new THREE.Mesh(new THREE.BoxGeometry(24, 18, 14), bMat);
      building.position.set(room.entrancePos.x, 9, room.entrancePos.z - 7);
      building.castShadow = true;
      building.receiveShadow = true;
      bGroup.add(building);

      // Windows Grid
      for (let wy = 4; wy <= 15; wy += 3.5) {
        for (let wx = -9; wx <= 9; wx += 4.5) {
          const win = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.0, 0.2), glassMat);
          win.position.set(room.entrancePos.x + wx, wy, room.entrancePos.z + 0.05);
          bGroup.add(win);
        }
      }

      // Entrance Doorway (Glowing Portal)
      const doorPortalMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.85 });
      const doorPortal = new THREE.Mesh(new THREE.BoxGeometry(3.6, 4.2, 0.2), doorPortalMat);
      doorPortal.position.set(room.entrancePos.x, 2.1, room.entrancePos.z);
      bGroup.add(doorPortal);

      // Door Frame
      const frameMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.3 });
      const frame = new THREE.Mesh(new THREE.BoxGeometry(4.2, 4.6, 0.4), frameMat);
      frame.position.set(room.entrancePos.x, 2.3, room.entrancePos.z - 0.1);
      bGroup.add(frame);

      // Awning / canopy over entrance
      const awningMat = new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.6 });
      const awning = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.15, 2.5), awningMat);
      awning.position.set(room.entrancePos.x, 4.6, room.entrancePos.z + 1.0);
      bGroup.add(awning);

      // Floating 3D Building Title Sign
      const sign = makeSignSprite(`${room.icon} ${room.name}`);
      sign.position.set(room.entrancePos.x, 5.5, room.entrancePos.z + 0.5);
      bGroup.add(sign);

      // Floating Door Interaction Indicator
      const doorHint = makeSignSprite('🚪 Enter Room (Walk In)', 'rgba(37, 99, 235, 0.85)');
      doorHint.scale.set(3.8, 0.95, 1);
      doorHint.position.set(room.entrancePos.x, 2.2, room.entrancePos.z + 0.4);
      bGroup.add(doorHint);

      nycGroup.add(bGroup);
    });

    // ═══ 360° SURROUNDING CITY SKYSCRAPERS & END-CAPS ═══════════════════════════
    const bgColors = [0x334155, 0x1e293b, 0x475569, 0x64748b, 0x1e3a5f, 0x374151, 0x4a5568, 0x2d3748, 0x8b3a2b, 0x1d4ed8, 0x78716c];

    // 1. North Side Background Skyscrapers (Behind main 6 buildings)
    const northBgBuildings: [number, number, number, number, number, number, number?][] = [
      [45, 14, 12, bgColors[0], -105, -42],
      [60, 16, 14, bgColors[1], -85,  -48],
      [35, 12, 10, bgColors[2], -68,  -40],
      [55, 15, 13, bgColors[3], -50,  -46],
      [70, 18, 15, bgColors[4], -30,  -50],
      [40, 13, 11, bgColors[5], -12,  -42],
      [65, 17, 14, bgColors[6], 8,    -48],
      [50, 14, 12, bgColors[7], 28,   -44],
      [75, 19, 16, bgColors[0], 48,   -52],
      [42, 12, 10, bgColors[1], 65,   -40],
      [58, 16, 13, bgColors[2], 82,   -46],
      [48, 14, 12, bgColors[3], 100,  -43],
      [62, 15, 14, bgColors[4], 118,  -50],
      // Far North back row
      [90, 20, 18, bgColors[5], -90,  -72],
      [80, 18, 16, bgColors[6], -50,  -68],
      [100, 22, 20, bgColors[7], -10, -75],
      [85, 19, 17, bgColors[0], 30,   -70],
      [95, 21, 19, bgColors[1], 70,   -74],
      [78, 17, 15, bgColors[2], 110,  -68],
    ];

    // 2. South Side Buildings (South of sidewalk, facing North rotY = Math.PI)
    const southBuildings: [number, number, number, number, number, number, number?][] = [
      // Front row (z = +28, facing street)
      [45, 18, 14, bgColors[8], -115, 28, Math.PI],
      [65, 16, 15, bgColors[9], -95,  28, Math.PI],
      [38, 15, 13, bgColors[10],-75,  28, Math.PI],
      [55, 17, 14, bgColors[0], -55,  28, Math.PI],
      [70, 18, 16, bgColors[1], -35,  28, Math.PI],
      [42, 16, 13, bgColors[2], -15,  28, Math.PI],
      [60, 17, 15, bgColors[3], 5,    28, Math.PI],
      [50, 15, 14, bgColors[4], 25,   28, Math.PI],
      [75, 19, 16, bgColors[5], 45,   28, Math.PI],
      [40, 16, 13, bgColors[6], 65,   28, Math.PI],
      [58, 17, 15, bgColors[7], 85,   28, Math.PI],
      [48, 16, 14, bgColors[8], 105,  28, Math.PI],
      [62, 18, 15, bgColors[9], 125,  28, Math.PI],
      // Far South back row
      [85, 20, 18, bgColors[0], -100, 52, Math.PI],
      [95, 22, 19, bgColors[1], -60,  55, Math.PI],
      [110, 24, 20, bgColors[4], 0,   60, Math.PI],
      [88, 20, 18, bgColors[3], 60,   55, Math.PI],
      [102, 22, 19, bgColors[5],100,  58, Math.PI],
    ];

    // 3. West Road End-Cap Buildings (x = -135, facing East rotY = Math.PI / 2)
    const westEndBuildings: [number, number, number, number, number, number, number?][] = [
      [55, 16, 14, bgColors[1], -135, -28, Math.PI / 2],
      [70, 18, 16, bgColors[4], -135, -10, Math.PI / 2],
      [60, 17, 15, bgColors[0], -135, 10,  Math.PI / 2],
      [50, 16, 14, bgColors[7], -135, 28,  Math.PI / 2],
      [90, 20, 25, bgColors[2], -155, 0,   Math.PI / 2],
    ];

    // 4. East Road End-Cap Buildings (x = +135, facing West rotY = -Math.PI / 2)
    const eastEndBuildings: [number, number, number, number, number, number, number?][] = [
      [55, 16, 14, bgColors[3], 135, -28, -Math.PI / 2],
      [75, 18, 16, bgColors[5], 135, -10, -Math.PI / 2],
      [65, 17, 15, bgColors[1], 135, 10,  -Math.PI / 2],
      [48, 16, 14, bgColors[6], 135, 28,  -Math.PI / 2],
      [95, 20, 25, bgColors[4], 155, 0,   -Math.PI / 2],
    ];

    [...northBgBuildings, ...southBuildings, ...westEndBuildings, ...eastEndBuildings].forEach(([h, w, d, c, bx, bz, ry]) => {
      nycGroup.add(makeBgSkyscraper(h, w, d, c, bx, bz, ry || 0));
    });

    // City Street End Arch / Overpass Bridges (West & East ends)
    [-132, 132].forEach(x => {
      const overpassGroup = new THREE.Group();
      const pillarMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5 });
      const bridgeMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4 });
      const trainMat  = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.8, roughness: 0.2 });

      // Pillars on side of road
      [-11, 11].forEach(pz => {
        const pillar = new THREE.Mesh(new THREE.BoxGeometry(2.5, 9.0, 2.5), pillarMat);
        pillar.position.set(0, 4.5, pz);
        overpassGroup.add(pillar);
      });

      // Bridge Deck
      const deck = new THREE.Mesh(new THREE.BoxGeometry(4.0, 1.8, 28), bridgeMat);
      deck.position.set(0, 9.0, 0);
      overpassGroup.add(deck);

      // Decorative Subway Train on top
      const train = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.2, 22), trainMat);
      train.position.set(0, 11.0, 0);
      overpassGroup.add(train);

      overpassGroup.position.set(x, 0, 0);
      nycGroup.add(overpassGroup);
    });

    // ═══ ZEBRA CROSSINGS ═══════════════════════════════════════════════════════
    [-90, -60, -30, 0, 30, 60, 90].forEach(zx => {
      for (let i = -8; i <= 8; i += 2.2) {
        const stripe = new THREE.Mesh(
          new THREE.PlaneGeometry(1.2, 1.6),
          new THREE.MeshBasicMaterial({ color: 0xe2e8f0 })
        );
        stripe.rotation.x = -Math.PI / 2;
        stripe.position.set(zx, 0.015, i);
        nycGroup.add(stripe);
      }
    });

    // ═══ DASHED WHITE LANE LINES ══════════════════════════════════════════════
    for (let dx = -130; dx <= 130; dx += 4) {
      const dash = new THREE.Mesh(
        new THREE.PlaneGeometry(2.0, 0.15),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(dx, 0.012, 4);
      nycGroup.add(dash);
      const dash2 = dash.clone();
      dash2.position.set(dx, 0.012, -4);
      nycGroup.add(dash2);
    }

    // ═══ FIRE HYDRANTS ════════════════════════════════════════════════════════
    [-105, -55, -5, 55, 105].forEach(x => {
      const hydrant = makeFireHydrant();
      hydrant.position.set(x, 0, 11);
      nycGroup.add(hydrant);
    });

    // ═══ BENCHES (along south sidewalk) ════════════════════════════════════════
    [-85, -35, 15, 65, 115].forEach(x => {
      const bench = makeBench();
      bench.position.set(x, 0, 14);
      bench.rotation.y = Math.PI;
      nycGroup.add(bench);
    });

    // ═══ COLORFUL BALLOON CLUSTERS ════════════════════════════════════════════
    [-75, -25, 30, 80].forEach(x => {
      nycGroup.add(makeBalloonCluster(x, 5.2, -15.5));
    });
    // Balloons near south sidewalk lamp posts
    [-100, 0, 60, 120].forEach(x => {
      nycGroup.add(makeBalloonCluster(x, 4.8, 12.5));
    });

    // ═══ FLOWERS & BUSHES (south sidewalk) ════════════════════════════════════
    const flowerColors = [0xef4444, 0xf59e0b, 0xec4899, 0xffffff, 0xa855f7, 0x22c55e];
    for (let i = 0; i < 55; i++) {
      const x = -125 + Math.random() * 250;
      const z = 18 + Math.random() * 8;
      const bush = new THREE.Mesh(
        new THREE.SphereGeometry(0.5 + Math.random() * 0.5, 8, 6),
        new THREE.MeshLambertMaterial({ color: 0x2d7a3a })
      );
      bush.position.set(x, 0.4, z);
      bush.scale.y = 0.7;
      bush.castShadow = true;
      nycGroup.add(bush);

      // Multiple flowers per bush
      const fCount = 1 + Math.floor(Math.random() * 3);
      for (let f = 0; f < fCount; f++) {
        const flower = new THREE.Mesh(
          new THREE.SphereGeometry(0.1 + Math.random() * 0.08, 6, 5),
          new THREE.MeshBasicMaterial({ color: flowerColors[Math.floor(Math.random() * flowerColors.length)] })
        );
        flower.position.set(
          x + (Math.random() - 0.5) * 0.8,
          0.75 + Math.random() * 0.3,
          z + (Math.random() - 0.5) * 0.8
        );
        nycGroup.add(flower);
      }
    }

    // ═══ TREES (along both sides, denser) ═════════════════════════════════════
    [-120, -110, -95, -70, 70, 90, 105, 115, 125].forEach(x => {
      const tree = makePineTree();
      tree.position.set(x, 0, 20);
      tree.scale.setScalar(0.7 + Math.random() * 0.4);
      nycGroup.add(tree);
    });
    // Some trees on north side too (between bg skyscrapers)
    [-100, -40, 20, 80, 120].forEach(x => {
      const tree = makePineTree();
      tree.position.set(x, 0, -35);
      tree.scale.setScalar(0.9 + Math.random() * 0.5);
      nycGroup.add(tree);
    });

    // ═══ TRAFFIC LIGHTS (at crossings) ════════════════════════════════════════
    [-90, -30, 30, 90].forEach(x => {
      const tlGroup = new THREE.Group();
      const poleMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.7, roughness: 0.3 });
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 4.0, 6), poleMat);
      pole.position.y = 2.0;
      tlGroup.add(pole);
      // Signal box
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.0, 0.3),
        new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 }));
      box.position.set(0, 4.2, 0);
      tlGroup.add(box);
      // Lights (red, yellow, green)
      [{ y: 4.5, c: 0xef4444 }, { y: 4.2, c: 0xf59e0b }, { y: 3.9, c: 0x22c55e }].forEach(({ y, c }) => {
        const light = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshBasicMaterial({ color: c }));
        light.position.set(0, y, 0.16);
        tlGroup.add(light);
      });
      tlGroup.position.set(x + 2, 0, 10.5);
      nycGroup.add(tlGroup);
    });

    // ═══ TRASH CANS ═══════════════════════════════════════════════════════════
    [-70, -20, 30, 80].forEach(x => {
      const canGroup = new THREE.Group();
      const canMat = new THREE.MeshStandardMaterial({ color: 0x374151, roughness: 0.6, metalness: 0.3 });
      const can = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.22, 0.7, 8), canMat);
      can.position.y = 0.35;
      canGroup.add(can);
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.06, 8), canMat);
      lid.position.y = 0.72;
      canGroup.add(lid);
      canGroup.position.set(x, 0, 13);
      nycGroup.add(canGroup);
    });

    this.scene.add(nycGroup);
  }

  // ─── 2. Build 6 Detailed Room Interiors (Indoor Levels) ─────────────────────
  private buildRoomInteriors() {
    Object.values(ROOMS).forEach(room => {
      const rGroup = new THREE.Group();
      const cx = room.spawnPos.x;
      const cz = 0; // Room center Z

      // Room Enclosure (Walls & Floor Box)
      const floorMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4 });
      const wallMat  = new THREE.MeshStandardMaterial({ color: room.buildingColor, roughness: 0.7 });

      // Floor (18 x 18 interior)
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(24, 24), floorMat);
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(cx, 0.01, cz);
      floor.receiveShadow = true;
      rGroup.add(floor);

      // Back & Side Walls
      const backWall = new THREE.Mesh(new THREE.BoxGeometry(24, 8, 0.5), wallMat);
      backWall.position.set(cx, 4, cz - 12);
      rGroup.add(backWall);

      const lWall = new THREE.Mesh(new THREE.BoxGeometry(0.5, 8, 24), wallMat);
      lWall.position.set(cx - 12, 4, cz);
      rGroup.add(lWall);

      const rWall = new THREE.Mesh(new THREE.BoxGeometry(0.5, 8, 24), wallMat);
      rWall.position.set(cx + 12, 4, cz);
      rGroup.add(rWall);

      // Front Wall with Exit Door
      const frontWallL = new THREE.Mesh(new THREE.BoxGeometry(10, 8, 0.5), wallMat);
      frontWallL.position.set(cx - 7, 4, cz + 12);
      const frontWallR = new THREE.Mesh(new THREE.BoxGeometry(10, 8, 0.5), wallMat);
      frontWallR.position.set(cx + 7, 4, cz + 12);
      rGroup.add(frontWallL, frontWallR);

      // Glowing Exit Door Portal
      const exitDoorMat = new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.85 });
      const exitDoor = new THREE.Mesh(new THREE.BoxGeometry(3.6, 4.2, 0.2), exitDoorMat);
      exitDoor.position.set(cx, 2.1, cz + 12);
      rGroup.add(exitDoor);

      // Floating Exit Sign
      const exitSign = makeSignSprite('🚪 Exit to NYC Street', 'rgba(225, 29, 72, 0.9)');
      exitSign.scale.set(4.2, 1.05, 1);
      exitSign.position.set(cx, 2.5, cz + 11.2);
      rGroup.add(exitSign);

      // Warm Room Ceiling Light
      const roomLight = new THREE.PointLight(0xfff7ed, 1.6, 30);
      roomLight.position.set(cx, 7, cz);
      rGroup.add(roomLight);

      // Room Title Banner inside room
      const roomTitleSign = makeSignSprite(`${room.icon} ${room.name}`, 'rgba(15, 23, 42, 0.95)');
      roomTitleSign.scale.set(7, 1.75, 1);
      roomTitleSign.position.set(cx, 6.5, cz - 11.5);
      rGroup.add(roomTitleSign);

      // Specific Thematic Interior Furniture based on room ID
      if (room.id === 'coffee_shop') {
        // Coffee Bar Counter & Stools
        const counter = new THREE.Mesh(new THREE.BoxGeometry(10, 1.2, 2.5), new THREE.MeshStandardMaterial({ color: 0x78350f }));
        counter.position.set(cx, 0.6, cz - 6);
        counter.castShadow = true;
        rGroup.add(counter);

        // Cafe Tables
        [-4, 4].forEach(tx => {
          const table = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 1.0, 12), new THREE.MeshStandardMaterial({ color: 0x92400e }));
          table.position.set(cx + tx, 0.5, cz + 2);
          table.castShadow = true;
          rGroup.add(table);
        });
      } else if (room.id === 'library') {
        // Bookshelves along walls
        [-8, 8].forEach(bx => {
          const shelf = new THREE.Mesh(new THREE.BoxGeometry(2, 6, 12), new THREE.MeshStandardMaterial({ color: 0x451a03 }));
          shelf.position.set(cx + bx, 3, cz - 4);
          shelf.castShadow = true;
          rGroup.add(shelf);
        });
        // Reading Table
        const desk = new THREE.Mesh(new THREE.BoxGeometry(8, 1.1, 4), new THREE.MeshStandardMaterial({ color: 0x78350f }));
        desk.position.set(cx, 0.55, cz + 2);
        desk.castShadow = true;
        rGroup.add(desk);
      } else if (room.id === 'speaking_club') {
        // Stage & Circle Chairs
        const stage = new THREE.Mesh(new THREE.BoxGeometry(10, 0.4, 4), new THREE.MeshStandardMaterial({ color: 0x1d4ed8 }));
        stage.position.set(cx, 0.2, cz - 8);
        rGroup.add(stage);

        const chairMat = new THREE.MeshStandardMaterial({ color: 0x3b82f6 });
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
          const chair = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), chairMat);
          chair.position.set(cx + Math.cos(a) * 5, 0.55, cz + Math.sin(a) * 5);
          rGroup.add(chair);
        }
      } else if (room.id === 'cinema') {
        // Dark outer frame of cinema screen
        const frameMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.8 });
        const frameMesh = new THREE.Mesh(new THREE.BoxGeometry(16.4, 9.4, 0.3), frameMat);
        frameMesh.position.set(cx, 4.5, cz - 11.6);
        rGroup.add(frameMesh);

        // Native 3D Video Texture Screen (Fixed on wall, zero tracking, zero UI buttons)
        const video = document.createElement('video');
        video.src = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4';
        video.crossOrigin = 'anonymous';
        video.loop = true;
        video.muted = true;
        video.playsInline = true;
        video.autoplay = true;

        video.play().catch(() => {
          const unlockVideo = () => {
            video.play().catch(() => {});
          };
          window.addEventListener('click', unlockVideo, { once: true });
          window.addEventListener('touchstart', unlockVideo, { once: true });
        });

        const videoTex = new THREE.VideoTexture(video);
        videoTex.colorSpace = THREE.SRGBColorSpace;
        videoTex.minFilter = THREE.LinearFilter;
        videoTex.magFilter = THREE.LinearFilter;

        const screenMat = new THREE.MeshBasicMaterial({ map: videoTex, side: THREE.DoubleSide });
        const screenMesh = new THREE.Mesh(new THREE.PlaneGeometry(16, 9), screenMat);
        screenMesh.position.set(cx, 4.5, cz - 11.4);
        rGroup.add(screenMesh);

        // Cinema Seats Rows
        for (let row = -2; row <= 4; row += 3) {
          for (let seat = -7; seat <= 7; seat += 2.5) {
            const chair = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.2, 1.2), new THREE.MeshStandardMaterial({ color: 0xb91c1c }));
            chair.position.set(cx + seat, 0.6, cz + row);
            rGroup.add(chair);
          }
        }
      } else if (room.id === 'game_zone') {
        // Arcade Machines
        const arcadeMat = new THREE.MeshStandardMaterial({ color: 0xd946ef });
        [-7, -3, 3, 7].forEach(ax => {
          const cabinet = new THREE.Mesh(new THREE.BoxGeometry(1.8, 4.2, 2), arcadeMat);
          cabinet.position.set(cx + ax, 2.1, cz - 8);
          rGroup.add(cabinet);
        });
      } else if (room.id === 'office') {
        // Reception Desk
        const recDesk = new THREE.Mesh(new THREE.BoxGeometry(8, 1.3, 2.5), new THREE.MeshStandardMaterial({ color: 0x334155 }));
        recDesk.position.set(cx, 0.65, cz - 5);
        rGroup.add(recDesk);
      }

      this.scene.add(rGroup);
    });
  }

  private spawnLocal() {
    const isGirl = this.gender === 'girl';
    const hash = [...(this.name || 'lu')].reduce((a, ch) => a + ch.charCodeAt(0), 0);
    const shirt = (isGirl ? GIRL_SHIRTS : BOY_SHIRTS)[hash % 5];
    const hair  = HAIRS[hash % 5];
    const skin  = SKINS[hash % 4];

    this.localChar = makeCharacter(shirt, hair, skin, this.gender);
    this.localChar.position.copy(this.pos);

    const lbl = makeLabel(this.name || 'lu');
    lbl.position.y = 2.6;
    this.localChar.add(lbl);

    this.scene.add(this.localChar);
  }

  private addRemote(data: PlayerData) {
    if (!this.isReady) { this.pending.push(data); return; }
    if (this.remotes.has(data.id)) { this.updateRemote(data.id, data.x, data.y, data.currentRoom); return; }

    const remoteGender = (data as any).gender || (data.name.length % 2 === 0 ? 'girl' : 'boy');
    const isGirl = remoteGender === 'girl';
    const hash = [...data.name].reduce((a, ch) => a + ch.charCodeAt(0), 0);
    const shirt = (isGirl ? GIRL_SHIRTS : BOY_SHIRTS)[hash % 5];
    const hair  = HAIRS[hash % 5];
    const skin  = SKINS[hash % 4];

    const char = makeCharacter(shirt, hair, skin, remoteGender);
    char.position.set(data.x, 0, data.y);

    const lbl = makeLabel(data.name);
    lbl.position.y = 2.6;
    char.add(lbl);

    this.scene.add(char);

    const cleanup = onParticipantSpeaking(data.name, (speaking) => {
      char.scale.setScalar(speaking ? 1.08 : 1.0);
    });

    this.remotes.set(data.id, { group: char, data, cleanup });
    this.updateRemoteVisibility(data.id, data.currentRoom || 'outdoor');
  }

  private updateRemote(id: string, x: number, y: number, currentRoom?: string, facing?: string) {
    const r = this.remotes.get(id);
    if (!r) return;

    r.data.x = x; r.data.y = y;
    if (currentRoom) r.data.currentRoom = currentRoom;

    // Smooth position interpolation
    r.group.position.x += (x - r.group.position.x) * 0.25;
    r.group.position.z += (y - r.group.position.z) * 0.25;

    // Apply the exact camera angle the remote player is looking at
    // facing is the camAngle they transmitted — this is the direction THEY look
    // We need to flip it 180° so their character faces TOWARD us
    if (facing !== undefined) {
      const remoteAngle = parseFloat(facing);
      if (!isNaN(remoteAngle)) {
        // The remote player's camAngle is where their camera looks FROM behind
        // Their character body faces opposite to camAngle direction
        const targetAngle = remoteAngle + Math.PI;
        // Smooth rotation
        let curAngle = r.group.rotation.y;
        let diff = targetAngle - curAngle;
        while (diff > Math.PI)  diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        r.group.rotation.y = curAngle + diff * 0.2;
      }
    }

    this.updateRemoteVisibility(id, r.data.currentRoom || 'outdoor');
  }

  private updateRemoteVisibility(id: string, remoteRoom: string) {
    const r = this.remotes.get(id);
    if (!r) return;
    const sameRoom = (remoteRoom === this.currentRoom);
    r.group.visible = sameRoom;
  }

  private removeRemote(id: string) {
    const r = this.remotes.get(id);
    if (!r) return;
    r.cleanup?.();
    this.scene.remove(r.group);
    this.remotes.delete(id);
  }

  private bindSocket() {
    this.socket.on('playersState', (players: PlayerData[]) =>
      players.forEach(p => { if (p.id !== this.socket.id) this.addRemote(p); })
    );
    this.socket.on('playerJoined', (p: PlayerData) => {
      if (p.id !== this.socket.id) this.addRemote(p);
    });
    this.socket.on('playerMoved', (d: MovePayload) => this.updateRemote(d.id, d.x, d.y, d.currentRoom, d.facing));
    this.socket.on('playerLeft',  (id: string)     => this.removeRemote(id));
  }

  // Left joystick: forward/backward movement
  public touchVector = { x: 0, z: 0 };
  // Right joystick: camera rotation (x = turn angle, y = pitch)
  public rightStick  = { x: 0, y: 0 };
  // Physics velocity vector (world-space)
  private velocity   = new THREE.Vector3(0, 0, 0);

  private bindInput() {
    window.addEventListener('keydown', e => {
      this.keys[e.key.toLowerCase()] = true;
    });
    window.addEventListener('keyup', e => { this.keys[e.key.toLowerCase()] = false; });

    this.renderer.domElement.addEventListener('mousedown', e => {
      this.isDragging = true;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    });
    window.addEventListener('mouseup', () => { this.isDragging = false; });
    window.addEventListener('mousemove', e => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.lastMouseX;
      this.camAngle -= dx * 0.005;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    });

    // Touch controls for mobile camera rotation (left/right only)
    let touchId: number | null = null;
    let lastTouchX = 0;

    window.addEventListener('touchstart', (e: TouchEvent) => {
      if (e.touches.length > 0) {
        const t = e.touches[e.touches.length - 1];
        if ((e.target as HTMLElement)?.closest('.hud-card, .mic-btn, .exit-room-btn, .mobile-controls')) return;
        touchId = t.identifier;
        lastTouchX = t.clientX;
      }
    }, { passive: true });

    window.addEventListener('touchmove', (e: TouchEvent) => {
      if (touchId === null) return;
      for (let i = 0; i < e.touches.length; i++) {
        const t = e.touches[i];
        if (t.identifier === touchId) {
          const dx = t.clientX - lastTouchX;
          this.camAngle -= dx * 0.007;
          lastTouchX = t.clientX;
          break;
        }
      }
    }, { passive: true });

    window.addEventListener('touchend', (e: TouchEvent) => {
      if (touchId !== null) {
        let active = false;
        for (let i = 0; i < e.touches.length; i++) {
          if (e.touches[i].identifier === touchId) active = true;
        }
        if (!active) touchId = null;
      }
    }, { passive: true });
  }

  private loop() {
    this.animId = requestAnimationFrame(() => this.loop());
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.update(dt);
    if (this.composer && !this.isMobile) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  private update(dt: number) {
    this.clouds.forEach(c => {
      c.position.x += (c as any).speed * dt;
      if (c.position.x > 220) c.position.x = -220;
    });

    const t = performance.now() * 0.002;
    const c2 = this.localChar as any;
    if (c2 && c2.headMesh) c2.headMesh.position.y = 1.72 + Math.sin(t) * 0.02;

    this.movePlayer(dt);
    this.checkDoorTransitions();
    this.updateCamera();
    this.animateRemotes(dt);

    // ── Proximity volume — update EVERY frame for instant voice trigger ──
    this.updateProximityVolumes();
    this.updateCoffeeShopAudio();

    const now = performance.now();
    if (now - this.lastEmit >= EMIT_INTERVAL) {
      this.lastEmit = now;
      // Send camAngle as facing so remote players can rotate to match
      emitMove(this.socket, {
        x: this.pos.x,
        y: this.pos.z,
        currentRoom: this.currentRoom,
        facing: String(this.camAngle),
      });
    }
  }

  private checkDoorTransitions() {
    const now = performance.now();
    if (now - this.lastDoorCooldown < 1500) return; // Prevent spam teleporting

    if (this.currentRoom === 'outdoor') {
      // Check if player walked up to any building entrance door
      Object.values(ROOMS).forEach(room => {
        const dx = this.pos.x - room.entrancePos.x;
        const dz = this.pos.z - room.entrancePos.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist < 2.4) {
          // Teleport inside room level!
          this.currentRoom = room.id;
          this.pos.set(room.spawnPos.x, 0, room.spawnPos.z);
          this.localChar.position.copy(this.pos);
          this.lastDoorCooldown = now;

          this.roomChangeCallback?.(room.id, room.name);
          emitMove(this.socket, { x: this.pos.x, y: this.pos.z, currentRoom: this.currentRoom });
        }
      });
    } else {
      // Inside a room level — check if player walked up to Exit Door
      const room = ROOMS[this.currentRoom];
      if (room) {
        const dx = this.pos.x - room.exitDoorPos.x;
        const dz = this.pos.z - room.exitDoorPos.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist < 2.4) {
          // Teleport back out to NYC Street!
          this.currentRoom = 'outdoor';
          this.pos.set(room.entrancePos.x, 0, room.entrancePos.z + 4);
          this.localChar.position.copy(this.pos);
          this.lastDoorCooldown = now;

          this.roomChangeCallback?.('outdoor', 'New York City Campus 🗽');
          emitMove(this.socket, { x: this.pos.x, y: this.pos.z, currentRoom: this.currentRoom });
        }
      }
    }
  }

  private movePlayer(dt: number) {
    const k = this.keys;

    // ── Right joystick / keyboard: rotate camera left/right ───────────────────
    if (Math.abs(this.rightStick.x) > 0.04) {
      this.camAngle -= this.rightStick.x * dt * 2.8;
    }
    if (k['q']) this.camAngle += dt * 2.0;
    if (k['e']) this.camAngle -= dt * 2.0;

    // ── Forward direction = where camera looks ─────────────────────────────────
    // camAngle: 0 = looking toward -Z,  PI = looking toward +Z
    const sinA = Math.sin(this.camAngle);
    const cosA = Math.cos(this.camAngle);

    // fwd: direction camera faces
    const fwdX = -sinA;
    const fwdZ = -cosA;
    // right: 90° clockwise from fwd
    const rightX =  cosA;
    const rightZ = -sinA;

    // ── Raw input from joystick + keyboard ────────────────────────────────────
    const fwdInput  = (k['w'] || k['arrowup']    ? 1 : 0)
                    - (k['s'] || k['arrowdown']  ? 1 : 0)
                    + this.touchVector.z;  // joystick up = positive z = forward

    const sideInput = (k['d'] || k['arrowright'] ? 1 : 0)
                    - (k['a'] || k['arrowleft']  ? 1 : 0)
                    + this.touchVector.x;  // joystick right = positive x = strafe right

    // ── Build move vector in world space ──────────────────────────────────────
    let mx = fwdInput * fwdX + sideInput * rightX;
    let mz = fwdInput * fwdZ + sideInput * rightZ;

    const len = Math.sqrt(mx * mx + mz * mz);
    if (len > 0.001) {
      // Normalize so diagonal isn't faster, then scale by speed
      const speed = MOVE_SPEED * 60 * dt;
      mx = (mx / len) * speed;
      mz = (mz / len) * speed;

      this.pos.x += mx;
      this.pos.z += mz;

      // Face the direction of movement
      this.facing = Math.atan2(mx, mz);
      this.localChar.rotation.y = this.facing;

      // ── Walk animation ──────────────────────────────────────────────────────
      const c = this.localChar as any;
      const swing = Math.sin(performance.now() * 0.01) * 0.55;
      if (c.lArmGroup) c.lArmGroup.rotation.x = -swing;
      if (c.rArmGroup) c.rArmGroup.rotation.x =  swing;
      if (c.lLegGroup) c.lLegGroup.rotation.x =  swing;
      if (c.rLegGroup) c.rLegGroup.rotation.x = -swing;
    } else {
      // Idle: dampen limbs
      const c = this.localChar as any;
      if (c.lArmGroup) c.lArmGroup.rotation.x *= 0.85;
      if (c.rArmGroup) c.rArmGroup.rotation.x *= 0.85;
      if (c.lLegGroup) c.lLegGroup.rotation.x *= 0.85;
      if (c.rLegGroup) c.rLegGroup.rotation.x *= 0.85;
    }

    // ── Boundary constraints ──────────────────────────────────────────────────
    if (this.currentRoom === 'outdoor') {
      this.pos.x = Math.max(-130, Math.min(130, this.pos.x));
      this.pos.z = Math.max(-25,  Math.min(30,  this.pos.z));
    } else {
      const room = ROOMS[this.currentRoom];
      if (room) {
        this.pos.x = Math.max(room.spawnPos.x - 11, Math.min(room.spawnPos.x + 11, this.pos.x));
        this.pos.z = Math.max(-11, Math.min(13, this.pos.z));
      }
    }

    this.localChar.position.copy(this.pos);
  }

  private updateCamera() {
    // Strictly 1st Person View (FPS Perspective)
    this.localChar.visible = false;
    const eyeY = 1.72;
    const camX = this.pos.x;
    const camY = this.pos.y + eyeY;
    const camZ = this.pos.z;

    this.camera.position.set(camX, camY, camZ);

    // Look direction in front of player eyes (strictly horizontal - left & right turn only)
    const lookX = camX - Math.sin(this.camAngle) * 10;
    const lookY = camY;
    const lookZ = camZ - Math.cos(this.camAngle) * 10;

    this.camera.lookAt(lookX, lookY, lookZ);
  }

  private animateRemotes(dt: number) {
    const t = performance.now() * 0.002;
    this.remotes.forEach(r => {
      this.updateRemoteVisibility(r.data.id, r.data.currentRoom || 'outdoor');
      if (r.group.visible) {
        const c = r.group as any;
        if (c && c.headMesh) c.headMesh.position.y = 1.72 + Math.sin(t) * 0.02;

        // Walk animation based on movement speed
        const dx = r.data.x - r.group.position.x;
        const dz = r.data.y - r.group.position.z;
        const isMoving = Math.sqrt(dx * dx + dz * dz) > 0.08;
        if (isMoving) {
          const swing = Math.sin(performance.now() * 0.01) * 0.55;
          if (c.lArmGroup) c.lArmGroup.rotation.x = -swing;
          if (c.rArmGroup) c.rArmGroup.rotation.x =  swing;
          if (c.lLegGroup) c.lLegGroup.rotation.x =  swing;
          if (c.rLegGroup) c.rLegGroup.rotation.x = -swing;
        } else {
          if (c.lArmGroup) c.lArmGroup.rotation.x *= 0.8;
          if (c.rArmGroup) c.rArmGroup.rotation.x *= 0.8;
          if (c.lLegGroup) c.lLegGroup.rotation.x *= 0.8;
          if (c.rLegGroup) c.rLegGroup.rotation.x *= 0.8;
        }
      }
    });
  }

  private updateProximityVolumes() {
    this.remotes.forEach(r => {
      const sameRoom = ((r.data.currentRoom || 'outdoor') === this.currentRoom);
      if (!sameRoom) {
        setProximityVolume(r.data.name, 9999); // effectively mute (beyond PROXIMITY_MAX)
        return;
      }
      // Use the INTERPOLATED visual position (group.position) for accurate,
      // smooth proximity — not the raw network data which can lag behind
      const dx = r.group.position.x - this.pos.x;
      const dz = r.group.position.z - this.pos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      setProximityVolume(r.data.name, dist);
    });
  }

  private updateCoffeeShopAudio() {
    if (typeof window === 'undefined') return;

    if (!this.coffeeShopAudio) {
      // Soft, gentle lounge blues / jazz track
      this.coffeeShopAudio = new Audio('https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3');
      this.coffeeShopAudio.loop = true;
      this.coffeeShopAudio.volume = 0.25; // 25% volume - gentle & audible background
    }

    if (this.currentRoom === 'coffee_shop') {
      if (this.coffeeShopAudio.paused) {
        const promise = this.coffeeShopAudio.play();
        if (promise !== undefined) {
          promise.catch(() => {
            const resumeAudio = () => {
              if (this.currentRoom === 'coffee_shop' && this.coffeeShopAudio) {
                this.coffeeShopAudio.play().catch(() => {});
              }
            };
            window.addEventListener('click', resumeAudio, { once: true });
            window.addEventListener('keydown', resumeAudio, { once: true });
            window.addEventListener('touchstart', resumeAudio, { once: true });
          });
        }
      }
    } else {
      if (this.coffeeShopAudio && !this.coffeeShopAudio.paused) {
        this.coffeeShopAudio.pause();
      }
    }
  }

  public setLocalSpeaking(speaking: boolean) {
    this.localChar.scale.setScalar(speaking ? 1.06 : 1.0);
  }

  public destroy() {
    if (this.coffeeShopAudio) {
      this.coffeeShopAudio.pause();
      this.coffeeShopAudio = null;
    }
    cancelAnimationFrame(this.animId);
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.socket.off('playersState');
    this.socket.off('playerJoined');
    this.socket.off('playerMoved');
    this.socket.off('playerLeft');
  }
}
