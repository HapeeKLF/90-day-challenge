# 90-Day Challenge

A personal habit tracker for 90 days: break bad habits, build good ones, work out every day, earn points, and buy yourself rewards.
It works on your phone and computer, and you can add it to your phone's home screen like an app.

**Your data stays on your phone.** There is no account and no server. Use ⚙️ Settings → *Save backup* now and then.

---

## What's inside

| Tab | What it does |
|---|---|
| ✅ **Today** | Day X of 90, today's quote, the bonus challenge, and every habit to check off. Points and streaks update as you go. "I slipped" resets that streak, with encouragement and no shame. Use ‹ › to fix a past day you forgot to log. |
| 💪 **Workout** | Today's workout (Mon chest/triceps … Sun recovery), in a **Gym** version and a **Home** (no equipment) version. The numbers go up every 2 weeks. Log weights, reps and minutes. You can edit the plan. |
| 🕒 **Schedule** | Morning / Work / Afternoon / Evening / Night blocks, with habits to check off in each. **📅 Add schedule to my calendar** puts daily reminders on your phone. |
| 🎁 **Rewards** | Points to spend, a rewards shop (set your own prices), and the pretend "money on the line" bank. |
| 📈 **Progress** | The 90-day calendar, badges (7 / 30 / 60 / 90), streaks, workout progress, and the weekly reports. |

The **meditation habit (20–30 min)** has a built-in timer (tap ⏱ next to it). When the timer finishes, the habit checks itself off.

### Points
- Big habits (deep work, workout, no porn, phone limit): **20 pts**
- Other habits: **10 pts**
- Daily bonus challenge: **25 pts**
- Perfect day (every habit + the bonus challenge): **+50**
- Streak boost: 7+ days in a row = **1.5×**, 30+ days = **2×**

---

## How to put it on your phone (free, using GitHub Pages)

GitHub Pages hosts small websites like this one for free. Once it's on, you get a web address like
`https://YOUR-USERNAME.github.io/90-day-challenge/`.

1. On GitHub, open the repository → **Settings** → **Pages** (in the left menu).
2. Under **Build and deployment → Source**, choose **Deploy from a branch**.
3. Under **Branch**, pick **main** and **/ (root)**, then press **Save**.
4. Wait 1–2 minutes and refresh the page. The web address appears at the top. That's your app.

### Add it to your home screen

**iPhone (use Safari, not Chrome):**
1. Open the web address in **Safari**.
2. Tap the **Share** button (the square with an arrow pointing up).
3. Scroll down and tap **Add to Home Screen** → **Add**.
4. Open it from the new "90 Days" icon. It opens full-screen like a normal app and works offline.

**Android (Chrome):**
1. Open the web address in **Chrome**.
2. Tap the **⋮** menu → **Add to Home screen** (or **Install app**).

### Reminders
On iPhone, open the app **in Safari** (not from the home-screen icon), go to **Schedule → 📅 Add schedule to my calendar**, and tap **Add All**. Your phone's Calendar will then remind you at the start of each block for the rest of the 90 days.

> ⚠️ The home-screen app and the Safari page keep **separate** data. Pick one to track in (the home-screen icon is best) and only use Safari for the calendar button.

---

## Changing the app later

Your habits, workouts, schedule and rewards can all be edited inside the app.
If you change the code files, also change `VERSION` at the top of `sw.js` (for example `90day-v2`), so phones download the new version.

## Running it on your computer

From this folder:

```bash
python3 -m http.server 8090
```

Then open http://localhost:8090 in Chrome.
