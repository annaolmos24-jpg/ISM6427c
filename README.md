# Owl Weather

A responsive weather app with live data from [Open-Meteo](https://open-meteo.com/) (free, no API key). Defaults to FAU in Boca Raton, FL.

## Features

- Personalized greeting for Oriana (changes with time of day)
- Current conditions, next-24-hour and 7-day forecasts
- City search (Open-Meteo geocoding) and "use my location"
- Light, dark, and system themes (choice is remembered)
- °F / °C toggle
- Works on phones, tablets, and desktops
- Auto-refreshes every 10 minutes and when you return to the tab

## Run locally

It's plain HTML/CSS/JS, so there's nothing to install:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Deploy to Netlify

1. In Netlify, choose **Add new site → Import an existing project** and pick this GitHub repo.
2. Branch: `main`. Leave the build command empty; publish directory is `.` (already set in `netlify.toml`).
3. Deploy.

Or drag and drop this folder onto https://app.netlify.com/drop.
