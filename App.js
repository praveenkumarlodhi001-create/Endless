import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { GLView } from 'expo-gl';
import { Accelerometer, DeviceMotion } from 'expo-sensors';
import * as Haptics from 'expo-haptics';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as Speech from 'expo-speech';
import * as THREE from 'three';
import AsyncStorage from '@react-native-async-storage/async-storage';

// =====================================================================
//  NODERRA RUSH  -  endless 3D traffic racer
//  Road ka left half (x < 0) = saamne se aati traffic (wrong way, x2 score)
//  Road ka right half (x > 0) = aapki direction ki traffic
// =====================================================================

const SAVE_KEY = 'noderra_rush_save_v1';

const KMH = 0.2; // 1 km/h = 0.2 world units / second
const LANES = 4;
const LANE_W = 2.4;
const ROAD_HALF = (LANES * LANE_W) / 2; // 4.8
const laneX = (i) => (i - 1.5) * LANE_W;

// Tilt settings
const DEAD_DEG = 5; // dead zone (pehle 3 tha, ab halki hilne par steering nahi hoti)
// speed (km/h): normal 20 -> 130, boost 150 -> 220 (vehicle ke hisaab se cap)
const NORMAL_START = 30;
const NORMAL_TOP = 160;
const BOOST_TOP = 300;
const ACCEL_MUL = 1.3;
const normalMaxFor = (V) => Math.min(NORMAL_TOP, 25 + (V.maxKmh - 25) * 0.82);
const boostTopFor = (V) => {
  const n = normalMaxFor(V);
  return Math.min(BOOST_TOP, Math.max(n + 20, n + 20 + (V.maxKmh - 48) * 0.45));
};
// har gaadi ka unlock target: ek hi run me itni speed + itne near misses
const goalFor = (V) => {
  const i = VEHICLES.indexOf(V);
  return { kmh: Math.round((boostTopFor(V) * 0.85) / 5) * 5, near: Math.min(30, 4 + i * 2), reward: Math.max(100, Math.round(V.price * 0.25)) };
};
const FULL_DEG = { low: 55, med: 40, high: 30 }; // is angle par full steering

const C = {
  bg: '#0b1220',
  card: '#121a2b',
  line: '#1f2a44',
  text: '#f8fafc',
  muted: '#94a3b8',
  accent: '#ff7a18',
  cyan: '#22d3ee',
  good: '#22c55e',
  bad: '#ef4444',
  gold: '#fbbf24',
};

// ---------- Vehicles (apne original designs, kisi brand ke nahi) ----------
const VEHICLES = [
  { id: 'cycle', name: 'City Cycle', tag: 'CYCLE', kind: 'cycle', color: '#2dd4bf', level: 1, price: 0, maxKmh: 55, accel: 0.7, handling: 10, armor: 1.5, len: 1.8, hw: 0.35, stars: { s: 1, h: 7, a: 1 } },
  { id: 'street', name: 'Street 150', tag: 'BIKE', kind: 'bike', style: 'street', color: '#ef4444', level: 2, price: 300, maxKmh: 95, accel: 0.9, handling: 9, armor: 1.35, len: 2.0, hw: 0.4, stars: { s: 2, h: 8, a: 2 } },
  { id: 'cruiser', name: 'Thunder 350', tag: 'CRUISER', kind: 'bike', style: 'cruiser', color: '#334155', level: 4, price: 700, maxKmh: 110, accel: 0.7, handling: 7, armor: 1.2, len: 2.3, hw: 0.45, stars: { s: 3, h: 5, a: 3 } },
  { id: 'naked', name: 'Naked 400', tag: 'STREET BIKE', kind: 'bike', style: 'naked', color: '#f97316', level: 6, price: 1200, maxKmh: 135, accel: 1.1, handling: 9, armor: 1.25, len: 2.1, hw: 0.4, stars: { s: 4, h: 8, a: 2 } },
  { id: 'sport', name: 'Sport R600', tag: 'SUPERBIKE', kind: 'bike', style: 'sport', color: '#22c55e', level: 8, price: 2000, maxKmh: 165, accel: 1.2, handling: 8, armor: 1.2, len: 2.2, hw: 0.42, stars: { s: 6, h: 7, a: 2 } },
  { id: 'hatch', name: 'Hatch GT', tag: 'CAR', kind: 'car', color: '#3b82f6', level: 10, price: 2800, maxKmh: 145, accel: 0.9, handling: 7, armor: 0.9, len: 3.8, hw: 0.85, car: { w: 1.7, l: 3.7, h: 0.62, cabH: 0.6, cabL: 2.0, cabZ: 0.25, wheelR: 0.34 }, stars: { s: 5, h: 6, a: 5 } },
  { id: 'sedan', name: 'Sedan LX', tag: 'SEDAN', kind: 'car', color: '#94a3b8', level: 11, price: 3400, maxKmh: 160, accel: 0.9, handling: 7, armor: 0.8, len: 4.5, hw: 0.9, car: { w: 1.8, l: 4.5, h: 0.64, cabH: 0.6, cabL: 2.3, cabZ: 0.2, wheelR: 0.36, chrome: true }, stars: { s: 5, h: 6, a: 6 } },
  { id: 'coupe', name: 'Coupe S', tag: 'SPORTS CAR', kind: 'car', color: '#a855f7', level: 12, price: 4000, maxKmh: 185, accel: 1.1, handling: 7, armor: 0.85, len: 4.3, hw: 0.9, car: { w: 1.85, l: 4.3, h: 0.5, cabH: 0.5, cabL: 1.9, cabZ: 0.3, wheelR: 0.35, fast: true, spoiler: true, roof: '#111827' }, stars: { s: 7, h: 7, a: 5 } },
  { id: 'adv', name: 'Trail 500 ADV', tag: 'ADVENTURE BIKE', kind: 'bike', style: 'adv', color: '#f59e0b', level: 13, price: 4600, maxKmh: 150, accel: 1.0, handling: 7, armor: 1.0, len: 2.4, hw: 0.46, stars: { s: 5, h: 7, a: 4 } },
  { id: 'suv', name: 'Roadmaster SUV', tag: 'BIG CAR', kind: 'car', color: '#475569', level: 14, price: 5500, maxKmh: 175, accel: 0.8, handling: 5, armor: 0.55, len: 4.7, hw: 1.0, car: { w: 2.0, l: 4.7, h: 0.95, cabH: 0.7, cabL: 2.9, cabZ: 0.35, wheelR: 0.48, rack: true }, stars: { s: 7, h: 4, a: 9 } },
  { id: 'rally', name: 'Rally GT-R', tag: 'RALLY CAR', kind: 'car', color: '#2563eb', level: 16, price: 6800, maxKmh: 195, accel: 1.2, handling: 9, armor: 0.85, len: 3.9, hw: 0.9, car: { w: 1.78, l: 3.9, h: 0.6, cabH: 0.56, cabL: 2.0, cabZ: 0.3, wheelR: 0.37, spoiler: true, scoop: true, flares: true, stripe: '#f8fafc', roof: '#111827' }, stars: { s: 7, h: 9, a: 4 } },
  { id: 'super', name: 'Apex Super', tag: 'SUPERCAR', kind: 'car', color: '#facc15', level: 17, price: 8000, maxKmh: 250, accel: 1.4, handling: 8, armor: 0.8, len: 4.4, hw: 0.95, car: { w: 2.0, l: 4.4, h: 0.42, cabH: 0.4, cabL: 1.6, cabZ: 0.35, wheelR: 0.36, fast: true, spoiler: true, roof: '#111827' }, stars: { s: 9, h: 8, a: 4 } },
  { id: 'dune', name: 'Dune Raider 4x4', tag: 'PICKUP TRUCK', kind: 'car', color: '#65a30d', level: 20, price: 10500, maxKmh: 200, accel: 1.0, handling: 5, armor: 0.5, len: 5.1, hw: 1.02, car: { w: 2.05, l: 5.1, h: 1.0, cabH: 0.65, cabL: 2.0, cabZ: -0.55, wheelR: 0.52, bed: true, rack: true }, stars: { s: 7, h: 4, a: 10 } },
  { id: 'hyper', name: 'Viper H1', tag: 'HYPERBIKE', kind: 'bike', style: 'hyper', color: '#a855f7', level: 23, price: 14000, maxKmh: 260, accel: 1.6, handling: 9, armor: 1.15, len: 2.3, hw: 0.44, stars: { s: 9, h: 9, a: 2 } },
  { id: 'muscle', name: 'Muscle V8', tag: 'MUSCLE CAR', kind: 'car', color: '#dc2626', level: 26, price: 17000, maxKmh: 250, accel: 1.3, handling: 6, armor: 0.75, len: 4.9, hw: 0.98, car: { w: 1.9, l: 4.9, h: 0.56, cabH: 0.46, cabL: 1.7, cabZ: 0.8, wheelR: 0.38, scoop: true, duck: true, exhaust: true, stripe: '#f8fafc' }, stars: { s: 9, h: 6, a: 6 } },
  { id: 'volt', name: 'Volt Zero EV', tag: 'ELECTRIC HYPERCAR', kind: 'car', color: '#e5e7eb', level: 30, price: 24000, maxKmh: 290, accel: 1.7, handling: 8, armor: 0.8, len: 4.7, hw: 0.97, car: { w: 1.9, l: 4.7, h: 0.5, cabH: 0.46, cabL: 2.0, cabZ: 0.3, wheelR: 0.37, fast: true, led: true, roof: '#0b1220' }, stars: { s: 10, h: 8, a: 5 } },
  { id: 'phantom', name: 'Phantom GT', tag: 'HYPERCAR', kind: 'car', color: '#18181b', level: 35, price: 32000, maxKmh: 320, accel: 1.8, handling: 9, armor: 0.8, len: 4.6, hw: 1.02, car: { w: 2.05, l: 4.6, h: 0.4, cabH: 0.38, cabL: 1.5, cabZ: 0.45, wheelR: 0.38, fast: true, spoiler: true, flares: true, splitter: true, led: true, exhaust: true, roof: '#111827' }, stars: { s: 10, h: 9, a: 5 } },
];

// ---------- Levels ----------
const xpForLevel = (L) => 75 * L * (L - 1);
const levelFromXp = (xp) => {
  let L = 1;
  while (xp >= xpForLevel(L + 1)) L += 1;
  return L;
};
const levelProgress = (xp) => {
  const level = levelFromXp(xp);
  const a = xpForLevel(level);
  const b = xpForLevel(level + 1);
  return { level, pct: (xp - a) / (b - a), into: Math.floor(xp - a), need: b - a };
};

const DEFAULT_SETTINGS = { sens: 'med', invert: false, voice: true };
const DEFAULT_SAVE = { credits: 0, xp: 0, best: 0, runs: 0, owned: { cycle: true }, selected: 'cycle', settings: DEFAULT_SETTINGS, goals: {}, missions: null, missionsDone: 0, challenge: null, challengesDone: 0 };
const fmt = (n) => String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

const rankFor = (L) =>
  L >= 40 ? 'Rush Legend' : L >= 30 ? 'Road King' : L >= 25 ? 'Speed Legend' : L >= 20 ? 'Turbo Ace' : L >= 15 ? 'Highway Hero' : L >= 10 ? 'Road Hunter' : L >= 5 ? 'Street Racer' : 'Rookie';

// true karne par saare normal missions ke targets x4 ho jaate hain ("sab impossible" mode)
const ALL_IMPOSSIBLE = false;

// ---------- Missions (hamesha 3 active; poora hone par naya aa jata hai, endless) ----------
const MISSION_DEFS = [
  { type: 'near', stat: 'near', total: true, base: 12, step: 8, label: (n) => `Make ${n} near misses` },
  { type: 'dist', stat: 'distKm', total: true, base: 3, step: 2, label: (n) => `Drive ${n} km in total` },
  { type: 'speed', stat: 'topKmh', total: false, base: 90, step: 15, cap: 300, label: (n) => `Reach ${n} km/h in one run` },
  { type: 'score', stat: 'score', total: false, base: 800, step: 600, label: (n) => `Score ${fmt(n)} in one run` },
  { type: 'wrong', stat: 'wrongSec', total: true, base: 20, step: 10, label: (n) => `Drive ${n} sec on the wrong side` },
  { type: 'coins', stat: 'coins', total: true, base: 30, step: 20, label: (n) => `Collect ${n} coins` },
  { type: 'combo', stat: 'maxCombo', total: false, base: 3, step: 0.5, cap: 5, label: (n) => `Reach combo x${n}` },
  { type: 'boost', stat: 'boostSec', total: true, base: 30, step: 15, label: (n) => `Boost for ${n} sec in total` },
  { type: 'runs', stat: 'runs', total: true, base: 3, step: 1, label: (n) => `Finish ${n} runs` },
];
const makeMission = (taken, done) => {
  const free = MISSION_DEFS.filter((d) => !taken.some((m) => m.type === d.type));
  const d = free[Math.floor(Math.random() * free.length)];
  const tier = 1 + Math.floor(done / 3);
  let target = (d.base + d.step * (tier - 1)) * (ALL_IMPOSSIBLE ? 4 : 1);
  if (d.cap && !ALL_IMPOSSIBLE) target = Math.min(d.cap, target);
  target = Math.round(target);
  return { id: `${d.type}${Date.now()}${Math.floor(Math.random() * 1000)}`, type: d.type, target, progress: 0, reward: 80 + tier * 50 };
};
const genMissions = (done) => {
  const out = [];
  while (out.length < 3) out.push(makeMission(out, done));
  return out;
};
const applyMissions = (missions, stats, doneCount) => {
  let reward = 0;
  let done = doneCount;
  const completed = [];
  const kept = [];
  missions.forEach((m) => {
    const def = MISSION_DEFS.find((x) => x.type === m.type);
    if (!def) return;
    const val = stats[def.stat] || 0;
    const progress = def.total ? m.progress + val : Math.max(m.progress, val);
    if (progress >= m.target) {
      reward += m.reward;
      done += 1;
      completed.push(def.label(m.target));
    } else {
      kept.push({ ...m, progress });
    }
  });
  while (kept.length < 3) kept.push(makeMission(kept, done));
  return { missions: kept, completed, reward, done };
};

// ---------- Challenges (bahut kathin; ek hi run me poora karna hai) ----------
const CHALLENGES = [
  { id: 'clean_speed', target: 250, reward: 2500, label: (n) => `Hit ${n} km/h without a single crash`, live: (g) => (g.crashes === 0 ? g.topKmh : 0), stat: (st) => st.cleanTop },
  { id: 'near_run', target: 80, reward: 3000, label: (n) => `Make ${n} near misses in ONE run`, live: (g) => g.near, stat: (st) => st.near },
  { id: 'score_run', target: 40000, reward: 3500, label: (n) => `Score ${fmt(n)} in ONE run`, live: (g) => g.score, stat: (st) => st.score },
  { id: 'dist_run', target: 8, reward: 4000, label: (n) => `Drive ${n} km in ONE run`, live: (g) => g.dist / 1000, stat: (st) => st.distKm },
];
const makeChallenge = (done) => {
  const d = CHALLENGES[done % CHALLENGES.length];
  const lap = Math.floor(done / CHALLENGES.length);
  return { id: d.id, target: Math.round(d.target * (1 + 0.25 * lap) * (ALL_IMPOSSIBLE ? 2 : 1)), best: 0, reward: d.reward * (1 + lap) };
};
// voice taunts (device ki apni Hindi awaaz se bolte hain, koi audio file nahi)
const TAUNTS = [
  { hi: 'तुझसे नहीं हो पाएगा!', en: "YOU CAN'T DO THIS!" },
  { hi: 'खेल ले खेल ले, तू जीत नहीं पाएगा!', en: 'KHEL LE... YOU WILL NOT WIN!' },
  { hi: 'इतना आसान नहीं है, बच्चे!', en: 'NOT THAT EASY, KID!' },
  { hi: 'बस इतना ही दम है तुझमें?', en: 'IS THAT ALL YOU GOT?' },
  { hi: 'हार मान ले, ये तेरे बस की बात नहीं!', en: 'GIVE UP, THIS IS BEYOND YOU!' },
];
const CRASH_TAUNT = { hi: 'हा हा! मैंने कहा था, नहीं हो पाएगा!', en: 'HA HA! TOLD YOU!' };
const WIN_TAUNT = { hi: 'क्या... ये कैसे हो गया? ठीक है, इस बार जीत गया तू!', en: 'WHAT?! HOW?! FINE... YOU WIN THIS ONE' };

