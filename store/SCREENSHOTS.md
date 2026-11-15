# Screenshots — kya lena hai

Play Store rules: screenshots **asli gameplay** hone chahiye (fake/mockup nahi, warna reject ho sakta hai).
Required: minimum 2 phone screenshots (recommended 4–8). PNG/JPG, 16:9 ya 9:16, side 320–3840 px.

## Shot list (phone par lo: Power + Volume Down)
0. Home/START screen
1. Garage — kisi achhi gaadi ka 3D preview (Sport R600 ya Apex Super)
2. Gameplay portrait — chase camera, traffic ke beech, speed dikhti hui
3. Boost on — high speed (150+ km/h) wala frame
4. Near miss / score popup wala moment
5. Night ya sunset wala gameplay
6. Car mode landscape (GAS/BRAKE pads dikhte hue)
7. Garage — vehicle list / unlock targets
8. Game over / result screen
9. Impossible Challenge card + Missions in Garage

## Frame + caption banane ke liye
```
cd store
mkdir raw        # yaha apne screenshots rakho (order = shot number)
python3 make_screenshots.py
```
Output `store/out/shot_01.png ...` (1080x1920 ya landscape 1920x1080) seedha Play Console me upload karo.
Tablet screenshots optional hain (7"/10") — pehli release ke liye zaroori nahi.

## Graphics jo already ready hain
- `play-icon-512.png` — Hi-res app icon (512x512)
- `feature-graphic-1024x500.png` — Feature graphic
