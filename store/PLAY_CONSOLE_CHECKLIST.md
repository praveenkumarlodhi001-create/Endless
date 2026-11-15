# Play Console — Step by step (Noderra Rush: Traffic Racer)

## 0. Pehle (aapko karna hai, main nahi kar sakta)
- [ ] Google Play Developer account ($25 one-time). **Personal account** ho to: production se pehle **12+ testers ke saath 14 din closed testing** zaroori hai.
- [ ] Expo account: https://expo.dev (free)
- [ ] Privacy policy ko public URL par host karo (GitHub Pages / Google Sites / Noderra site). Play Console ko URL chahiye, file nahi. Text: `PRIVACY_POLICY.md`
- [ ] Package name `com.noderra.rush3d` (unique, Noderra brand). Upload ke baad badal nahi sakta. **Play Store me "Noderra Rush" naam search karke confirm kar lo ki kisi aur ka app is naam se nahi hai.**

## 1. AAB build (.aab — Play Store APK nahi leta)
```
npm install
npx expo install --fix
npm install -g eas-cli
eas login
eas build:configure        # agar puche
eas build -p android --profile production
```
Pehli baar keystore puche to "Generate new keystore" chuno (EAS sambhal lega). Build khatam hone par .aab download link milega.
Test ke liye APK: `eas build -p android --profile preview`

## 2. Play Console me app banao
Create app → Name: Noderra Rush: Traffic Racer · Default language: English (India) · **Game** · **Free** · declarations tick.

## 3. Store listing
- Texts: `LISTING.md`
- Icon 512x512: `play-icon-512.png`
- Feature graphic: `feature-graphic-1024x500.png`
- Phone screenshots (min 2): `SCREENSHOTS.md` + `make_screenshots.py`

## 4. App content (Policy) — jawab
| Section | Answer |
|---|---|
| Privacy policy | Hosted URL daalo |
| Ads | **No ads** |
| App access | All functionality available without login |
| Target audience | **13+** (ya 18+). "Under 13" mat chuno, warna Families policy lagti hai |
| Content rating (IARC) | Category: Game. Violence: **No** (sirf traffic se takkar, koi blood/gore nahi). In-app purchases: No. User interaction/sharing/location: No. Expected: **Everyone / PEGI 3** |
| Data safety | Collects data: **No**. Shares data: **No**. (Sab local hai, koi SDK nahi.) Security: data encrypted in transit — N/A. |
| Government app | No |
| Financial features / Health | None |
| News app | No |

(Credits sirf game ke andar kamaye jaate hain, real paise se nahi, isliye IAP = No.)

## 5. Release
- Testing → **Internal testing** → Create release → .aab upload → release notes (`LISTING.md`) → Save → Review → Roll out.
- Personal account: Closed testing me 12+ testers add karo, 14 din chalao, phir **Production access** apply karo.
- Production → Create release → wahi .aab / naya build → Submit for review (1–7 din).

## 6. Har update par
`app.json` me `version` badhao (EAS `autoIncrement` versionCode khud badhata hai) → naya `eas build` → naya release.