// ---------- Traffic ----------
const TRAFFIC = {
  hatch: { len: 3.7, hw: 0.85 },
  sedan: { len: 4.4, hw: 0.9 },
  van: { len: 4.8, hw: 0.95 },
  bus: { len: 8, hw: 1.15 },
  truck: { len: 9.6, hw: 1.15 },
};
const TRAFFIC_COLORS = ['#ef4444', '#3b82f6', '#f8fafc', '#94a3b8', '#facc15', '#10b981', '#f97316', '#6366f1', '#1f2937'];
const LANE_TRAFFIC = [{ tv: 15 }, { tv: 11 }, { frac: 0.6 }, { frac: 0.4 }];
const pickType = (lvl) => {
  const r = Math.random();
  if (lvl >= 7 && r < 0.15) return 'truck';
  if (lvl >= 5 && r < 0.3) return 'bus';
  if (lvl >= 3 && r < 0.5) return 'van';
  return r < 0.75 ? 'hatch' : 'sedan';
};

// Din -> shaam -> raat -> din
const SKY = ['#8ecae6', '#f4a261', '#141b34', '#8ecae6'];
const SKY_C = SKY.map((c) => new THREE.Color(c));
const SKY_LIGHT = [0.85, 0.7, 0.42, 0.85];

// car mode ke on-screen controls ki jagah (root view ke andar, dp me)
const NOZ = [-10, -10, 0, 0];
const padZones = (w, h, portrait) =>
  portrait
    ? {
        gas: NOZ,
        brake: NOZ,
        rev: NOZ,
        boost: [w / 2 - 70, h - 250, 140, 64],
        left: [16, h - 170, w / 2 - 24, 130],
        right: [w / 2 + 8, h - 170, w / 2 - 24, 130],
      }
    : {
        gas: [w - 150, h - 170, 130, 140],
        brake: [w - 290, h - 170, 130, 140],
        boost: [w - 150, h - 250, 130, 70],
        rev: [w - 290, h - 250, 130, 70],
        left: [20, h - 170, 130, 140],
        right: [160, h - 170, 130, 140],
      };
const inZone = (z, x, y) => x >= z[0] && x <= z[0] + z[2] && y >= z[1] && y <= z[1] + z[3];

const buzz = (kind) => {
  try {
    if (kind === 'crash') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  } catch (e) {
    // haptics nahi hai to chalta hai
  }
};

// =====================================================================
//  Tilt sensor (module level, taaki game loop me koi allocation na ho)
// =====================================================================
const tilt = { raw: 0, cal: 0, ok: null, got: false, land: false };
const SENSOR_SIGN = Platform.OS === 'android' ? 1 : -1;
// phone portrait me steering-wheel ki tarah ghumaya: gravity ke x/y se roll angle
const feedTilt = (x, y) => {
  if (typeof x !== 'number' || typeof y !== 'number') return;
  let deg;
  if (tilt.land) {
    // landscape (car mode): gravity ab y-axis par aati hai, x-axis dominant hota hai
    const ax = Math.abs(x) < 0.01 ? 0.01 : Math.abs(x);
    deg = ((Math.atan2(y, ax) * 180) / Math.PI) * (x < 0 ? -1 : 1) * SENSOR_SIGN;
  } else {
    const ay = Math.abs(y) < 0.01 ? 0.01 : Math.abs(y);
    deg = ((Math.atan2(x, ay) * 180) / Math.PI) * SENSOR_SIGN;
  }
  tilt.raw += (deg - tilt.raw) * 0.25; // low-pass
  tilt.got = true;
};

// =====================================================================
//  3D helpers (geometry + material cache)
// =====================================================================
const geoCache = {};
const matCache = {};
const clearCaches = () => {
  Object.keys(geoCache).forEach((k) => delete geoCache[k]);
  Object.keys(matCache).forEach((k) => delete matCache[k]);
};
const cached = (key, make) => (geoCache[key] = geoCache[key] || make());
const mat = (c) => (matCache[c] = matCache[c] || new THREE.MeshLambertMaterial({ color: c }));
const phong = (c, shin = 70, spec = '#777777') => {
  const k = `p${c}${shin}${spec}`;
  return (matCache[k] = matCache[k] || new THREE.MeshPhongMaterial({ color: c, shininess: shin, specular: spec }));
};
const glow = (c) => (matCache[`g${c}`] = matCache[`g${c}`] || new THREE.MeshBasicMaterial({ color: c }));
const glassMat = () =>
  (matCache.glass = matCache.glass || new THREE.MeshPhongMaterial({ color: '#25364d', shininess: 150, specular: '#ffffff', transparent: true, opacity: 0.62 }));
const newTailMat = () => new THREE.MeshPhongMaterial({ color: '#7f1d1d', emissive: '#ef4444', emissiveIntensity: 0.25, shininess: 60 });

const boxGeo = (w, h, d) => cached(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
const cylGeo = (r, w) => cached(`c${r},${w}`, () => new THREE.CylinderGeometry(r, r, w, 16));
const limbGeo = (r) => cached(`l${r}`, () => new THREE.CylinderGeometry(r, r, 1, 8));
const sphereGeo = (r) => cached(`s${r}`, () => new THREE.SphereGeometry(r, 14, 12));
const coneGeo = (r, h) => cached(`k${r},${h}`, () => new THREE.ConeGeometry(r, h, 10));
const torusGeo = (r, t, arc = Math.PI * 2) => cached(`t${r},${t},${arc}`, () => new THREE.TorusGeometry(r, t, 8, 28, arc));

const box = (w, h, d, c, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(boxGeo(w, h, d), typeof c === 'string' ? mat(c) : c);
  m.position.set(x, y, z);
  return m;
};
const ball = (r, c, x, y, z, sx = 1, sy = 1, sz = 1) => {
  const m = new THREE.Mesh(sphereGeo(r), typeof c === 'string' ? mat(c) : c);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  return m;
};

// Side-profile ko width tak extrude karke rounded body banata hai.
// Shape x = length (aage = +x), y = height. Result: aage -z, chaudai x, upar y.
const profileGeo = (key, draw, width, bevel, tweak) =>
  cached(key, () => {
    const shape = new THREE.Shape();
    draw(shape);
    const depth = Math.max(0.01, width - bevel * 2);
    const g = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 2,
      curveSegments: 6,
    });
    g.translate(0, 0, -depth / 2);
    g.rotateY(Math.PI / 2);
    if (tweak) tweak(g.attributes.position);
    g.computeVertexNormals();
    return g;
  });

// upar aur nose/tail ki taraf body patli
const taperFn = (halfL, H, side, ends) => (pos) => {
  for (let i = 0; i < pos.count; i++) {
    const y = clamp(pos.getY(i) / H, 0, 1);
    const u = Math.max(0, Math.abs(pos.getZ(i)) / halfL - 0.55) / 0.45;
    const k = 1 - side * Math.pow(y, 1.5) - ends * u * u;
    pos.setX(i, pos.getX(i) * k);
  }
};

const roundBoxGeo = (L, H, W, r) =>
  profileGeo(
    `rb${L},${H},${W},${r}`,
    (s) => {
      const h = L / 2;
      s.moveTo(-h + r, 0);
      s.lineTo(h - r, 0);
      s.quadraticCurveTo(h, 0, h, r);
      s.lineTo(h, H - r);
      s.quadraticCurveTo(h, H, h - r, H);
      s.lineTo(-h + r, H);
      s.quadraticCurveTo(-h, H, -h, H - r);
      s.lineTo(-h, r);
      s.quadraticCurveTo(-h, 0, -h + r, 0);
    },
    W,
    Math.min(0.08, r * 0.6)
  );
// L = lambai (z), H = unchai (y), W = chaudai (x). y=0 niche, z=zc center
const rbox = (L, H, W, r, material, x, y, zc) => {
  const m = new THREE.Mesh(roundBoxGeo(L, H, W, r), material);
  m.position.set(x, y, zc);
  return m;
};

// do points ke beech patla cylinder (limb / tube)
const UP = new THREE.Vector3(0, 1, 0);
function limb(parent, p1, p2, r, material, joints = true) {
  const a = new THREE.Vector3(p1[0], p1[1], p1[2]);
  const d = new THREE.Vector3(p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]);
  const len = d.length();
  const m = new THREE.Mesh(limbGeo(r), material);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.scale.y = len;
  m.quaternion.setFromUnitVectors(UP, d.normalize());
  parent.add(m);
  if (joints) {
    parent.add(ball(r, material, p1[0], p1[1], p1[2]));
    parent.add(ball(r, material, p2[0], p2[1], p2[2]));
  }
}

// ---------- wheels ----------
function carWheel(r, w, x, y, z, detail) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  const tyre = new THREE.Mesh(cylGeo(r, w), mat('#0b0f19'));
  tyre.rotation.z = Math.PI / 2;
  g.add(tyre);
  const rim = new THREE.Mesh(cylGeo(r * 0.64, w + 0.03), phong('#d6dde8', 120, '#ffffff'));
  rim.rotation.z = Math.PI / 2;
  g.add(rim);
  if (detail) {
    for (let i = 0; i < 3; i++) {
      const sp = box(w + 0.05, r * 1.22, 0.05, '#7c8798');
      sp.rotation.x = (i * Math.PI) / 3;
      g.add(sp);
    }
    const hub = new THREE.Mesh(cylGeo(r * 0.16, w + 0.07), mat('#111827'));
    hub.rotation.z = Math.PI / 2;
    g.add(hub);
  }
  return { node: g, r };
}

function bikeWheel(R, z, tyreT) {
  const g = new THREE.Group();
  g.position.set(0, R, z);
  const tyre = new THREE.Mesh(torusGeo(R - tyreT, tyreT), mat('#0b0f19'));
  tyre.rotation.y = Math.PI / 2;
  g.add(tyre);
  const rim = new THREE.Mesh(torusGeo(R - tyreT * 1.7, 0.014), phong('#d6dde8', 120, '#ffffff'));
  rim.rotation.y = Math.PI / 2;
  g.add(rim);
  for (let i = 0; i < 3; i++) {
    const sp = box(0.025, (R - tyreT * 1.7) * 2, 0.025, '#9ca3af');
    sp.rotation.x = (i * Math.PI) / 3;
    g.add(sp);
  }
  const disc = new THREE.Mesh(cylGeo(R * 0.42, 0.012), phong('#9ca3af', 100));
  disc.rotation.z = Math.PI / 2;
  disc.position.x = 0.045;
  g.add(disc);
  return { node: g, r: R };
}

// mudguard (wheel ke upar ka arc)
function fender(R, arc, tube, material, z) {
  const wrap = new THREE.Group();
  wrap.position.set(0, R, z);
  wrap.rotation.y = Math.PI / 2;
  const m = new THREE.Mesh(torusGeo(R + 0.05, tube, arc), material);
  m.rotation.z = Math.PI / 2 - arc / 2;
  wrap.add(m);
  return wrap;
}

// ---------- rider ----------
function addRider(g, o) {
  const rg = new THREE.Group();
  const jacket = phong(o.jacket, 30, '#333333');
  const dark = mat('#111827');
  const hips = [0, o.seatY + 0.1, o.seatZ];
  const s = o.lean;
  const sh = [0, hips[1] + 0.56 * Math.cos(s), hips[2] - 0.56 * Math.sin(s)];
  limb(rg, hips, sh, 0.17, jacket);
  const head = [0, sh[1] + 0.22 * Math.cos(s * 0.6) + 0.04, sh[2] - 0.22 * Math.sin(s * 0.6)];
  rg.add(ball(0.215, phong(o.helmet, 100, '#ffffff'), head[0], head[1], head[2], 1, 0.95, 1.1));
  rg.add(box(0.27, 0.09, 0.1, phong('#0b1220', 150, '#ffffff'), head[0], head[1] + 0.01, head[2] - 0.17));
  [-1, 1].forEach((sx) => {
    const shoulder = [sx * 0.19, sh[1] - 0.03, sh[2]];
    const grip = [sx * o.gx, o.gy, o.gz];
    const elbow = [sx * 0.27, (shoulder[1] + grip[1]) / 2 - 0.08, (shoulder[2] + grip[2]) / 2 + 0.06];
    limb(rg, shoulder, elbow, 0.068, jacket);
    limb(rg, elbow, grip, 0.058, jacket, false);
    rg.add(ball(0.075, mat(o.helmet), grip[0], grip[1], grip[2]));
    const hip = [sx * 0.12, hips[1], hips[2]];
    const peg = [sx * 0.22, o.pegY, o.pegZ];
    const knee = [sx * 0.2, (hip[1] + peg[1]) / 2 + 0.1, (hip[2] + peg[2]) / 2 - 0.2];
    limb(rg, hip, knee, 0.1, mat('#1f2937'));
    limb(rg, knee, peg, 0.078, mat('#111827'), false);
    rg.add(box(0.11, 0.18, 0.27, '#0b0f19', peg[0], peg[1] + 0.04, peg[2] - 0.04));
    rg.add(ball(0.08, mat('#374151'), knee[0], knee[1], knee[2] - 0.02));
  });
  // helmet stripe, backpack, reflective stripe, knee pads
  rg.add(box(0.05, 0.02, 0.38, '#f8fafc', head[0], head[1] + 0.2, head[2]));
  const mid = [0, (hips[1] + sh[1]) / 2, (hips[2] + sh[2]) / 2];
  const stripe = box(0.38, 0.04, 0.2, '#e5e7eb', 0, mid[1] + 0.12 * Math.cos(s), mid[2] - 0.12 * Math.sin(s));
  stripe.rotation.x = -s;
  rg.add(stripe);
  if (o.pack) {
    const bp = box(0.32, 0.4, 0.16, mat(o.pack), 0, mid[1] + 0.2 * Math.sin(s), mid[2] + 0.2 * Math.cos(s));
    bp.rotation.x = -s;
    rg.add(bp);
  }
  g.add(rg);
  g.userData.rider = rg;
}

// ---------- cycle ----------
function makeCycle(v, player) {
  const g = new THREE.Group();
  g.userData.wheels = [];
  g.userData.tails = [];
  [-0.8, 0.8].forEach((z) => {
    const wl = bikeWheel(0.45, z, 0.045);
    g.add(wl.node);
    g.userData.wheels.push(wl);
  });
  const fr = phong(v.color, 90, '#cccccc');
  const metal = phong('#cbd5e1', 120, '#ffffff');
  const BB = [0, 0.32, 0.0];
  const seatTop = [0, 0.98, 0.22];
  const headTop = [0, 0.95, -0.65];
  const headBot = [0, 0.78, -0.7];
  limb(g, BB, seatTop, 0.025, fr);
  limb(g, BB, headBot, 0.032, fr);
  limb(g, seatTop, headTop, 0.025, fr);
  limb(g, BB, [0, 0.45, 0.8], 0.018, fr);
  limb(g, seatTop, [0, 0.45, 0.8], 0.018, fr);
  limb(g, headBot, [0, 0.45, -0.8], 0.022, metal);
  limb(g, [-0.28, 1.05, -0.68], [0.28, 1.05, -0.68], 0.017, mat('#111827'));
  limb(g, headTop, [0, 1.05, -0.68], 0.02, metal, false);
  g.add(box(0.14, 0.05, 0.3, '#111827', 0, 1.01, 0.26));
  limb(g, BB, [0.17, 0.2, 0.02], 0.014, mat('#374151'), false);
  limb(g, BB, [-0.17, 0.44, -0.02], 0.014, mat('#374151'), false);
  g.add(ball(0.07, glow('#fff7c2'), 0, 0.92, -0.78, 1, 1, 0.7));
  const tail = player ? newTailMat() : glow('#dc2626');
  if (player) g.userData.tails.push(tail);
  g.add(box(0.1, 0.07, 0.04, tail, 0, 0.86, 0.9));
  addRider(g, { seatY: 0.9, seatZ: 0.22, lean: 0.8, gx: 0.28, gy: 1.05, gz: -0.68, pegY: 0.3, pegZ: 0.0, jacket: '#f59e0b', helmet: '#ef4444', pack: '#22c55e' });
  return g;
}

