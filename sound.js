// Noderra Rush - sound manager (expo-audio)
// Saari awaazein assets/sounds/ me hain (generated WAV). Sab kuch try/catch me hai,
// taaki audio kisi phone par na chale to bhi game na ruke.
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';

const SRC = {
  music: require('./assets/sounds/music.wav'),
  crash: require('./assets/sounds/crash.wav'),
  siren: require('./assets/sounds/siren.wav'),
  screech: require('./assets/sounds/screech.wav'),
  gasp: require('./assets/sounds/gasp.wav'),
  thud: require('./assets/sounds/thud.wav'),
  screech: require('./assets/sounds/screech.wav'),
  gasp: require('./assets/sounds/gasp.wav'),
  thud: require('./assets/sounds/thud.wav'),
  near: require('./assets/sounds/near.wav'),
  coin: require('./assets/sounds/coin.wav'),
  heal: require('./assets/sounds/heal.wav'),
  boost: require('./assets/sounds/boost.wav'),
  levelup: require('./assets/sounds/levelup.wav'),
  win: require('./assets/sounds/win.wav'),
  click: require('./assets/sounds/click.wav'),
  start: require('./assets/sounds/start.wav'),
  eng_cycle: require('./assets/sounds/eng_cycle.wav'),
  eng_bike: require('./assets/sounds/eng_bike.wav'),
  eng_cruiser: require('./assets/sounds/eng_cruiser.wav'),
  eng_sport: require('./assets/sounds/eng_sport.wav'),
  eng_car: require('./assets/sounds/eng_car.wav'),
  eng_v8: require('./assets/sounds/eng_v8.wav'),
  eng_diesel: require('./assets/sounds/eng_diesel.wav'),
  eng_ev: require('./assets/sounds/eng_ev.wav'),
};

// kaunsi gaadi ka kaunsa engine sound
const ENGINE_OF = {
  cycle: 'cycle',
  street: 'bike',
  naked: 'bike',
  adv: 'bike',
  cruiser: 'cruiser',
  sport: 'sport',
  hyper: 'sport',
  hatch: 'car',
  sedan: 'car',
  coupe: 'car',
  suv: 'car',
  rally: 'car',
  super: 'sport',
  dune: 'diesel',
  muscle: 'v8',
  volt: 'ev',
  phantom: 'sport',
};

const cfg = { master: true, music: true, engine: true, sfx: true };
const players = {};
let suspended = false;
let musicWanted = false;
let musicVol = 0.35;
let engKey = null;
let lastRate = 0;

const getPlayer = (k) => {
  if (players[k] === undefined) {
    try {
      players[k] = createAudioPlayer(SRC[k]);
    } catch (e) {
      players[k] = null;
    }
  }
  return players[k];
};
const safe = (fn) => {
  try {
    fn();
  } catch (e) {
    // audio fail ho to chalta hai
  }
};
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const musicOk = () => cfg.master && cfg.music && !suspended;
const engineOk = () => cfg.master && cfg.engine && !suspended;
const sfxOk = () => cfg.master && cfg.sfx && !suspended;

const applyMusic = () => {
  const p = getPlayer('music');
  if (!p) return;
  safe(() => {
    p.loop = true;
    p.volume = musicVol;
    if (musicWanted && musicOk()) {
      if (!p.playing) p.play();
    } else {
      p.pause();
    }
  });
};

const Sound = {
  init() {
    safe(() => {
      const r = setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false, interruptionMode: 'mixWithOthers' });
      if (r && r.catch) r.catch(() => {});
    });
  },

  // settings: { sound, music, engine, sfx }  (undefined = on)
  configure(st) {
    cfg.master = !st || st.sound !== false;
    cfg.music = !st || st.music !== false;
    cfg.engine = !st || st.engine !== false;
    cfg.sfx = !st || st.sfx !== false;
    applyMusic();
    if (!engineOk()) Sound.engineStop();
  },

  engineKeyFor(vehicleId) {
    return ENGINE_OF[vehicleId] || 'car';
  },

  music(on, vol) {
    musicWanted = on;
    if (typeof vol === 'number') musicVol = vol;
    applyMusic();
  },

  sfx(key, vol = 1) {
    if (!sfxOk()) return;
    const p = getPlayer(key);
    if (!p) return;
    safe(() => {
      p.volume = vol;
      p.seekTo(0);
      p.play();
    });
  },

  engineStart(kind) {
    if (engKey && engKey !== kind) Sound.engineStop();
    engKey = kind;
    lastRate = 0;
    if (!engineOk()) return;
    const p = getPlayer(`eng_${kind}`);
    if (!p) return;
    safe(() => {
      p.loop = true;
      p.shouldCorrectPitch = false; // speed badhne par pitch badhe
      p.volume = 0.4;
      p.seekTo(0);
      p.play();
    });
  },

  // ratio = speed / maxSpeed (0..1+)
  engineUpdate(ratio, boosting) {
    if (!engKey || !engineOk()) return;
    const p = getPlayer(`eng_${engKey}`);
    if (!p) return;
    const r = clamp(ratio, 0, 1.2);
    const rate = clamp(0.7 + r * 1.2 + (boosting ? 0.12 : 0), 0.6, 2.0);
    safe(() => {
      if (!p.playing) p.play();
      p.volume = clamp(0.3 + r * 0.5 + (boosting ? 0.1 : 0), 0, 1);
      if (Math.abs(rate - lastRate) > 0.03) {
        lastRate = rate;
        if (typeof p.setPlaybackRate === 'function') p.setPlaybackRate(rate);
        else p.playbackRate = rate;
      }
    });
  },

  engineStop() {
    if (!engKey) return;
    const p = getPlayer(`eng_${engKey}`);
    engKey = null;
    if (p) safe(() => p.pause());
  },

  // app background me jaye to sab band, wapas aaye to music wapas
  suspend(on) {
    suspended = on;
    if (on) {
      Sound.engineStop();
      const p = getPlayer('music');
      if (p) safe(() => p.pause());
    } else {
      applyMusic();
    }
  },
};

export default Sound;
