# Daily Coach

A private, offline, Noom-style weight-loss and healthy-habits app for iPhone. It installs from Safari with "Add to Home Screen", so there's no App Store or developer account involved.

## Features
- Personalized daily calorie budget (Mifflin-St Jeor + activity level − chosen pace). It adjusts automatically after each weigh-in.
- Food logging with the green / yellow / red calorie-density system, 181 common foods, recent foods, custom foods and quick add.
- Water, steps (entered by hand from the Health app) and weigh-ins with a trend chart and projected goal date.
- 28 short daily lessons with a quiz question each, plus a tip of the day.
- Logging streak, weekly calorie chart and weekly color mix.
- Large text, big buttons, light and dark mode.
- Works offline. All data stays on the phone. A backup can be saved or shared as a JSON file and restored later.

## Run locally
```
python3 -m http.server 8095
```
Then open http://localhost:8095.

## Put it on the iPhone
The app needs to be hosted on an HTTPS address. Any static host works, for example:
- **Netlify Drop:** drag this folder onto https://app.netlify.com/drop
- **GitHub Pages:** push the folder to a repo and enable Pages
- **Cloudflare Pages:** upload the folder

Then on the iPhone: open the URL in **Safari**, tap **Share**, then **Add to Home Screen**, then **Add**. Open it from the new icon and set it up there. On iOS, the home-screen app keeps its data separately from Safari.

## Updating
After changing any file, bump `VERSION` in `sw.js` (e.g. `coach-v2`) and redeploy. The phone picks up the update the next time the app is opened with internet.

## Limits of a web app on iPhone
- It can't read Apple Health automatically, so steps are entered by hand.
- It has no scheduled reminder notifications. The iPhone Reminders app works well for this.
- There's no barcode scanner.