// ---------- motorbikes ----------
function makeBike(v, player) {
  const g = new THREE.Group();
  g.userData.wheels = [];
  g.userData.tails = [];
  const st = v.style;
  const sportish = st === 'sport' || st === 'hyper';
  const R = st === 'cruiser' ? 0.46 : st === 'adv' ? 0.5 : 0.42;
  const wb = st === 'cruiser' ? 1.15 : st === 'adv' ? 1.1 : 1.0;
  const paint = phong(v.color, 100, '#dddddd');
  const dark = phong('#1f2937', 50);
  const metal = phong('#cbd5e1', 120, '#ffffff');
  const eng = phong('#4b5563', 60);

  [-wb, wb].forEach((z) => {
    const wl = bikeWheel(R, z, st === 'cruiser' || st === 'adv' ? 0.1 : 0.085);
    g.add(wl.node);
    g.userData.wheels.push(wl);
  });
  g.add(fender(R, 1.3, 0.035, paint, -wb));
  g.add(fender(R, 1.0, 0.035, sportish ? paint : dark, wb));

  // forks, swingarm, frame
  const barY = sportish ? R + 0.72 : st === 'cruiser' ? R + 0.95 : st === 'adv' ? R + 1.02 : R + 0.88;
  const barZ = -wb + (st === 'cruiser' ? 0.35 : 0.3);
  const bw = st === 'cruiser' ? 0.5 : sportish ? 0.26 : st === 'adv' ? 0.42 : 0.34;
  [-1, 1].forEach((sx) => {
    limb(g, [sx * 0.1, R, -wb], [sx * 0.1, barY - 0.05, barZ], 0.03, metal);
    limb(g, [sx * 0.07, R, wb], [sx * 0.08, R + 0.15, 0.3], 0.03, dark, false);
  });
  limb(g, [0, R + 0.62, -wb + 0.35], [0, R + 0.3, wb - 0.35], 0.045, dark);
  g.add(box(0.34, 0.36, 0.55, eng, 0, R + 0.14, 0.1));
  g.add(box(0.5, 0.15, 0.2, eng, 0, R + 0.34, -0.12));
  g.add(box(0.36, 0.2, 0.3, phong('#374151', 60), 0, R + 0.1, 0.5));

  // bars, mirrors, light
  limb(g, [-bw, barY, barZ], [bw, barY, barZ], 0.02, mat('#111827'), false);
  [-1, 1].forEach((sx) => {
    limb(g, [sx * bw, barY, barZ], [sx * (bw + 0.06), barY + 0.2, barZ + 0.05], 0.012, mat('#111827'), false);
    g.add(ball(0.05, paint, sx * (bw + 0.07), barY + 0.22, barZ + 0.05, 1.3, 0.8, 0.5));
  });
  g.add(box(0.14, 0.09, 0.1, '#0b0f19', 0, barY + 0.06, barZ + 0.05));
  const hr = st === 'cruiser' ? 0.18 : st === 'naked' ? 0.12 : 0.14;
  g.add(ball(hr + 0.02, dark, 0, barY - 0.02, -wb + 0.1, 1, 1, 0.8));
  g.add(ball(hr, glow('#fff7c2'), 0, barY - 0.02, -wb + 0.1 - hr * 0.55, 1, 1, 0.45));

  // tank + seat + tail
  if (st === 'cruiser') {
    g.add(ball(0.3, paint, 0, R + 0.72, -0.25, 1, 0.8, 1.7));
    g.add(ball(0.22, '#111827', 0, R + 0.63, 0.48, 1.2, 0.38, 2.4));
    limb(g, [0.24, R + 0.3, -0.15], [0.26, R + 0.18, wb + 0.3], 0.07, metal, false);
    limb(g, [-0.24, R + 0.3, -0.15], [-0.26, R + 0.18, wb + 0.3], 0.07, metal, false);
    g.add(ball(0.3, metal, 0, R + 0.24, -0.1, 0.7, 0.75, 1.0));
  } else {
    g.add(ball(0.28, paint, 0, R + 0.72, -0.25, 1, 0.78, 1.55));
    g.add(ball(0.19, '#111827', 0, R + 0.62, 0.35, 1, 0.38, 2.0));
    limb(g, [0.2, R + 0.28, 0.0], [0.23, R + 0.2, wb + 0.2], 0.055, metal, false);
    g.add(ball(0.09, metal, 0.23, R + 0.2, wb + 0.22, 1, 1, 1.4));
  }
  if (st === 'street' || st === 'naked') {
    const tailCol = st === 'street' ? paint : phong('#1f2937', 60);
    g.add(ball(0.17, tailCol, 0, R + 0.72, 0.85, 0.9, 0.55, 1.9));
  }
  if (sportish) {
    g.add(
      new THREE.Mesh(
        profileGeo(
          'bikefair',
          (s) => {
            s.moveTo(-0.5, 0);
            s.lineTo(0.5, 0.05);
            s.quadraticCurveTo(0.62, 0.28, 0.38, 0.5);
            s.lineTo(0.05, 0.72);
            s.lineTo(-0.45, 0.45);
            s.lineTo(-0.5, 0);
          },
          0.44,
          0.05,
          (pos) => {
            for (let i = 0; i < pos.count; i++) {
              const u = clamp((-pos.getZ(i) + 0.1) / 0.7, 0, 1);
              pos.setX(i, pos.getX(i) * (1 - 0.5 * u * u));
            }
          }
        ),
        paint
      )
    );
    g.children[g.children.length - 1].position.set(0, R + 0.45, -wb + 0.52);
    const ws = box(0.34, 0.3, 0.03, phong('#9fc6e6', 150, '#ffffff'), 0, R + 1.1, -wb + 0.2);
    ws.rotation.x = 0.8;
    g.add(ws);
    g.add(
      rbox(0.9, 0.3, 0.3, 0.12, paint, 0, R + 0.7, 0.85)
    );
  }
  if (st === 'adv') {
    const ws2 = box(0.36, 0.34, 0.03, phong('#9fc6e6', 150, '#ffffff'), 0, barY + 0.3, barZ + 0.04);
    ws2.rotation.x = 0.45;
    g.add(ws2);
    g.add(box(0.2, 0.05, 0.55, paint, 0, R + 0.64, -wb - 0.05));
    [-1, 1].forEach((sx) => g.add(box(0.22, 0.4, 0.6, dark, sx * 0.4, R + 0.55, wb - 0.1)));
    g.add(box(0.4, 0.3, 0.5, dark, 0, R + 0.95, wb + 0.2));
  }
  if (st === 'hyper') {
    g.add(box(0.72, 0.03, 0.2, '#111827', 0, R + 0.98, wb + 0.45));
    [-1, 1].forEach((sx) => {
      const wg = box(0.28, 0.03, 0.14, '#111827', sx * 0.3, R + 0.55, -wb + 0.5);
      wg.rotation.z = sx * 0.35;
      g.add(wg);
    });
    g.add(box(0.05, 0.02, 1.1, '#f8fafc', 0, R + 0.97, 0.0));
  }
  const tail = player ? newTailMat() : glow('#dc2626');
  if (player) g.userData.tails.push(tail);
  g.add(box(0.2, 0.08, 0.06, tail, 0, R + 0.7, wb + 0.28));
  g.add(box(0.2, 0.12, 0.02, '#e5e7eb', 0, R + 0.52, wb + 0.3));

  const lean = { street: 0.5, cruiser: 0.25, naked: 0.45, sport: 0.95, adv: 0.3, hyper: 1.05 }[st];
  addRider(g, {
    seatY: R + 0.62,
    seatZ: st === 'cruiser' ? 0.5 : 0.38,
    lean,
    gx: bw,
    gy: barY,
    gz: barZ,
    pegY: R * 0.62,
    pegZ: sportish ? 0.5 : st === 'cruiser' ? -0.25 : 0.12,
    jacket: sportish ? '#e2e8f0' : st === 'cruiser' ? '#6b4423' : st === 'adv' ? '#a16207' : '#1e293b',
    pack: st === 'street' ? '#f59e0b' : st === 'naked' ? '#0ea5e9' : null,
    helmet: v.color,
  });
  return g;
}

// ---------- cars ----------
function makeCar(o, color, player, detail = true) {
  const g = new THREE.Group();
  g.userData.wheels = [];
  g.userData.tails = [];
  const wr = o.wheelR || 0.36;
  const { l, w, h, cabL, cabH } = o;
  const cabX = -(o.cabZ || 0);
  const y0 = wr * 0.62;
  const k = `${l},${w},${h},${cabX},${cabL},${cabH},${o.fast ? 1 : 0}`;
  const paint = phong(color, 90, '#cccccc');
  const glass = glassMat();
  const D = detail === true ? 2 : detail === false ? 0 : detail;

  const body = new THREE.Mesh(
    profileGeo(
      `cb${k}`,
      (s) => {
        s.moveTo(-l / 2 + 0.2, 0);
        s.lineTo(l / 2 - 0.2, 0);
        s.quadraticCurveTo(l / 2, 0, l / 2, 0.2);
        s.lineTo(l / 2, h * 0.55);
        s.quadraticCurveTo(l / 2, h * 0.88, l / 2 - 0.3, h * 0.92);
        s.lineTo(cabX + cabL / 2, h);
        s.lineTo(cabX - cabL / 2, h);
        s.lineTo(-l / 2 + 0.25, h * 0.94);
        s.quadraticCurveTo(-l / 2, h * 0.9, -l / 2, h * 0.5);
        s.lineTo(-l / 2, 0.2);
        s.quadraticCurveTo(-l / 2, 0, -l / 2 + 0.2, 0);
      },
      w,
      0.07,
      taperFn(l / 2, h, 0.1, 0.1)
    ),
    paint
  );
  body.position.y = y0;
  g.add(body);

  const ft = cabX + cabL * 0.24;
  const rt = cabX - cabL * (o.fast ? 0.2 : 0.36);
  const cab = new THREE.Mesh(
    profileGeo(
      `cc${k}`,
      (s) => {
        s.moveTo(cabX + cabL / 2, 0);
        s.lineTo(ft, cabH);
        s.lineTo(rt, cabH);
        s.lineTo(cabX - cabL / 2, 0);
        s.lineTo(cabX + cabL / 2, 0);
      },
      w * 0.9,
      0.04
    ),
    glass
  );
  cab.position.y = y0 + h - 0.03;
  g.add(cab);
  g.add(rbox(ft - rt + 0.08, 0.07, w * 0.84, 0.03, o.roof ? phong(o.roof, 90, '#cccccc') : paint, 0, y0 + h + cabH - 0.02, -(ft + rt) / 2));

  const ly = y0 + h * 0.62;
  const tail = player ? newTailMat() : glow('#dc2626');
  if (player) g.userData.tails.push(tail);
  [-1, 1].forEach((sx) => {
    g.add(ball(0.13, glow('#fff7c2'), sx * (w / 2 - 0.3), ly, -l / 2 + 0.02, 1.5, 0.7, 0.6));
    g.add(box(0.4, 0.11, 0.06, tail, sx * (w / 2 - 0.32), ly, l / 2 - 0.01));
  });
  g.add(box(w * 0.94, 0.16, 0.12, '#0b0f19', 0, y0 + 0.1, -l / 2 + 0.02));
  g.add(box(w * 0.94, 0.16, 0.12, '#0b0f19', 0, y0 + 0.1, l / 2 - 0.02));

  if (D >= 1) {
    // driver
    const shirt = ['#e2e8f0', '#1e3a8a', '#7f1d1d', '#14532d'][color.charCodeAt(1) % 4];
    const dx = w * 0.2;
    g.add(ball(0.12, mat('#d9a67c'), dx, y0 + h + cabH * 0.62, -cabX - 0.05));
    g.add(box(0.36, cabH * 0.45, 0.22, mat(shirt), dx, y0 + h + cabH * 0.2, -cabX + 0.05));
    // door lines + wheel arches
    [-1, 1].forEach((sx) => {
      g.add(box(0.02, h * 0.7, 0.025, '#0b0f19', sx * (w / 2 + 0.01), y0 + h * 0.5, -(cabX - cabL * 0.12)));
      [-1, 1].forEach((sz) => {
        const arch = new THREE.Mesh(cylGeo(wr * 1.14, 0.04), mat('#0b0f19'));
        arch.rotation.z = Math.PI / 2;
        arch.position.set(sx * (w / 2 + 0.005), wr, sz * l * 0.32);
        g.add(arch);
      });
    });
    g.add(box(w * 0.46, h * 0.2, 0.05, '#0b0f19', 0, y0 + h * 0.34, -l / 2 - 0.01));
    g.add(box(0.3, 0.1, 0.02, '#e5e7eb', 0, y0 + h * 0.3, l / 2 + 0.02));
    [-1, 1].forEach((sx) => {
      g.add(box(0.1, 0.1, 0.18, paint, sx * (w / 2 + 0.05), y0 + h + 0.06, -(cabX + cabL / 2) + 0.12));
    });
  }
  if (o.spoiler) {
    const wing = phong('#111827', 60);
    g.add(box(w * 0.92, 0.05, 0.34, wing, 0, y0 + h + 0.3, l / 2 - 0.22));
    [-1, 1].forEach((sx) => g.add(box(0.05, 0.28, 0.08, wing, sx * w * 0.3, y0 + h + 0.15, l / 2 - 0.22)));
  }

  const wbase = l * 0.32;
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
    const wl = carWheel(wr, 0.26, sx * (w / 2 - 0.07), wr, sz * wbase, D >= 2);
    g.add(wl.node);
    g.userData.wheels.push(wl);
  });
  g.add(box(w * 0.92, 0.02, l * 0.92, '#05070b', 0, 0.045, 0));

  // ---- extra detail / variants ----
  const cabZc = o.cabZ || 0;
  const hoodEnd = cabZc - cabL / 2;
  const hoodMid = (-l / 2 + hoodEnd) / 2;
  const topY = y0 + h;
  const roofTop = y0 + h + cabH + 0.03;
  const roofLen = ft - rt;
  const roofZ = -(ft + rt) / 2;
  const darkM = '#05070b';
  g.add(box(w * 0.5, 0.05, 0.03, darkM, 0, y0 + h * 0.55, -l / 2 - 0.02)); // grille
  if (D >= 1) {
    [-1, 1].forEach((sx) => g.add(box(0.03, 0.05, 0.3, '#cbd5e1', sx * (w / 2 + 0.012), y0 + h * 0.72, -(cabX - cabL * 0.02)))); // door handles
  }
  if (o.chrome) {
    g.add(box(w * 0.5, 0.035, 0.035, '#e5e7eb', 0, y0 + h * 0.66, -l / 2 - 0.025));
    [-1, 1].forEach((sx) => g.add(box(0.025, 0.03, l * 0.5, '#e5e7eb', sx * (w / 2 + 0.01), y0 + h * 0.3, 0)));
  }
  if (o.fast) {
    [-1, 1].forEach((sx) => g.add(box(0.05, 0.08, l * 0.42, darkM, sx * (w / 2 + 0.005), y0 + 0.07, 0))); // side skirts
  }
  if (o.stripe) {
    [-1, 1].forEach((sx) => {
      g.add(box(0.12, 0.012, Math.max(0.3, hoodEnd + l / 2 - 0.3), o.stripe, sx * 0.13, y0 + h * 0.97, hoodMid + 0.1));
      g.add(box(0.12, 0.012, Math.max(0.3, roofLen), o.stripe, sx * 0.13, roofTop + 0.012, roofZ));
      g.add(box(0.12, 0.012, 0.7, o.stripe, sx * 0.13, y0 + h * 0.97, l / 2 - 0.55));
    });
  }
  if (o.scoop) {
    g.add(box(0.5, 0.09, 0.5, '#111827', 0, topY + 0.03, hoodMid + 0.1));
    g.add(box(0.42, 0.05, 0.04, darkM, 0, topY + 0.04, hoodMid - 0.16));
  }
  if (o.splitter) g.add(box(w * 1.0, 0.04, 0.32, darkM, 0, y0 + 0.02, -l / 2 - 0.1));
  if (o.duck) g.add(box(w * 0.78, 0.06, 0.22, paint, 0, y0 + h * 0.95 + 0.04, l / 2 - 0.3));
  if (o.exhaust) {
    [-1, 1].forEach((sx) => {
      const ex = new THREE.Mesh(cylGeo(0.06, 0.16), phong('#cbd5e1', 120, '#ffffff'));
      ex.rotation.x = Math.PI / 2;
      ex.position.set(sx * w * 0.3, y0 + 0.1, l / 2 + 0.04);
      g.add(ex);
    });
  }
  if (o.flares) {
    [-1, 1].forEach((sx) => [-1, 1].forEach((sz) => g.add(box(0.14, 0.1, wr * 2.3, paint, sx * (w / 2 + 0.03), wr * 1.8, sz * l * 0.32))));
  }
  if (o.led) {
    g.add(box(w * 0.78, 0.035, 0.04, glow('#e0f2fe'), 0, ly + 0.06, -l / 2 - 0.005));
    g.add(box(w * 0.84, 0.04, 0.05, tail, 0, ly + 0.02, l / 2 + 0.012));
  }
  if (o.rack) {
    [-1, 1].forEach((sx) => g.add(box(0.04, 0.05, roofLen * 0.85, '#111827', sx * w * 0.32, roofTop + 0.04, roofZ)));
    [-0.3, 0.3].forEach((k) => g.add(box(w * 0.66, 0.04, 0.05, '#111827', 0, roofTop + 0.06, roofZ + roofLen * k)));
  }
  if (o.bed) {
    const bedStart = cabZc + cabL / 2 + 0.05;
    const bedEnd = l / 2 - 0.05;
    const bl = Math.max(0.5, bedEnd - bedStart);
    const bc = (bedStart + bedEnd) / 2;
    g.add(box(w * 0.84, 0.03, bl, '#1f2937', 0, topY * 0.98 + 0.02, bc));
    [-1, 1].forEach((sx) => g.add(box(0.1, 0.34, bl, paint, sx * (w / 2 - 0.08), topY + 0.15, bc)));
    g.add(box(w * 0.9, 0.36, 0.1, paint, 0, topY + 0.16, bedEnd));
    g.add(box(w * 0.9, 0.3, 0.08, paint, 0, topY + 0.13, bedStart));
  }
  return g;
}

