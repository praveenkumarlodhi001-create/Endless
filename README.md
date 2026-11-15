# Noderra Rush: Traffic Racer

3D endless traffic racer (React Native + Expo SDK 58 + three.js 0.162). Tilt-only steering.

## Run
```
npm install
npx expo install --fix
npx expo start -c
```
`expo-speech` (challenge voice) is in package.json; `expo install --fix` pins the right SDK version.

## Controls
- Tilt phone = steer (angle at START tap = straight). Tap = boost, swipe down = brake.
- Car mode (landscape): GAS / BRAKE / REVERSE / BOOST pads + tilt steering.
- If a phone has no tilt sensor, on-screen LEFT/RIGHT buttons are used.

## Game systems
- 17 vehicles (Lv 1–35), endless levels with ranks + level-up credit bonus.
- 3 rolling missions (get harder every 3 completions), per-vehicle targets.
- Impossible Challenge: one-run hard task, taunting Hindi voice (device TTS, can be turned off).
- `ALL_IMPOSSIBLE` flag in App.js: set `true` to make all normal missions 4x harder.

## Play Store build
See `store/PLAY_CONSOLE_CHECKLIST.md`. `eas build -p android --profile production` makes the .aab.