function makeVan(color) {
  const g = makeCar({ w: 1.9, l: 4.8, h: 0.9, cabH: 0.62, cabL: 2.0, cabZ: -1.1, wheelR: 0.38 }, color, false, 1);
  g.add(rbox(2.6, 1.55, 1.9, 0.18, phong(color, 60, '#aaaaaa'), 0, 0.42, 1.0));
  return g;
}

function makeBus(color) {
  const g = new THREE.Group();
  g.userData.wheels = [];
  const paint = phong(color, 70, '#aaaaaa');
  g.add(rbox(8, 2.1, 2.3, 0.3, paint, 0, 0.5, 0));
  g.add(rbox(7.2, 0.7, 2.34, 0.12, phong('#1b2a3d', 140, '#ffffff'), 0, 1.5, -0.1));
  g.add(box(2.0, 0.85, 0.05, phong('#1b2a3d', 140, '#ffffff'), 0, 1.65, -4.05));
  g.add(box(2.32, 0.16, 8.02, '#ffffff', 0, 1.1, 0));
  g.add(rbox(1.5, 0.22, 1.4, 0.1, mat('#e5e7eb'), 0, 2.6, 0.5));
  g.add(box(2.2, 0.22, 0.12, '#111827', 0, 0.62, -4.05));
  g.add(box(2.2, 0.22, 0.12, '#111827', 0, 0.62, 4.05));
  g.add(box(1.2, 0.3, 0.05, '#0b0f19', 0, 1.0, -4.07));
  [-1, 1].forEach((sx) => g.add(box(0.1, 0.35, 0.12, '#111827', sx * 1.3, 1.6, -3.7)));
  [-1, 1].forEach((sx) => {
    g.add(ball(0.12, glow('#fff7c2'), sx * 0.8, 0.95, -4.03, 1.5, 0.8, 0.5));
    g.add(box(0.3, 0.14, 0.05, glow('#dc2626'), sx * 0.8, 0.95, 4.03));
    [-2.6, 2.6].forEach((z) => {
      const wl = carWheel(0.5, 0.3, sx * 1.1, 0.5, z, false);
      g.add(wl.node);
      g.userData.wheels.push(wl);
    });
  });
  return g;
}

function makeTruck(color) {
  const g = new THREE.Group();
  g.userData.wheels = [];
  g.add(box(2.0, 0.3, 9.6, '#374151', 0, 0.6, 0));
  g.add(rbox(2.0, 1.8, 2.1, 0.3, phong(color, 80, '#aaaaaa'), 0, 0.7, -3.8));
  g.add(box(1.8, 0.65, 0.05, phong('#1b2a3d', 140, '#ffffff'), 0, 1.95, -4.82));
  g.add(box(2.1, 0.25, 0.12, '#111827', 0, 0.55, -4.85));
  g.add(box(1.1, 0.3, 0.05, '#0b0f19', 0, 1.05, -4.87));
  [-1, 1].forEach((sx) => {
    g.add(box(0.1, 0.35, 0.12, '#111827', sx * 1.25, 2.1, -4.4));
    limb(g, [sx * 1.0, 1.0, -3.0], [sx * 1.0, 3.2, -3.0], 0.06, phong('#cbd5e1', 120, '#ffffff'), false);
  });
  g.add(rbox(6.6, 2.5, 2.3, 0.12, phong('#e5e7eb', 40, '#999999'), 0, 0.85, 1.2));
  [-1, 1].forEach((sx) => {
    g.add(ball(0.12, glow('#fff7c2'), sx * 0.7, 1.0, -4.83, 1.5, 0.8, 0.5));
    g.add(box(0.3, 0.14, 0.05, glow('#dc2626'), sx * 0.7, 0.95, 4.5));
    [-3.8, 0.2, 2.0].forEach((z) => {
      const wl = carWheel(0.5, 0.3, sx * 1.05, 0.5, z, false);
      g.add(wl.node);
      g.userData.wheels.push(wl);
    });
  });
  return g;
}

function buildVehicle(v, player) {
  if (v.kind === 'cycle') return makeCycle(v, player);
  if (v.kind === 'bike') return makeBike(v, player);
  return makeCar(v.car, v.color, player, true);
}

const HATCH_O = { w: 1.7, l: 3.7, h: 0.62, cabH: 0.6, cabL: 2.0, cabZ: 0.25, wheelR: 0.34 };
const SEDAN_O = { w: 1.8, l: 4.4, h: 0.66, cabH: 0.6, cabL: 2.3, cabZ: 0.2, wheelR: 0.36 };
function makeTraffic(type, color) {
  if (type === 'hatch' || type === 'sedan') {
    const o = type === 'hatch' ? HATCH_O : SEDAN_O;
    const g = makeCar(o, color, false, 1);
    if (color === '#facc15') {
      // taxi roof sign
      const top = o.wheelR * 0.62 + o.h + o.cabH + 0.05;
      g.add(box(0.5, 0.13, 0.22, glow('#fff7c2'), 0, top + 0.07, o.cabZ));
    }
    return g;
  }
  if (type === 'van') return makeVan(color);
  if (type === 'bus') return makeBus(color);
  return makeTruck(color);
}

// first-person camera ki jagah (vehicle ke local coordinates me)
const fpFor = (V) => {
  if (V.kind === 'cycle') return { x: 0, y: 1.5, z: -0.2 };
  if (V.kind === 'bike') {
    const R = V.style === 'cruiser' ? 0.46 : 0.42;
    const wb = V.style === 'cruiser' ? 1.15 : 1.0;
    return { x: 0, y: R + 1.2, z: -wb + 0.7 };
  }
  const o = V.car;
  const wr = o.wheelR || 0.36;
  return { x: o.w * 0.2, y: wr * 0.62 + o.h + o.cabH * 0.62, z: (o.cabZ || 0) - o.cabL * 0.12 };
};

function makeRenderer(gl) {
  const w = gl.drawingBufferWidth;
  const h = gl.drawingBufferHeight;
  const renderer = new THREE.WebGLRenderer({
    canvas: {
      width: w,
      height: h,
      style: {},
      clientWidth: w,
      clientHeight: h,
      addEventListener: () => {},
      removeEventListener: () => {},
      getContext: () => gl,
    },
    context: gl,
    antialias: false,
  });
  renderer.setSize(w, h, false);
  return { renderer, w, h };
}

// =====================================================================
//  Garage: 3D turntable preview
// =====================================================================
function GaragePreview({ vehicleId }) {
  const alive = useRef(false);
  const raf = useRef(null);
  const idRef = useRef(vehicleId);
  idRef.current = vehicleId;
  const [perr, setPerr] = useState(null);

  const onCtx = useCallback((gl) => {
    try {
      clearCaches();
      const { renderer, w, h } = makeRenderer(gl);
      const scene = new THREE.Scene();
      scene.background = new THREE.Color('#0e1626');
      const camera = new THREE.PerspectiveCamera(38, w / h, 0.1, 100);
      camera.position.set(0, 3.0, 8.2);
      camera.lookAt(0, 0.9, 0);
      scene.add(new THREE.AmbientLight('#ffffff', 0.75));
      const key = new THREE.DirectionalLight('#ffffff', 0.95);
      key.position.set(5, 8, 6);
      scene.add(key);
      const rim = new THREE.DirectionalLight('#22d3ee', 0.55);
      rim.position.set(-6, 4, -4);
      scene.add(rim);
      const warm = new THREE.PointLight('#ff7a18', 0.7, 22);
      warm.position.set(4, 2.5, 5);
      scene.add(warm);
      const ring2 = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.025, 8, 60), mat('#ff7a18'));
      ring2.rotation.x = Math.PI / 2;
      ring2.position.y = 0.012;
      scene.add(ring2);
      const floor = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 0.12, 40), mat('#16213a'));
      floor.position.y = -0.06;
      scene.add(floor);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.04, 8, 60), mat('#22d3ee'));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.01;
      scene.add(ring);

      let pivot = null;
      let shown = null;
      const show = (id) => {
        if (pivot) scene.remove(pivot);
        const v = VEHICLES.find((x) => x.id === id);
        pivot = new THREE.Group();
        const m = buildVehicle(v, false);
        m.scale.setScalar(Math.max(0.9, Math.min(1.9, 4.6 / v.len)));
        pivot.add(m);
        scene.add(pivot);
        shown = id;
      };
      show(idRef.current);

      alive.current = true;
      let last = Date.now();
      const loop = () => {
        if (!alive.current) return;
        try {
          const now = Date.now();
          const dt = Math.min(0.05, (now - last) / 1000);
          last = now;
          if (shown !== idRef.current) show(idRef.current);
          pivot.rotation.y += dt * 0.7;
          renderer.render(scene, camera);
          gl.endFrameEXP();
          raf.current = requestAnimationFrame(loop);
        } catch (e) {
          alive.current = false;
          setPerr(String((e && e.message) || e));
        }
      };
      raf.current = requestAnimationFrame(loop);
    } catch (e) {
      setPerr(String((e && e.message) || e));
    }
  }, []);

  useEffect(
    () => () => {
      alive.current = false;
      if (raf.current) cancelAnimationFrame(raf.current);
    },
    []
  );

  return (
    <View style={styles.previewGL}>
      <GLView style={StyleSheet.absoluteFill} onContextCreate={onCtx} />
      {perr && <Text style={styles.previewErr}>3D preview error: {perr}</Text>}
    </View>
  );
}

const StatBar = ({ label, value }) => (
  <View style={styles.statRow}>
    <Text style={styles.statLabel}>{label}</Text>
    <View style={styles.segRow}>
      {Array.from({ length: 10 }).map((_, i) => (
        <View key={i} style={[styles.seg, i < value && { backgroundColor: C.accent }]} />
      ))}
    </View>
  </View>
);

const Seg = ({ opts, value, onChange }) => (
  <View style={styles.seg2}>
    {opts.map(([k, label]) => (
      <Pressable key={String(k)} onPress={() => onChange(k)} style={[styles.segBtn, value === k && styles.segOn]}>
        <Text style={[styles.segTxt, value === k && { color: '#111827' }]}>{label}</Text>
      </Pressable>
    ))}
  </View>
);

// =====================================================================
//  App
// =====================================================================
export default function App() {
  const [screen, setScreen] = useState('home'); // home | garage | play | over
  const [save, setSave] = useState(DEFAULT_SAVE);
  const [loaded, setLoaded] = useState(false);
  const [sel, setSel] = useState('cycle');
  const [hud, setHud] = useState(null);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState(null);
  const [paused, setPaused] = useState(false);
  const [notice, setNotice] = useState(null);
  const [ready, setReady] = useState(false);
  const [filter, setFilter] = useState('all');

  const saveRef = useRef(save);
  saveRef.current = save;
  const screenRef = useRef(screen);
  screenRef.current = screen;
  const gameRef = useRef(null);
  const vehicleRef = useRef(VEHICLES[0]);
  const alive = useRef(false);
  const rafRef = useRef(null);
  const pausedRef = useRef(false);
  const finishRef = useRef(null);
  const framesRef = useRef(0);
  const rootRef = useRef(null);
  const padRef = useRef({ ox: 0, oy: 0, w: 0, h: 0 });
  const [padSize, setPadSize] = useState({ w: 0, h: 0 });

  // ---------- save / load ----------
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(SAVE_KEY);
        if (raw) {
          const d = JSON.parse(raw);
          const merged = {
            ...DEFAULT_SAVE,
            ...d,
            owned: { cycle: true, ...(d.owned || {}) },
            settings: { ...DEFAULT_SETTINGS, ...(d.settings || {}) },
            goals: d.goals || {},
            missions: Array.isArray(d.missions) && d.missions.length ? d.missions : null,
          };
          setSave(merged);
          setSel(merged.selected && VEHICLES.some((v) => v.id === merged.selected) ? merged.selected : 'cycle');
        }
      } catch (e) {
        // save na mile to default se chalega
      }
      setSave((p) => ({
        ...p,
        missions: p.missions && p.missions.length ? p.missions : genMissions(p.missionsDone || 0),
        challenge: p.challenge || makeChallenge(p.challengesDone || 0),
      }));
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(SAVE_KEY, JSON.stringify(save)).catch(() => {});
  }, [save, loaded]);

  const setSetting = (k, val) => setSave((p) => ({ ...p, settings: { ...p.settings, [k]: val } }));

  // ---------- tilt sensor ----------
  const wantTilt = loaded;
  useEffect(() => {
    if (!wantTilt) return undefined;
    let sub = null;
    let dead = false;
    let timer = null;
    tilt.got = false;

    const fail = () => {
      if (dead) return;
      tilt.ok = false;
      setNotice('No tilt sensor found on this phone. On-screen LEFT / RIGHT buttons will be used to steer.');
    };
    const startAcc = async () => {
      let okAcc = false;
      try {
        okAcc = await Accelerometer.isAvailableAsync();
      } catch (e) {
        okAcc = false;
      }
      if (dead) return;
      if (!okAcc) {
        fail();
        return;
      }
      Accelerometer.setUpdateInterval(16);
      sub = Accelerometer.addListener((d) => feedTilt(d.x, d.y));
      tilt.ok = true;
    };
    (async () => {
      let okDM = false;
      try {
        okDM = await DeviceMotion.isAvailableAsync();
      } catch (e) {
        okDM = false;
      }
      if (dead) return;
      if (okDM) {
        DeviceMotion.setUpdateInterval(16);
        sub = DeviceMotion.addListener((d) => {
          const a = d && d.accelerationIncludingGravity;
          if (a) feedTilt(a.x, a.y);
        });
        tilt.ok = true;
        // 1.5 sec me data na aaye to Accelerometer par fallback
        timer = setTimeout(() => {
          if (!tilt.got && !dead) {
            if (sub) sub.remove();
            sub = null;
            startAcc();
          }
        }, 1500);
      } else {
        await startAcc();
      }
    })();
    return () => {
      dead = true;
      if (timer) clearTimeout(timer);
      if (sub) sub.remove();
    };
  }, [wantTilt]);

  const lp = levelProgress(save.xp);
  const playerLevel = lp.level;

  // ---------- input ----------
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderRelease: (_, gs) => {
          if (screenRef.current !== 'play' || pausedRef.current) return;
          const s = gameRef.current;
          if (!s || s.manual) return;
          const { dx, dy } = gs;
          const tap = Math.abs(dx) < 12 && Math.abs(dy) < 12;
          if (dy < -40 && Math.abs(dy) > Math.abs(dx)) {
            s.toggleBoost = true;
          } else if (dy > 40 && Math.abs(dy) > Math.abs(dx)) {
            s.brakeT = 0.9;
          } else if (tap) {
            if (s.ctl === 'pads') {
              const p = padRef.current;
              const Z = padZones(p.w, p.h, true);
              if (Object.keys(Z).some((k) => inZone(Z[k], gs.x0 - p.ox, gs.y0 - p.oy))) return;
            }
            s.toggleBoost = true; // tap = boost on/off
          }
        },
      }),
    []
  );

  const onRootLayout = (e) => {
    const { width, height } = e.nativeEvent.layout;
    padRef.current.w = width;
    padRef.current.h = height;
    setPadSize({ w: width, h: height });
    if (rootRef.current && rootRef.current.measure) {
      rootRef.current.measure((x, y, ww, hh, px, py) => {
        padRef.current.ox = px || 0;
        padRef.current.oy = py || 0;
      });
    }
  };
  const handlePads = (e, phase) => {
    const s = gameRef.current;
    if (!s || !(s.manual || s.ctl === 'pads') || pausedRef.current) return;
    const p = padRef.current;
    if (!p.w) return;
    const Z = padZones(p.w, p.h, !s.manual);
    const ne = e.nativeEvent;
    const ts = ne.touches || [];
    let gas = false;
    let brk = false;
    let l = false;
    let r = false;
    for (let i = 0; i < ts.length; i++) {
      const x = ts[i].pageX - p.ox;
      const y = ts[i].pageY - p.oy;
      if (inZone(Z.gas, x, y)) gas = true;
      else if (inZone(Z.brake, x, y)) brk = true;
      else if (inZone(Z.left, x, y)) l = true;
      else if (inZone(Z.right, x, y)) r = true;
    }
    s.gas = gas;
    s.brake = brk;
    s.steerBtn = l && !r ? -1 : r && !l ? 1 : 0;
    if (phase === 'start') {
      const cs = ne.changedTouches || [];
      for (let i = 0; i < cs.length; i++) {
        const x = cs[i].pageX - p.ox;
        const y = cs[i].pageY - p.oy;
        if (inZone(Z.boost, x, y)) s.toggleBoost = true;
        else if (inZone(Z.rev, x, y)) s.toggleRev = true;
      }
    }
  };
  const toggleCam = () => {
    const s = gameRef.current;
    if (s) s.cam = s.cam ? 0 : 1;
  };
  const recenter = () => {
    tilt.cal = tilt.raw;
  };

  // ---------- game scene + loop ----------
  const setupScene = (gl) => {
    clearCaches();
    const { renderer, w, h } = makeRenderer(gl);
    const V = vehicleRef.current;
    const FP = fpFor(V);

    const scene = new THREE.Scene();
    const sky = new THREE.Color(SKY[0]);
    scene.background = sky;
    scene.fog = new THREE.Fog(SKY[0], 45, 150);
    const camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 260);
    scene.add(camera);
    const ambient = new THREE.AmbientLight('#ffffff', 0.85);
    scene.add(ambient);
    const sun = new THREE.DirectionalLight('#ffffff', 0.85);
    sun.position.set(8, 14, 6);
    scene.add(sun);

    // road
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(220, 420), mat('#4d7c0f'));
    grass.rotation.x = -Math.PI / 2;
    grass.position.set(0, -0.03, -130);
    scene.add(grass);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(LANES * LANE_W + 0.8, 420), mat('#2b3240'));
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0, -130);
    scene.add(road);
    [-1, 1].forEach((sx) => {
      scene.add(box(0.14, 0.03, 420, '#f8fafc', sx * 4.75, 0.03, -130));
      scene.add(box(0.1, 0.03, 420, '#fbbf24', sx * 0.12, 0.03, -130));
      scene.add(box(1.0, 0.04, 420, '#6b7280', sx * 5.3, 0.02, -130));
      scene.add(box(0.12, 0.45, 420, '#cbd5e1', sx * 5.9, 0.55, -130));
    });

    // moving lane dashes
    const dashes = [];
    [-LANE_W, LANE_W].forEach((x) => {
      for (let i = 0; i < 30; i++) {
        const d = box(0.14, 0.03, 2.6, '#f8fafc', x, 0.03, 0);
        scene.add(d);
        dashes.push({ node: d, i });
      }
    });

    // scenery
    const scenery = [];
    const addScenery = (node, side, z, span, jitter) => {
      scene.add(node);
      scenery.push({ node, side, span, jitter });
      node.position.z = z;
    };
    [-1, 1].forEach((side) => {
      for (let i = 0; i < 12; i++) {
        const t = new THREE.Group();
        t.add(box(0.3, 1.4, 0.3, '#7c4a21', 0, 0.7, 0));
        const c1 = new THREE.Mesh(coneGeo(1.1, 2.8), mat('#15803d'));
        c1.position.y = 2.6;
        t.add(c1);
        const c2 = new THREE.Mesh(coneGeo(0.8, 2.0), mat('#16a34a'));
        c2.position.y = 3.8;
        t.add(c2);
        t.position.x = side * (7.5 + rand(0, 5));
        addScenery(t, side, 20 - i * 18 + rand(-4, 4), 12 * 18, true);
      }
      for (let i = 0; i < 7; i++) {
        const l = new THREE.Group();
        l.add(box(0.15, 6, 0.15, '#9ca3af', 0, 3, 0));
        l.add(box(1.8, 0.12, 0.12, '#9ca3af', -side * 0.9, 6, 0));
        l.add(box(0.5, 0.12, 0.3, glow('#fde68a'), -side * 1.7, 5.9, 0));
        l.position.x = side * 6.4;
        addScenery(l, side, 20 - i * 30, 7 * 30, false);
      }
      for (let i = 0; i < 8; i++) {
        const bw = rand(6, 10);
        const bh = rand(8, 30);
        const b = box(bw, bh, 8, ['#64748b', '#475569', '#94a3b8', '#78716c'][i % 4], 0, bh / 2, 0);
        b.position.x = side * (16 + bw / 2 + rand(0, 8));
        addScenery(b, side, 20 - i * 42, 8 * 42, false);
      }
    });

    // player
    const player = buildVehicle(V, true);
    scene.add(player);
    const tails = player.userData.tails;
    const pWheels = player.userData.wheels;
    const rider = player.userData.rider || null;

    // first-person cockpit (sirf cars ke liye, camera ke saath chipka)
    const cockpit = new THREE.Group();
    const dashMat = phong('#0f172a', 40, '#444444');
    cockpit.add(box(2.3, 0.3, 0.6, dashMat, 0, -0.66, -0.85));
    cockpit.add(box(2.4, 0.1, 0.7, '#0b0f19', 0, 0.68, -0.8));
    cockpit.add(box(0.08, 1.6, 0.08, '#0b0f19', -1.05, 0, -1.0));
    cockpit.add(box(0.08, 1.6, 0.08, '#0b0f19', 1.05, 0, -1.0));
    const wheelGrp = new THREE.Group();
    wheelGrp.position.set(0, -0.42, -0.62);
    wheelGrp.rotation.x = -0.95;
    const rimMesh = new THREE.Mesh(torusGeo(0.2, 0.026), mat('#0b0f19'));
    wheelGrp.add(rimMesh);
    wheelGrp.add(box(0.36, 0.03, 0.03, '#0b0f19', 0, 0, 0));
    wheelGrp.add(box(0.03, 0.18, 0.03, '#0b0f19', 0, -0.09, 0));
    cockpit.add(wheelGrp);
    camera.add(cockpit);
    cockpit.visible = false;

    const s = gameRef.current;
    alive.current = true;
    let last = Date.now();
    let t = 0;
    let dashOff = 0;
    let hudTimer = 0;
    let braking = false;
    let camShown = -1;
    let tailInt = 0.25;

    const finish = () => {
      alive.current = false;
      try {
        Speech.stop();
      } catch (e) {
        // ignore
      }
      const sv = saveRef.current;
      const score = Math.floor(s.score);
      const earned = Math.floor(s.credits);
      const lvBefore = levelFromXp(sv.xp);
      const lvAfter = levelFromXp(sv.xp + score);
      let levelBonus = 0;
      for (let L = lvBefore + 1; L <= lvAfter; L++) levelBonus += 100 + L * 25;
      const unlockedNow = VEHICLES.filter((x) => !sv.owned[x.id] && x.level > lvBefore && x.level <= lvAfter).map((x) => x.name);
      const stats = {
        near: s.near,
        distKm: s.dist / 1000,
        topKmh: s.topKmh,
        score,
        wrongSec: s.wrongT,
        coins: s.coinN,
        maxCombo: s.maxCombo,
        boostSec: s.boostT,
        runs: 1,
        cleanTop: s.crashes === 0 ? s.topKmh : 0,
      };
      const ms = applyMissions(sv.missions || genMissions(0), stats, sv.missionsDone || 0);
      const ch = sv.challenge || makeChallenge(0);
      const chVal = chDef.stat(stats);
      const chOk = s.chDone || chVal >= ch.target;
      const chDoneCount = (sv.challengesDone || 0) + (chOk ? 1 : 0);
      const chBonus = chOk ? ch.reward : 0;
      setResult({
        score,
        dist: Math.floor(s.dist),
        near: s.near,
        earned,
        topKmh: Math.floor(s.topKmh),
        lvBefore,
        lvAfter,
        newBest: score > sv.best,
        unlockedNow,
        goal: s.goalDone ? s.goal.reward : 0,
        levelBonus,
        missionsDone: ms.completed,
        missionReward: ms.reward,
        chText: chDef.label(ch.target),
        chOk,
        chBonus,
      });
      setSave((p) => ({
        ...p,
        credits: p.credits + earned + levelBonus + ms.reward + chBonus,
        xp: p.xp + score,
        best: Math.max(p.best, score),
        runs: (p.runs || 0) + 1,
        goals: s.goalDone ? { ...(p.goals || {}), [V.id]: true } : p.goals,
        missions: ms.missions,
        missionsDone: ms.done,
        challenge: chOk ? makeChallenge(chDoneCount) : { ...ch, best: Math.max(ch.best || 0, chVal) },
        challengesDone: chDoneCount,
      }));
      setScreen('over');
    };
    finishRef.current = finish;

    const say = (text, secs = 1.4) => {
      s.banner = text;
      s.bannerT = secs;
    };
    const chDef = CHALLENGES.find((d) => d.id === s.ch.id) || CHALLENGES[0];
    const taunt = (t) => {
      say(t.en, 2.2);
      if (!s.voice) return;
      try {
        Speech.stop();
        Speech.speak(t.hi, { language: 'hi-IN', pitch: 0.8, rate: 0.95 });
      } catch (e) {
        // voice na chale to sirf text dikhega
      }
    };

    const loopBody = () => {
      if (!alive.current) return;
      const now = Date.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (pausedRef.current) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }
      t += dt;

      // timers
      if (s.toggleBoost) {
        s.toggleBoost = false;
        s.boostOn = !s.boostOn;
        say(s.boostOn ? 'BOOST ON' : 'BOOST OFF', 0.9);
      }
      s.age += dt;
      if (s.brakeT > 0) s.brakeT -= dt;
      if (s.invuln > 0) s.invuln -= dt;
      if (s.slowT > 0) s.slowT -= dt;
      if (s.comboT > 0) {
        s.comboT -= dt;
        if (s.comboT <= 0) s.combo = 0;
      }
      if (s.bannerT > 0) s.bannerT -= dt;

      // speed (auto-accelerate)
      const nMax = normalMaxFor(V);
      if (s.manual) {
        // car mode: gas / brake / reverse sab haath me
        if (s.toggleRev) {
          s.toggleRev = false;
          if (Math.abs(s.speed) < 12 * KMH) {
            s.reverse = !s.reverse;
            say(s.reverse ? 'REVERSE' : 'DRIVE', 0.9);
          } else {
            say('STOP FIRST', 0.9);
          }
        }
        braking = s.brake || s.brakeT > 0;
        const topK = (s.boostOn ? boostTopFor(V) : nMax) * (s.slowT > 0 ? 0.55 : 1);
        if (s.reverse) {
          s.speed += ((s.gas ? -18 * KMH : 0) - s.speed) * Math.min(1, dt * 1.4);
        } else if (s.gas) {
          s.speed += (topK * KMH - s.speed) * Math.min(1, V.accel * ACCEL_MUL * (s.boostOn ? 1.4 : 0.9) * dt);
        } else {
          s.speed -= s.speed * Math.min(1, dt * 0.3);
        }
        if (braking) {
          if (s.speed > 0) s.speed = Math.max(0, s.speed - 32 * dt);
          else if (s.speed < 0) s.speed = Math.min(0, s.speed + 32 * dt);
        }
      } else {
      braking = s.brakeT > 0;
      let targetKmh = NORMAL_START + (nMax - NORMAL_START) * Math.min(1, s.age / 28);
      if (s.boostOn) targetKmh = boostTopFor(V);
      let target = targetKmh * KMH;
      if (braking) target *= 0.45;
      if (s.slowT > 0) target *= 0.55;
      const k = (s.boostOn ? 1.2 : V.accel) * ACCEL_MUL * dt * (target < s.speed ? 2.5 : 1);
      s.speed += (target - s.speed) * Math.min(1, k);
      }
      const kmh = s.speed / KMH;
      if (kmh > s.topKmh) s.topKmh = kmh;

      // steering
      const lim = ROAD_HALF - V.hw;
      if (s.ctl === 'tilt' || s.manual || s.ctl === 'pads') {
        let n = s.steerBtn;
        if (s.ctl === 'tilt') {
          if (t < 0.5) tilt.cal = tilt.raw; // start par jo angle, wahi zero
          const a = tilt.raw - tilt.cal;
          const ab = a < 0 ? -a : a;
          n = ab <= DEAD_DEG ? 0 : Math.min(1, (ab - DEAD_DEG) / (s.full - DEAD_DEG));
          n = Math.pow(n, 1.4); // chhote tilt par kam, bade par zyada
          if (a < 0) n = -n;
          if (s.inv) n = -n;
        }
        s.steer += (n - s.steer) * Math.min(1, dt * (s.ctl === 'tilt' ? 6 : 8));
        const goal = s.steer * lim;
        const auth = s.manual ? Math.min(1, Math.abs(s.speed) / (25 * KMH)) : 1; // ruki gaadi mud nahi sakti
        s.x += (goal - s.x) * Math.min(1, dt * (3 + V.handling * 0.4) * auth);
        s.x = clamp(s.x, -lim, lim);
      }
      const steer = s.steer;

      // player model: bikes lean, cars roll + yaw
      player.position.set(s.x, 0, 0);
      if (V.kind === 'car') {
        player.rotation.z = -steer * 0.03;
        player.rotation.y = -steer * 0.14;
      } else {
        player.rotation.z = -steer * 0.55;
        player.rotation.y = -steer * 0.1;
      }
      const blink = s.invuln <= 0 || Math.floor(t * 14) % 2 === 0;
      const fpv = s.cam === 1;
      if (camShown !== s.cam) {
        camShown = s.cam;
        cockpit.visible = fpv && V.kind === 'car';
        if (rider) rider.visible = !fpv;
      }
      player.visible = blink && !(fpv && V.kind === 'car');
      for (let i = 0; i < pWheels.length; i++) pWheels[i].node.rotation.x -= (s.speed * dt) / pWheels[i].r;
      wheelGrp.rotation.z = -steer * 1.3;

      // brake lights
      const ti = braking ? 1.8 : 0.25;
      if (ti !== tailInt) {
        tailInt = ti;
        for (let i = 0; i < tails.length; i++) tails[i].emissiveIntensity = ti;
      }

      // distance, score, credits
      const wrongWay = s.x < 0;
      s.dist += Math.max(0, s.speed) * dt;
      if (wrongWay) s.wrongT += dt;
      if (s.boostOn) s.boostT += dt;
      if (s.combo > s.maxCombo) s.maxCombo = s.combo;
      const mult = Math.max(1, s.combo) * (wrongWay ? 2 : 1) * (s.boostOn ? 1.5 : 1);
      const gain = Math.max(0, kmh) * 0.05 * dt * mult;
      s.score += gain;
      s.credits += gain * 0.12;

      // level
      const lvl = levelFromXp(saveRef.current.xp + s.score);
      if (lvl > s.level) {
        s.level = lvl;
        const nv = VEHICLES.find((x) => x.level === lvl && !saveRef.current.owned[x.id]);
        say(nv ? `LEVEL ${lvl}!  New ride: ${nv.name}` : `LEVEL UP!  Level ${lvl}`, 2.4);
      }

      // unlock target
      if (s.goalOn && !s.goalDone && s.topKmh >= s.goal.kmh && s.near >= s.goal.near) {
        s.goalDone = true;
        s.credits += s.goal.reward;
        say(`TARGET DONE  +${fmt(s.goal.reward)}`, 2.6);
      }

      // impossible challenge: taunt voice + live check
      if (s.chOn && !s.chDone) {
        s.tauntT -= dt;
        if (s.tauntT <= 0) {
          s.tauntT = rand(18, 32);
          taunt(TAUNTS[Math.floor(Math.random() * TAUNTS.length)]);
        }
        if (chDef.live(s) >= s.ch.target) {
          s.chDone = true;
          say('CHALLENGE DONE!', 2.6);
          taunt(WIN_TAUNT);
        }
      }

      // spawn traffic + pickups
      s.spawnDist -= Math.max(0, s.speed) * dt;
      if (s.spawnDist <= 0) {
        const sector = Math.floor(s.dist / 1200);
        const density = Math.min(0.9, 0.5 + s.level * 0.02 + sector * 0.03);
        s.spawnDist = rand(20, 34) * (1 - Math.min(0.4, s.level * 0.015));
        const spawnZ = -Math.min(140, 60 + Math.max(0, s.speed) * 3);
        const used = [];
        if (Math.random() < density) {
          const count = Math.random() < 0.4 ? 2 : 1;
          const order = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
          for (let oi = 0; oi < order.length; oi++) {
            const lane = order[oi];
            if (used.length >= count) break;
            if (s.traffic.some((c) => c.lane === lane && Math.abs(c.z - spawnZ) < 30)) continue;
            used.push(lane);
            const type = pickType(s.level);
            const info = TRAFFIC[type];
            const model = makeTraffic(type, TRAFFIC_COLORS[Math.floor(Math.random() * TRAFFIC_COLORS.length)]);
            model.rotation.y = lane < 2 ? Math.PI : 0;
            const pivot = new THREE.Group();
            pivot.add(model);
            pivot.position.set(laneX(lane), 0, spawnZ);
            scene.add(pivot);
            const lt = LANE_TRAFFIC[lane];
            s.traffic.push({ lane, z: spawnZ, prevZ: spawnZ, obj: pivot, wheels: model.userData.wheels, half: info.len / 2, hw: info.hw, tv: lt.tv, frac: lt.frac, nm: false, dead: false });
          }
        }
        if (Math.random() < 0.55) {
          const free = [0, 1, 2, 3].filter((i) => used.indexOf(i) < 0);
          if (free.length) {
            const lane = free[Math.floor(Math.random() * free.length)];
            const heal = Math.random() < 0.07;
            for (let q = 0; q < (heal ? 1 : 4); q++) {
              const obj = new THREE.Group();
              if (heal) {
                obj.add(box(0.7, 0.22, 0.22, glow('#22c55e')));
                obj.add(box(0.22, 0.7, 0.22, glow('#22c55e')));
                obj.position.set(laneX(lane), 1.0, spawnZ);
              } else {
                const m = new THREE.Mesh(cylGeo(0.4, 0.1), glow('#fbbf24'));
                m.rotation.x = Math.PI / 2;
                obj.add(m);
                obj.position.set(laneX(lane), 1.0, spawnZ - q * 3);
              }
              scene.add(obj);
              s.pickups.push({ lane, z: obj.position.z, obj, heal, taken: false });
            }
          }
        }
      }

      // traffic update + collision + near miss
      for (let i = 0; i < s.traffic.length; i++) {
        const c = s.traffic[i];
        if (c.dead) continue;
        const dz = c.lane < 2 ? s.speed + c.tv : s.speed * (1 - c.frac);
        c.prevZ = c.z;
        c.z += dz * dt;
        c.obj.position.z = c.z;
        for (let j = 0; j < c.wheels.length; j++) c.wheels[j].node.rotation.x -= (dz * dt) / c.wheels[j].r;
        const cx = laneX(c.lane);
        const dx = Math.abs(cx - s.x);
        if (dx < c.hw + V.hw - 0.1 && Math.abs(c.z) < c.half + V.len / 2) {
          if (s.invuln <= 0) {
            const dmg = Math.min(70, (12 + dz * 0.9) * V.armor);
            s.hp -= dmg;
            s.invuln = 1.6;
            s.slowT = 1.2;
            s.speed *= 0.5;
            s.shake = 0.7;
            s.combo = 0;
            s.boostOn = false;
            c.dead = true;
            say(`CRASH  -${Math.round(dmg)}`, 1.2);
            buzz('crash');
            s.crashes += 1;
            if (s.chOn && !s.chDone) {
              s.tauntT = 99;
              taunt(CRASH_TAUNT);
            }
          }
        } else if (!c.nm && c.prevZ < 0 && c.z >= 0 && dx > 1.0 && dx < 3.6) {
          c.nm = true;
          s.near += 1;
          s.combo = Math.min(5, s.combo + 1);
          s.comboT = 3.5;
          s.score += 25 * s.combo;
          s.credits += 3;
          say(`NEAR MISS  x${s.combo}`, 0.9);
          buzz('near');
        }
      }

      // pickups
      for (let i = 0; i < s.pickups.length; i++) {
        const p = s.pickups[i];
        p.z += s.speed * dt;
        p.obj.position.z = p.z;
        p.obj.rotation.y += dt * 4;
        if (!p.taken && Math.abs(laneX(p.lane) - s.x) < 1.3 && Math.abs(p.z) < V.len / 2 + 0.8) {
          p.taken = true;
          if (p.heal) {
            s.hp = Math.min(100, s.hp + 25);
            say('REPAIR  +25 HP', 1.1);
          } else {
            s.credits += 10;
            s.coinN += 1;
          }
        }
      }

      // cleanup (in-place, koi naya array nahi)
      let n1 = 0;
      for (let i = 0; i < s.traffic.length; i++) {
        const c = s.traffic[i];
        if (c.dead || c.z > 30 || c.z < -220) scene.remove(c.obj);
        else s.traffic[n1++] = c;
      }
      s.traffic.length = n1;
      let n2 = 0;
      for (let i = 0; i < s.pickups.length; i++) {
        const p = s.pickups[i];
        if (p.taken || p.z > 30 || p.z < -220) scene.remove(p.obj);
        else s.pickups[n2++] = p;
      }
      s.pickups.length = n2;

      // road dashes
      dashOff = (((dashOff + s.speed * dt) % 6) + 6) % 6;
      for (let i = 0; i < dashes.length; i++) dashes[i].node.position.z = -150 + dashes[i].i * 6 + dashOff;

      // scenery
      for (let i = 0; i < scenery.length; i++) {
        const o = scenery[i];
        o.node.position.z += s.speed * dt;
        if (o.node.position.z < 30 - o.span) o.node.position.z += o.span;
        if (o.node.position.z > 30) {
          o.node.position.z -= o.span;
          if (o.jitter) o.node.position.x = o.side * (7.5 + rand(0, 5));
        }
      }

      // sky cycle
      const f = (s.dist / 1500) % SKY.length;
      const ia = Math.floor(f);
      const ib = (ia + 1) % SKY.length;
      const fr = f - ia;
      sky.copy(SKY_C[ia]).lerp(SKY_C[ib], fr);
      scene.fog.color.copy(sky);
      ambient.intensity = SKY_LIGHT[ia] + (SKY_LIGHT[ib] - SKY_LIGHT[ia]) * fr;

      // camera
      const sh = s.shake > 0 ? (Math.random() - 0.5) * s.shake : 0;
      if (s.shake > 0) s.shake = Math.max(0, s.shake - dt * 2);
      let baseFov;
      if (fpv) {
        const px = s.x + FP.x;
        camera.position.set(px + sh * 0.3, FP.y + sh * 0.2, FP.z);
        camera.lookAt(px + steer * 0.6, FP.y - 0.12, -30);
        camera.rotateZ(-steer * 0.09);
        baseFov = 72;
      } else {
        const camY = 3.6 + V.len * 0.35;
        const camZ = 7.5 + V.len * 0.55;
        camera.position.set(s.x * 0.6 + sh, camY + sh * 0.6, camZ);
        camera.lookAt(s.x * 0.4, 1.1, -14);
        camera.rotateZ(-steer * 0.05);
        baseFov = 60;
      }
      const fov = baseFov + Math.max(0, Math.min(1, s.speed / (V.maxKmh * KMH))) * 12 + (s.boostOn ? 8 : 0);
      if (Math.abs(camera.fov - fov) > 0.1) {
        camera.fov += (fov - camera.fov) * Math.min(1, dt * 4);
        camera.updateProjectionMatrix();
      }

      renderer.render(scene, camera);
      gl.endFrameEXP();
      framesRef.current += 1;

      if (s.hp <= 0) {
        finish();
        return;
      }

      hudTimer += dt;
      if (hudTimer > 0.1) {
        hudTimer = 0;
        const lpNow = levelProgress(saveRef.current.xp + s.score);
        setHud({
          kmh: Math.round(kmh),
          score: Math.floor(s.score),
          credits: Math.floor(s.credits),
          hp: Math.max(0, s.hp),
          combo: s.combo,
          level: lpNow.level,
          xpPct: lpNow.pct,
          banner: s.bannerT > 0 ? s.banner : null,
          boosting: s.boostOn,
          wrong: wrongWay,
          steer,
          ch: s.chOn && !s.chDone ? `${chDef.label(s.ch.target)}  (${fmt(Math.min(s.ch.target, chDef.live(s)))}/${fmt(s.ch.target)})` : null,
          goal: s.goalOn && !s.goalDone ? `TARGET ${Math.min(s.goal.kmh, Math.floor(s.topKmh))}/${s.goal.kmh} KM/H  •  ${Math.min(s.goal.near, s.near)}/${s.goal.near} NEAR MISS` : null,
          cam: s.cam,
          ctl: s.ctl,
          manual: s.manual,
          rev: s.reverse,
          gas: s.gas,
          brk: s.brake,
          sl: s.steerBtn < 0,
          sr: s.steerBtn > 0,
        });
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    const loop = () => {
      try {
        loopBody();
      } catch (e) {
        alive.current = false;
        console.error(e);
        setErr(String((e && e.message) || e));
      }
    };

    say('GO!', 1.0);
    rafRef.current = requestAnimationFrame(loop);
  };

  const onContextCreate = useCallback((gl) => {
    try {
      setupScene(gl);
    } catch (e) {
      alive.current = false;
      console.error(e);
      setErr(String((e && e.message) || e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // play ke bahar hamesha portrait
  useEffect(() => {
    if (screen !== 'play') {
      tilt.land = false;
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    }
  }, [screen]);

  // play se bahar jaate hi loop band
  useEffect(() => {
    if (screen !== 'play') {
      alive.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    }
  }, [screen]);

  // watchdog: 6 sec tak frame na bane to error dikhao
  useEffect(() => {
    if (screen !== 'play') return undefined;
    const id = setTimeout(() => {
      if (framesRef.current === 0 && !pausedRef.current) setErr('3D could not start (no frame was drawn in 6 seconds). Please restart the app.');
    }, 6000);
    return () => clearTimeout(id);
  }, [screen]);

  // ---------- actions ----------
  const startRun = async (vehicleId) => {
    const V = VEHICLES.find((x) => x.id === vehicleId) || VEHICLES[0];
    vehicleRef.current = V;
    const st = saveRef.current.settings;
    const ctl = tilt.ok !== false ? 'tilt' : 'pads';
    const startSpeed = NORMAL_START * KMH;
    gameRef.current = {
      ctl,
      full: FULL_DEG[st.sens] || FULL_DEG.med,
      inv: !!st.invert,
      cam: 0,
      steer: 0,
      x: 0,
      speed: startSpeed,
      dist: 0,
      score: 0,
      credits: 0,
      hp: 100,
      invuln: 0,
      slowT: 0,
      combo: 0,
      comboT: 0,
      near: 0,
      topKmh: 0,
      manual: V.kind === 'car',
      gas: false,
      brake: false,
      reverse: false,
      steerBtn: 0,
      toggleRev: false,
      goal: goalFor(V),
      goalOn: !(saveRef.current.goals || {})[V.id],
      goalDone: false,
      boostOn: false,
      toggleBoost: false,
      age: 0,
      brakeT: 0,
      shake: 0,
      level: levelFromXp(saveRef.current.xp),
      banner: null,
      bannerT: 0,
      spawnDist: 10,
      traffic: [],
      pickups: [],
      wrongT: 0,
      boostT: 0,
      maxCombo: 0,
      coinN: 0,
      crashes: 0,
      voice: st.voice !== false,
      ch: saveRef.current.challenge || makeChallenge(0),
      chOn: true,
      chDone: false,
      tauntT: 3.5,
    };
    if (V.kind === 'car') {
      // car = landscape. pehle screen ghumao, phir 3D shuru
      tilt.land = true;
      try {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
      } catch (e) {
        // lock na ho to portrait me hi chalega
      }
      await new Promise((r) => setTimeout(r, 450));
    } else {
      tilt.land = false;
    }
    tilt.cal = tilt.raw;
    framesRef.current = 0;
    pausedRef.current = true; // START dabane tak game ruka rahega
    setPaused(false);
    setReady(true);
    setErr(null);
    setHud(null);
    setScreen('play');
  };

  const owned = !!save.owned[sel];
  const v = VEHICLES.find((x) => x.id === sel);

  const drive = () => {
    setSave((p) => ({ ...p, selected: v.id }));
    startRun(v.id);
  };
  const buy = () => {
    setSave((p) => ({ ...p, credits: p.credits - v.price, owned: { ...p.owned, [v.id]: true }, selected: v.id }));
  };

  const togglePause = (on) => {
    pausedRef.current = on;
    setPaused(on);
    if (on) {
      try {
        Speech.stop();
      } catch (e) {
        // ignore
      }
    }
  };

  const startNow = () => {
    recenter();
    pausedRef.current = false;
    setReady(false);
  };
  const leaveToGarage = () => {
    alive.current = false;
    pausedRef.current = false;
    setReady(false);
    setScreen('garage');
  };

  // =====================================================================
  //  Screens
  // =====================================================================
  if (screen === 'home') {
    return (
      <View style={styles.root}>
        <StatusBar barStyle="light-content" />
        <View style={styles.homeWrap}>
          <View style={styles.homeRoad} pointerEvents="none">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <View key={i} style={[styles.homeDash, { top: 10 + i * 70 }]} />
            ))}
          </View>
          <Text style={styles.homeKicker}>NODERRA</Text>
          <Text style={styles.homeTitle}>RUSH</Text>
          <Text style={styles.homeSub}>TRAFFIC RACER 3D</Text>
          <Pressable disabled={!loaded} onPress={() => setScreen('garage')} style={[styles.startBtn, !loaded && { opacity: 0.5 }]}>
            <Text style={styles.startBtnText}>START</Text>
          </Pressable>
          <Text style={styles.homeBest}>BEST SCORE  {fmt(save.best)}</Text>
        </View>
      </View>
    );
  }

  if (screen === 'garage') {
    let label;
    let onPress = null;
    let tone = C.accent;
    if (owned) {
      label = 'DRIVE';
      onPress = drive;
    } else if (playerLevel < v.level) {
      label = `LOCKED  •  REACH LEVEL ${v.level}`;
      tone = C.line;
    } else if (save.credits < v.price) {
      label = `NEED ${fmt(v.price - save.credits)} MORE CREDITS`;
      tone = C.line;
    } else {
      label = `BUY  •  ${fmt(v.price)} CREDITS`;
      onPress = buy;
      tone = C.good;
    }
    const stg = save.settings;
    const goal = goalFor(v);
    const goalDoneV = !!(save.goals || {})[v.id];
    const list = VEHICLES.filter((x) => filter === 'all' || (filter === 'bike' ? x.kind !== 'car' : x.kind === 'car'));
    const topSpd = Math.round(boostTopFor(v));
    const ch = save.challenge || makeChallenge(0);
    const chD = CHALLENGES.find((d) => d.id === ch.id) || CHALLENGES[0];

    return (
      <View style={styles.root}>
        <StatusBar barStyle="light-content" />
        <ScrollView contentContainerStyle={styles.garageScroll} showsVerticalScrollIndicator={false}>
          <View style={styles.topRow}>
            <View>
              <Text style={styles.brand}>NODERRA RUSH</Text>
              <Text style={styles.brandSub}>GARAGE</Text>
            </View>
            <View style={styles.pill}>
              <View style={styles.coinDot} />
              <Text style={styles.pillText}>{fmt(save.credits)}</Text>
            </View>
          </View>

          <View style={styles.levelBox}>
            <View style={styles.levelRow}>
              <Text style={styles.levelText}>
                LEVEL {lp.level}  •  {rankFor(lp.level).toUpperCase()}
              </Text>
              <Text style={styles.levelSub}>
                {fmt(lp.into)} / {fmt(lp.need)} XP
              </Text>
            </View>
            <View style={styles.barBg}>
              <View style={[styles.barFill, { width: `${Math.min(100, lp.pct * 100)}%`, backgroundColor: C.cyan }]} />
            </View>
          </View>

          <View style={styles.previewBox}>
            <GaragePreview vehicleId={sel} />
            <View style={styles.previewLabel} pointerEvents="none">
              <Text style={styles.vTag}>{v.tag}</Text>
              <Text style={styles.vName}>{v.name}</Text>
            </View>
            <View style={styles.speedBadge} pointerEvents="none">
              <Text style={styles.speedBadgeNum}>{topSpd}</Text>
              <Text style={styles.speedBadgeUnit}>KM/H TOP</Text>
            </View>
            {!owned && (
              <View style={styles.lockBadge} pointerEvents="none">
                <Text style={styles.lockBadgeText}>{playerLevel < v.level ? `LOCKED  LV ${v.level}` : 'FOR SALE'}</Text>
              </View>
            )}
          </View>

          <View style={styles.statsBox}>
            <StatBar label="SPEED" value={v.stars.s} />
            <StatBar label="HANDLING" value={v.stars.h} />
            <StatBar label="ARMOR" value={v.stars.a} />
          </View>

          {v.kind === 'car' && <Text style={styles.carNote}>CAR MODE: the screen turns landscape. GAS, BRAKE, REVERSE and BOOST are on-screen pads; tilt to steer.</Text>}

          <View style={[styles.goalBox, goalDoneV && { borderColor: C.good }]}>
            <Text style={[styles.goalTitle, goalDoneV && { color: C.good }]}>{goalDoneV ? 'VEHICLE TARGET COMPLETE' : 'VEHICLE TARGET'}</Text>
            <Text style={styles.goalText}>
              In ONE run reach {goal.kmh} km/h and make {goal.near} near misses{'\n'}
              Reward: +{fmt(goal.reward)} credits{owned ? '' : '  (unlock the vehicle first)'}
            </Text>
          </View>

          <View style={styles.chipRow}>
            {[['all', 'ALL'], ['bike', 'BIKES'], ['car', 'CARS']].map(([k, l]) => (
              <Pressable key={k} onPress={() => setFilter(k)} style={[styles.chip, filter === k && styles.chipOn]}>
                <Text style={[styles.chipTxt, filter === k && { color: '#111827' }]}>{l}</Text>
              </Pressable>
            ))}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tiles}>
            {list.map((x) => {
              const isOwned = !!save.owned[x.id];
              const locked = !isOwned && playerLevel < x.level;
              const status = isOwned ? (save.selected === x.id ? 'SELECTED' : 'OWNED') : locked ? `LV ${x.level}` : fmt(x.price);
              return (
                <Pressable key={x.id} onPress={() => setSel(x.id)} style={[styles.tile, sel === x.id && styles.tileOn, locked && { opacity: 0.6 }]}>
                  <View style={[styles.tileDot, { backgroundColor: x.color }]} />
                  <Text style={styles.tileName} numberOfLines={1}>
                    {x.name}
                  </Text>
                  <Text style={styles.tileTag} numberOfLines={1}>
                    {x.tag}
                  </Text>
                  <Text style={[styles.tileStatus, isOwned && { color: C.good }, locked && { color: C.muted }]}>{status}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.chBox}>
            <View style={styles.missionHead}>
              <Text style={styles.chTitle}>IMPOSSIBLE CHALLENGE</Text>
              <Text style={styles.levelSub}>{save.challengesDone || 0} beaten</Text>
            </View>
            <Text style={styles.missionTxt}>{chD.label(ch.target)}</Text>
            <Text style={styles.chHint}>Reward +{fmt(ch.reward)} credits. A voice will mock you during the run...</Text>
          </View>

          <View style={styles.missionBox}>
            <View style={styles.missionHead}>
              <Text style={styles.setTitle}>MISSIONS</Text>
              <Text style={styles.levelSub}>{save.missionsDone || 0} completed</Text>
            </View>
            {(save.missions || []).map((m) => {
              const def = MISSION_DEFS.find((d) => d.type === m.type);
              if (!def) return null;
              const pct = Math.min(1, m.progress / m.target);
              return (
                <View key={m.id} style={styles.missionRow}>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={styles.missionTxt}>{def.label(m.target)}</Text>
                    <View style={styles.barBg}>
                      <View style={[styles.barFill, { width: `${pct * 100}%`, backgroundColor: C.gold }]} />
                    </View>
                  </View>
                  <Text style={styles.missionReward}>+{fmt(m.reward)}</Text>
                </View>
              );
            })}
          </View>

          <View style={styles.setBox}>
            <Text style={styles.setTitle}>SETTINGS</Text>
            <View style={styles.setRow}>
              <Text style={styles.setLabel}>Tilt sensitivity</Text>
              <Seg opts={[['low', 'Low'], ['med', 'Medium'], ['high', 'High']]} value={stg.sens} onChange={(k) => setSetting('sens', k)} />
            </View>
            <View style={styles.setRow}>
              <Text style={styles.setLabel}>Invert steering</Text>
              <Seg opts={[[false, 'Off'], [true, 'On']]} value={!!stg.invert} onChange={(k) => setSetting('invert', k)} />
            </View>
            <View style={styles.setRow}>
              <Text style={styles.setLabel}>Challenge voice</Text>
              <Seg opts={[[true, 'On'], [false, 'Off']]} value={stg.voice !== false} onChange={(k) => setSetting('voice', k)} />
            </View>
            {notice && <Text style={styles.notice}>{notice}</Text>}
            <Text style={styles.setHint}>
              Tilt your phone like a steering wheel. Tap the screen to turn boost on/off, swipe down to brake. The angle you hold when you press START is "straight".
            </Text>
          </View>

          <Text style={styles.footer}>BEST SCORE  {fmt(save.best)}   •   RUNS  {fmt(save.runs || 0)}</Text>
          <Text style={styles.howto}>The left half of the road is oncoming traffic: score x2, but much riskier.</Text>
        </ScrollView>

        <View style={styles.bottomBar}>
          <Pressable disabled={!onPress} onPress={onPress || undefined} style={[styles.mainBtn, { backgroundColor: tone, marginTop: 0 }, !onPress && { opacity: 0.85 }]}>
            <Text style={[styles.mainBtnText, !onPress && { color: C.muted }]}>{label}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (screen === 'over' && result) {
    const gotLevel = result.lvAfter > result.lvBefore;
    return (
      <View style={styles.root}>
        <StatusBar barStyle="light-content" />
        <ScrollView contentContainerStyle={styles.overScroll} showsVerticalScrollIndicator={false}>
          <Text style={styles.overTitle}>RUN COMPLETE</Text>
          {result.newBest && <Text style={styles.newBest}>NEW BEST!</Text>}
          <Text style={styles.bigScore}>{fmt(result.score)}</Text>
          <Text style={styles.bigScoreSub}>SCORE</Text>

          <View style={styles.grid}>
            {[
              ['DISTANCE', `${fmt(result.dist)} m`],
              ['NEAR MISSES', String(result.near)],
              ['TOP SPEED', `${result.topKmh} km/h`],
              ['CREDITS EARNED', `+${fmt(result.earned)}`],
            ].map(([a, b]) => (
              <View key={a} style={styles.gridCell}>
                <Text style={styles.gridVal}>{b}</Text>
                <Text style={styles.gridLabel}>{a}</Text>
              </View>
            ))}
          </View>

          <View style={styles.levelBox}>
            <View style={styles.levelRow}>
              <Text style={styles.levelText}>LEVEL {lp.level}</Text>
              <Text style={styles.levelSub}>+{fmt(result.score)} XP</Text>
            </View>
            <View style={styles.barBg}>
              <View style={[styles.barFill, { width: `${Math.min(100, lp.pct * 100)}%`, backgroundColor: C.cyan }]} />
            </View>
            {gotLevel && (
              <Text style={styles.levelUp}>
                Level up! {result.lvBefore} → {result.lvAfter}
              </Text>
            )}
          </View>

          {result.unlockedNow.length > 0 && (
            <View style={styles.unlockBox}>
              <Text style={styles.unlockTitle}>NEW RIDE AVAILABLE</Text>
              <Text style={styles.unlockText}>{result.unlockedNow.join(', ')}  (buy it in the Garage)</Text>
            </View>
          )}

          {result.levelBonus > 0 && (
            <View style={styles.unlockBox}>
              <Text style={styles.unlockTitle}>LEVEL BONUS</Text>
              <Text style={styles.unlockText}>+{fmt(result.levelBonus)} credits for levelling up</Text>
            </View>
          )}

          {result.missionsDone.length > 0 && (
            <View style={styles.unlockBox}>
              <Text style={styles.unlockTitle}>MISSION COMPLETE  +{fmt(result.missionReward)}</Text>
              {result.missionsDone.map((t) => (
                <Text key={t} style={styles.unlockText}>
                  {t}
                </Text>
              ))}
            </View>
          )}

          <View style={[styles.chBox, result.chOk && { borderColor: C.good }]}>
            <Text style={[styles.chTitle, result.chOk && { color: C.good }]}>{result.chOk ? 'IMPOSSIBLE CHALLENGE BEATEN!' : 'CHALLENGE NOT BEATEN'}</Text>
            <Text style={styles.missionTxt}>{result.chText}</Text>
            <Text style={styles.chHint}>{result.chOk ? `+${fmt(result.chBonus)} credits. A harder one is waiting...` : 'The voice laughs at you. Try again?'}</Text>
          </View>

          {result.goal > 0 && (
            <View style={styles.unlockBox}>
              <Text style={styles.unlockTitle}>TARGET COMPLETE</Text>
              <Text style={styles.unlockText}>+{fmt(result.goal)} credits bonus (added to credits earned)</Text>
            </View>
          )}

          <Pressable onPress={() => startRun(save.selected)} style={[styles.mainBtn, { backgroundColor: C.accent }]}>
            <Text style={styles.mainBtnText}>RETRY</Text>
          </Pressable>
          <Pressable onPress={() => setScreen('garage')} style={[styles.mainBtn, styles.ghostBtn]}>
            <Text style={[styles.mainBtnText, { color: C.text }]}>GARAGE</Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  // ---------- play ----------
  const hp = hud ? hud.hp : 100;
  const hpColor = hp > 55 ? C.good : hp > 28 ? C.gold : C.bad;
  return (
    <View
      ref={rootRef}
      onLayout={onRootLayout}
      onTouchStart={(e) => handlePads(e, 'start')}
      onTouchMove={(e) => handlePads(e, 'move')}
      onTouchEnd={(e) => handlePads(e, 'end')}
      onTouchCancel={(e) => handlePads(e, 'end')}
      style={styles.playRoot}
      {...pan.panHandlers}
    >
      <StatusBar barStyle="light-content" />
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <GLView style={StyleSheet.absoluteFill} onContextCreate={onContextCreate} />
      </View>

      {hud && (
        <>
          <View style={styles.hudTop} pointerEvents="none">
            <View style={styles.hudBlock}>
              <Text style={styles.speedNum}>{hud.kmh}</Text>
              <Text style={styles.speedUnit}>KM/H</Text>
            </View>
            <View style={[styles.hudBlock, { alignItems: 'center' }]}>
              <Text style={styles.scoreNum}>{fmt(hud.score)}</Text>
              <Text style={styles.speedUnit}>SCORE{hud.combo > 1 ? `  •  COMBO x${hud.combo}` : ''}</Text>
            </View>
            <View style={[styles.hudBlock, { alignItems: 'flex-end' }]}>
              <View style={styles.pill}>
                <View style={styles.coinDot} />
                <Text style={styles.pillText}>{fmt(hud.credits)}</Text>
              </View>
              <Text style={styles.speedUnit}>LV {hud.level}</Text>
            </View>
          </View>

          <View style={styles.xpStrip} pointerEvents="none">
            <View style={[styles.xpFill, { width: `${Math.min(100, hud.xpPct * 100)}%` }]} />
          </View>

          <View style={styles.topBtns}>
            <Pressable onPress={toggleCam} style={styles.smallBtn}>
              <Text style={styles.smallText}>{hud.cam ? 'CAM: 1ST' : 'CAM: CHASE'}</Text>
            </Pressable>
            {hud.ctl === 'tilt' && (
              <Pressable onPress={recenter} style={styles.smallBtn}>
                <Text style={styles.smallText}>RE-CENTER</Text>
              </Pressable>
            )}
            <Pressable onPress={() => togglePause(true)} style={styles.smallBtn}>
              <Text style={styles.smallText}>PAUSE</Text>
            </Pressable>
          </View>

          {(hud.manual || hud.ctl === 'pads') && padSize.w > 0 && (() => {
            const Z = padZones(padSize.w, padSize.h, !hud.manual);
            const pad = (key, label, on, color) => (
              <View
                key={key}
                pointerEvents="none"
                style={[styles.pad, { left: Z[key][0], top: Z[key][1], width: Z[key][2], height: Z[key][3], borderColor: color }, on && { backgroundColor: color }]}
              >
                <Text style={[styles.padText, on && { color: '#06202a' }]}>{label}</Text>
              </View>
            );
            return (
              <>
                {hud.manual && pad('gas', 'GAS', hud.gas, C.good)}
                {hud.manual && pad('brake', 'BRAKE', hud.brk, C.bad)}
                {pad('boost', hud.boosting ? 'BOOST ON' : 'BOOST', hud.boosting, C.cyan)}
                {hud.manual && pad('rev', hud.rev ? 'REVERSE' : 'DRIVE', hud.rev, C.gold)}
                {hud.ctl === 'pads' && pad('left', 'LEFT', hud.sl, C.accent)}
                {hud.ctl === 'pads' && pad('right', 'RIGHT', hud.sr, C.accent)}
              </>
            );
          })()}

          {hud.boosting && (
            <View style={styles.boostTag} pointerEvents="none">
              <Text style={styles.boostText}>BOOST</Text>
            </View>
          )}

          {hud.wrong && (
            <View style={styles.wrongTag} pointerEvents="none">
              <Text style={styles.wrongText}>WRONG WAY  x2</Text>
            </View>
          )}

          {hud.banner && (
            <View style={styles.banner} pointerEvents="none">
              <Text style={styles.bannerText}>{hud.banner}</Text>
            </View>
          )}

          <View style={[styles.hudBottom, hud.manual && { left: 310, right: 310 }]}>
            {hud.ch && (
              <Text style={styles.chHud} pointerEvents="none">
                {hud.ch}
              </Text>
            )}
            {hud.goal && (
              <Text style={styles.goalHud} pointerEvents="none">
                {hud.goal}
              </Text>
            )}
            {hud.ctl === 'tilt' && (
              <View style={styles.steerTrack} pointerEvents="none">
                <View style={styles.steerMid} />
                <View style={[styles.steerDot, { left: `${50 + hud.steer * 46}%` }]} />
              </View>
            )}
            <View style={styles.hpBox} pointerEvents="none">
              <Text style={styles.hpLabel}>HEALTH</Text>
              <View style={styles.hpBg}>
                <View style={[styles.hpFill, { width: `${hp}%`, backgroundColor: hpColor }]} />
              </View>
            </View>
          </View>
        </>
      )}

      {paused && (
        <View style={styles.overlay}>
          <Text style={styles.overTitle}>PAUSED</Text>
          <Pressable
            onPress={() => {
              recenter();
              togglePause(false);
            }}
            style={[styles.mainBtn, { backgroundColor: C.accent, width: 240 }]}
          >
            <Text style={styles.mainBtnText}>RESUME</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              pausedRef.current = false;
              setPaused(false);
              if (finishRef.current) finishRef.current();
            }}
            style={[styles.mainBtn, styles.ghostBtn, { width: 240 }]}
          >
            <Text style={[styles.mainBtnText, { color: C.text }]}>END RUN</Text>
          </Pressable>
        </View>
      )}

      {ready && !err && (
        <View style={styles.overlay}>
          <Text style={styles.readyKicker}>{vehicleRef.current.name.toUpperCase()}</Text>
          <Text style={styles.overTitle}>READY?</Text>
          <Text style={styles.readyHint}>
            {tilt.ok === false
              ? 'Use the LEFT / RIGHT buttons to steer. Tap START when you are ready.'
              : 'Hold your phone the way you want to drive. The angle you hold when you tap START becomes "straight".'}
          </Text>
          <Pressable onPress={startNow} style={[styles.startBtn, { width: 240 }]}>
            <Text style={styles.startBtnText}>START</Text>
          </Pressable>
          <Pressable onPress={leaveToGarage} style={[styles.mainBtn, styles.ghostBtn, { width: 240 }]}>
            <Text style={[styles.mainBtnText, { color: C.text }]}>BACK TO GARAGE</Text>
          </Pressable>
        </View>
      )}

      {err && (
        <View style={styles.overlay}>
          <Text style={[styles.overTitle, { color: C.bad }]}>3D problem</Text>
          <Text style={styles.errText}>{err}</Text>
          <Pressable
            onPress={() => {
              setErr(null);
              setScreen('garage');
            }}
            style={[styles.mainBtn, { backgroundColor: C.accent, width: 240 }]}
          >
            <Text style={styles.mainBtnText}>GARAGE</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// =====================================================================
//  Styles
// =====================================================================
const topPad = Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 8 : 54;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  playRoot: { flex: 1, backgroundColor: '#000' },

  garageScroll: { paddingTop: topPad, paddingHorizontal: 16, paddingBottom: 110 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brand: { color: C.text, fontSize: 24, fontWeight: '900', letterSpacing: 2 },
  brandSub: { color: C.accent, fontSize: 11, fontWeight: '800', letterSpacing: 3, marginTop: 2 },
  pill: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderColor: C.line, borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  coinDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: C.gold, marginRight: 8, borderWidth: 2, borderColor: '#b45309' },
  pillText: { color: C.text, fontSize: 16, fontWeight: '800' },

  levelBox: { backgroundColor: C.card, borderColor: C.line, borderWidth: 1, borderRadius: 14, padding: 12, marginTop: 14 },
  levelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  levelText: { color: C.text, fontSize: 14, fontWeight: '800', letterSpacing: 1 },
  levelSub: { color: C.muted, fontSize: 12, fontWeight: '600' },
  levelUp: { color: C.cyan, fontWeight: '800', marginTop: 8, fontSize: 13 },
  barBg: { height: 8, borderRadius: 4, backgroundColor: C.line, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },

  previewBox: { height: 290, borderRadius: 18, overflow: 'hidden', marginTop: 14, borderWidth: 1, borderColor: C.line, backgroundColor: '#0e1626' },
  previewGL: { flex: 1 },
  previewErr: { position: 'absolute', left: 10, right: 10, top: 10, color: C.bad, fontSize: 11 },
  previewLabel: { position: 'absolute', left: 14, top: 12 },
  vTag: { color: C.accent, fontSize: 11, fontWeight: '800', letterSpacing: 2 },
  vName: { color: C.text, fontSize: 22, fontWeight: '900', marginTop: 2 },
  lockBadge: { position: 'absolute', right: 12, top: 12, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, borderWidth: 1, borderColor: C.line },
  lockBadgeText: { color: C.gold, fontSize: 12, fontWeight: '800' },

  statsBox: { backgroundColor: C.card, borderColor: C.line, borderWidth: 1, borderRadius: 14, padding: 12, marginTop: 14 },
  statRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 4 },
  statLabel: { width: 86, color: C.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  segRow: { flex: 1, flexDirection: 'row' },
  seg: { flex: 1, height: 8, borderRadius: 2, backgroundColor: C.line, marginRight: 3 },

  tiles: { paddingVertical: 14 },
  tile: { width: 112, backgroundColor: C.card, borderColor: C.line, borderWidth: 1, borderRadius: 14, padding: 10, marginRight: 10 },
  tileOn: { borderColor: C.accent },
  tileDot: { width: 22, height: 6, borderRadius: 3, marginBottom: 8 },
  tileName: { color: C.text, fontSize: 13, fontWeight: '800' },
  tileStatus: { color: C.gold, fontSize: 12, fontWeight: '800', marginTop: 4 },

  mainBtn: { borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  mainBtnText: { color: '#111827', fontSize: 16, fontWeight: '900', letterSpacing: 1 },
  ghostBtn: { backgroundColor: 'transparent', borderWidth: 1, borderColor: C.line },
  footer: { color: C.muted, textAlign: 'center', marginTop: 16, fontSize: 12, fontWeight: '800', letterSpacing: 2 },
  howto: { color: C.muted, textAlign: 'center', marginTop: 10, fontSize: 12, lineHeight: 18 },

  setBox: { backgroundColor: C.card, borderColor: C.line, borderWidth: 1, borderRadius: 14, padding: 12, marginTop: 14 },
  setTitle: { color: C.muted, fontSize: 11, fontWeight: '800', letterSpacing: 2, marginBottom: 6 },
  setRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 5 },
  setLabel: { color: C.text, fontSize: 13, fontWeight: '700', flexShrink: 1, marginRight: 8 },
  setHint: { color: C.muted, fontSize: 11, lineHeight: 16, marginTop: 8 },
  notice: { color: C.gold, fontSize: 12, fontWeight: '700', marginTop: 6 },
  seg2: { flexDirection: 'row', backgroundColor: C.bg, borderRadius: 10, borderWidth: 1, borderColor: C.line, overflow: 'hidden' },
  segBtn: { paddingHorizontal: 12, paddingVertical: 7 },
  segOn: { backgroundColor: C.accent },
  segTxt: { color: C.muted, fontSize: 12, fontWeight: '800' },

  overScroll: { paddingTop: topPad + 10, paddingHorizontal: 16, paddingBottom: 40, alignItems: 'stretch' },
  overTitle: { color: C.text, fontSize: 26, fontWeight: '900', letterSpacing: 2, textAlign: 'center' },
  newBest: { color: C.gold, textAlign: 'center', fontWeight: '900', letterSpacing: 3, marginTop: 6 },
  bigScore: { color: C.accent, fontSize: 56, fontWeight: '900', textAlign: 'center', marginTop: 12 },
  bigScoreSub: { color: C.muted, textAlign: 'center', fontSize: 12, fontWeight: '800', letterSpacing: 3, marginBottom: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  gridCell: { width: '48%', margin: '1%', backgroundColor: C.card, borderColor: C.line, borderWidth: 1, borderRadius: 14, padding: 12 },
  gridVal: { color: C.text, fontSize: 20, fontWeight: '900' },
  gridLabel: { color: C.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1, marginTop: 4 },
  unlockBox: { backgroundColor: 'rgba(34,197,94,0.12)', borderColor: C.good, borderWidth: 1, borderRadius: 14, padding: 12, marginTop: 12, marginBottom: 6 },
  unlockTitle: { color: C.good, fontSize: 12, fontWeight: '900', letterSpacing: 2 },
  unlockText: { color: C.text, marginTop: 4, fontSize: 13 },

  hudTop: { position: 'absolute', top: topPad, left: 14, right: 14, flexDirection: 'row', justifyContent: 'space-between' },
  hudBlock: { minWidth: 90 },
  speedNum: { color: C.text, fontSize: 38, fontWeight: '900', textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 4 },
  scoreNum: { color: C.text, fontSize: 26, fontWeight: '900', textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 4 },
  speedUnit: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '800', letterSpacing: 2, textShadowColor: 'rgba(0,0,0,0.7)', textShadowRadius: 3 },
  xpStrip: { position: 'absolute', top: topPad - 8, left: 14, right: 14, height: 3, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 2 },
  xpFill: { height: 3, backgroundColor: C.cyan, borderRadius: 2 },
  boostTag: { position: 'absolute', top: topPad + 106, left: 14, backgroundColor: 'rgba(34,211,238,0.85)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10 },
  boostText: { color: '#06202a', fontWeight: '900', fontSize: 12, letterSpacing: 2 },
  wrongTag: { position: 'absolute', top: topPad + 106, alignSelf: 'center', backgroundColor: 'rgba(239,68,68,0.85)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10 },
  wrongText: { color: '#fff', fontWeight: '900', fontSize: 12, letterSpacing: 2 },
  banner: { position: 'absolute', top: '26%', alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.65)', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 14 },
  bannerText: { color: C.gold, fontSize: 22, fontWeight: '900', letterSpacing: 1 },

  hudBottom: { position: 'absolute', left: 14, right: 14, bottom: 24 },
  goalHud: { color: C.gold, fontSize: 11, fontWeight: '900', letterSpacing: 1, textAlign: 'center', marginBottom: 6, textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 3 },
  goalBox: { backgroundColor: C.card, borderColor: C.gold, borderWidth: 1, borderRadius: 14, padding: 12, marginTop: 12 },
  goalTitle: { color: C.gold, fontSize: 11, fontWeight: '900', letterSpacing: 2 },
  goalText: { color: C.text, fontSize: 13, marginTop: 4, lineHeight: 18 },
  steerTrack: { alignSelf: 'center', width: 150, height: 14, marginBottom: 8, justifyContent: 'center' },
  steerMid: { position: 'absolute', left: 0, right: 0, top: 6, height: 2, backgroundColor: 'rgba(255,255,255,0.35)', borderRadius: 1 },
  steerDot: { position: 'absolute', top: 1, width: 12, height: 12, marginLeft: -6, borderRadius: 6, backgroundColor: C.cyan },
  hpBox: { marginBottom: 10 },
  hpLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 10, fontWeight: '800', letterSpacing: 2, marginBottom: 4, textShadowColor: 'rgba(0,0,0,0.7)', textShadowRadius: 3 },
  hpBg: { height: 10, borderRadius: 5, backgroundColor: 'rgba(0,0,0,0.55)', overflow: 'hidden' },
  hpFill: { height: 10, borderRadius: 5 },
  btnRow: { flexDirection: 'row', alignItems: 'flex-end' },
  ctrlBtn: { backgroundColor: 'rgba(0,0,0,0.55)', borderWidth: 2, borderColor: C.line, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  bigBtn: { flex: 1, height: 78 },
  ctrlText: { color: C.text, fontWeight: '900', fontSize: 15, letterSpacing: 1 },
  topBtns: { position: 'absolute', top: topPad + 62, alignSelf: 'center', flexDirection: 'row' },
  pad: { position: 'absolute', borderWidth: 2, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  padText: { color: C.text, fontSize: 16, fontWeight: '900', letterSpacing: 1 },
  carNote: { color: C.cyan, fontSize: 12, fontWeight: '700', marginTop: 10, textAlign: 'center' },
  smallBtn: { backgroundColor: 'rgba(0,0,0,0.45)', borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingVertical: 7, paddingHorizontal: 10, alignItems: 'center', marginHorizontal: 4 },
  smallText: { color: C.text, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  cdBg: { width: '70%', height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', marginTop: 6, overflow: 'hidden' },
  cdFill: { height: 3, backgroundColor: C.cyan },

  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(11,18,32,0.92)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  errText: { color: C.text, fontSize: 14, textAlign: 'center', marginVertical: 14 },

  homeWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  homeRoad: { position: 'absolute', top: 0, bottom: 0, left: '50%', width: 200, marginLeft: -100, backgroundColor: '#141c30' },
  homeDash: { position: 'absolute', left: 97, width: 6, height: 36, borderRadius: 3, backgroundColor: '#fbbf24' },
  homeKicker: { color: C.cyan, fontSize: 18, fontWeight: '900', letterSpacing: 10 },
  homeTitle: { color: C.accent, fontSize: 84, fontWeight: '900', letterSpacing: 6, marginTop: 4 },
  homeSub: { color: C.text, fontSize: 13, fontWeight: '800', letterSpacing: 5, marginBottom: 40 },
  startBtn: { backgroundColor: C.accent, borderRadius: 18, paddingVertical: 18, paddingHorizontal: 70, alignItems: 'center' },
  startBtnText: { color: '#111827', fontSize: 22, fontWeight: '900', letterSpacing: 4 },
  homeBest: { color: C.muted, marginTop: 22, fontSize: 12, fontWeight: '800', letterSpacing: 2 },

  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 22, backgroundColor: 'rgba(11,18,32,0.96)', borderTopWidth: 1, borderTopColor: C.line },
  speedBadge: { position: 'absolute', right: 12, bottom: 10, alignItems: 'flex-end' },
  speedBadgeNum: { color: C.cyan, fontSize: 30, fontWeight: '900' },
  speedBadgeUnit: { color: C.muted, fontSize: 10, fontWeight: '800', letterSpacing: 2 },
  tileTag: { color: C.muted, fontSize: 9, fontWeight: '800', letterSpacing: 1, marginTop: 2 },
  chipRow: { flexDirection: 'row', marginTop: 14 },
  chip: { borderWidth: 1, borderColor: C.line, backgroundColor: C.card, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 6, marginRight: 8 },
  chipOn: { backgroundColor: C.accent, borderColor: C.accent },
  chipTxt: { color: C.muted, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  missionBox: { backgroundColor: C.card, borderColor: C.line, borderWidth: 1, borderRadius: 14, padding: 12, marginTop: 4 },
  missionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  missionRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  missionTxt: { color: C.text, fontSize: 13, fontWeight: '700', marginBottom: 6 },
  missionReward: { color: C.gold, fontSize: 13, fontWeight: '900' },
  chBox: { backgroundColor: 'rgba(239,68,68,0.10)', borderColor: C.bad, borderWidth: 1, borderRadius: 14, padding: 12, marginTop: 4, marginBottom: 10 },
  chTitle: { color: C.bad, fontSize: 11, fontWeight: '900', letterSpacing: 2 },
  chHint: { color: C.muted, fontSize: 11, marginTop: 2 },
  chHud: { color: '#fca5a5', fontSize: 11, fontWeight: '900', letterSpacing: 1, textAlign: 'center', marginBottom: 4, textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 3 },
  readyKicker: { color: C.accent, fontSize: 13, fontWeight: '900', letterSpacing: 3, marginBottom: 6 },
  readyHint: { color: C.text, fontSize: 14, textAlign: 'center', lineHeight: 20, marginVertical: 18, maxWidth: 320 },
});
