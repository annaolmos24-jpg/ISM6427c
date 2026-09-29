(function () {
  'use strict';

  const DEFAULT_LOCATION = {
    name: 'FAU · Boca Raton, FL',
    latitude: 26.3730,
    longitude: -80.1010,
  };

  const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
  const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
  const REFRESH_MS = 10 * 60 * 1000;

  // WMO weather interpretation codes -> [description, day icon, night icon]
  const WMO = {
    0: ['Clear sky', '☀️', '🌙'],
    1: ['Mainly clear', '🌤️', '🌙'],
    2: ['Partly cloudy', '⛅', '☁️'],
    3: ['Overcast', '☁️', '☁️'],
    45: ['Fog', '🌫️', '🌫️'],
    48: ['Rime fog', '🌫️', '🌫️'],
    51: ['Light drizzle', '🌦️', '🌧️'],
    53: ['Drizzle', '🌦️', '🌧️'],
    55: ['Heavy drizzle', '🌧️', '🌧️'],
    56: ['Freezing drizzle', '🌧️', '🌧️'],
    57: ['Heavy freezing drizzle', '🌧️', '🌧️'],
    61: ['Light rain', '🌦️', '🌧️'],
    63: ['Rain', '🌧️', '🌧️'],
    65: ['Heavy rain', '🌧️', '🌧️'],
    66: ['Freezing rain', '🌧️', '🌧️'],
    67: ['Heavy freezing rain', '🌧️', '🌧️'],
    71: ['Light snow', '🌨️', '🌨️'],
    73: ['Snow', '🌨️', '🌨️'],
    75: ['Heavy snow', '❄️', '❄️'],
    77: ['Snow grains', '🌨️', '🌨️'],
    80: ['Light showers', '🌦️', '🌧️'],
    81: ['Showers', '🌧️', '🌧️'],
    82: ['Violent showers', '⛈️', '⛈️'],
    85: ['Snow showers', '🌨️', '🌨️'],
    86: ['Heavy snow showers', '❄️', '❄️'],
    95: ['Thunderstorm', '⛈️', '⛈️'],
    96: ['Thunderstorm with hail', '⛈️', '⛈️'],
    99: ['Severe thunderstorm with hail', '⛈️', '⛈️'],
  };

  const $ = (id) => document.getElementById(id);

  const store = {
    get(key, fallback) {
      try { return localStorage.getItem(key) ?? fallback; } catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, value); } catch (e) { /* ignore */ }
    },
  };

  let units = store.get('units', 'fahrenheit');
  let location = DEFAULT_LOCATION;
  try {
    const saved = JSON.parse(store.get('location', 'null'));
    if (saved && typeof saved.latitude === 'number') location = saved;
  } catch (e) { /* ignore */ }
  let lastData = null;
  let refreshTimer = null;

  // ---------- Theme ----------
  function applyTheme(choice) {
    if (choice === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', choice);
    document.querySelectorAll('[data-theme-choice]').forEach((b) =>
      b.setAttribute('aria-checked', String(b.dataset.themeChoice === choice)));
    store.set('theme', choice);
  }
  document.querySelectorAll('[data-theme-choice]').forEach((b) =>
    b.addEventListener('click', () => applyTheme(b.dataset.themeChoice)));
  applyTheme(store.get('theme', 'system'));

  // ---------- Units ----------
  function applyUnits(u) {
    units = u;
    document.querySelectorAll('[data-unit]').forEach((b) =>
      b.setAttribute('aria-checked', String(b.dataset.unit === u)));
    store.set('units', u);
  }
  document.querySelectorAll('[data-unit]').forEach((b) =>
    b.addEventListener('click', () => {
      if (b.dataset.unit === units) return;
      applyUnits(b.dataset.unit);
      loadWeather();
    }));
  applyUnits(units);

  // ---------- Greeting ----------
  function greet() {
    const h = new Date().getHours();
    const part = h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    $('greeting').textContent = `${part}, Oriana! 🦉`;
  }
  greet();

  // ---------- Helpers ----------
  const status = (msg, isError) => {
    $('status').textContent = msg || '';
    $('status').classList.toggle('error', !!isError);
  };
  const wmo = (code, isDay = 1) => {
    const w = WMO[code] || ['Unknown', '🌡️', '🌡️'];
    return { text: w[0], icon: isDay ? w[1] : w[2] };
  };
  const tUnit = () => (units === 'fahrenheit' ? '°F' : '°C');
  const round = (n) => (n == null || Number.isNaN(n) ? '—' : Math.round(n));
  const compass = (deg) => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(deg / 45) % 8];

  // Open-Meteo returns local times without an offset (timezone=auto), so format
  // them from the string directly to show the location's local time.
  function fmtTime(iso) {
    const [hh, mm] = iso.slice(11, 16).split(':').map(Number);
    const suffix = hh >= 12 ? 'PM' : 'AM';
    const h12 = hh % 12 || 12;
    return mm ? `${h12}:${String(mm).padStart(2, '0')} ${suffix}` : `${h12} ${suffix}`;
  }
  function fmtDay(isoDate, i) {
    if (i === 0) return 'Today';
    const [y, m, d] = isoDate.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short' });
  }

  // ---------- Weather ----------
  async function loadWeather() {
    status('Loading live weather…');
    const params = new URLSearchParams({
      latitude: location.latitude,
      longitude: location.longitude,
      current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
      hourly: 'temperature_2m,precipitation_probability,weather_code,is_day',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_probability_max',
      temperature_unit: units,
      wind_speed_unit: 'mph',
      precipitation_unit: units === 'fahrenheit' ? 'inch' : 'mm',
      timezone: 'auto',
      forecast_days: '7',
    });
    if (units === 'celsius') params.set('wind_speed_unit', 'kmh');

    try {
      const res = await fetch(`${FORECAST_URL}?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      lastData = await res.json();
      render(lastData);
      status('');
    } catch (err) {
      console.error(err);
      status('Could not load weather right now. Please try again shortly.', true);
    }

    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(loadWeather, REFRESH_MS);
  }

  function render(d) {
    const c = d.current;
    const u = d.current_units;
    const w = wmo(c.weather_code, c.is_day);

    $('place-name').textContent = location.name;
    $('updated').textContent = `Updated ${fmtTime(c.time)} local time`;
    $('current-icon').textContent = w.icon;
    $('current-temp').textContent = `${round(c.temperature_2m)}${tUnit()}`;
    $('current-desc').textContent = w.text;
    $('current-hilo').textContent =
      `High ${round(d.daily.temperature_2m_max[0])}° · Low ${round(d.daily.temperature_2m_min[0])}°`;

    $('m-feels').textContent = `${round(c.apparent_temperature)}${tUnit()}`;
    $('m-humidity').textContent = `${round(c.relative_humidity_2m)}%`;
    $('m-wind').textContent = `${round(c.wind_speed_10m)} ${u.wind_speed_10m} ${compass(c.wind_direction_10m)}`;
    $('m-precip').textContent = `${c.precipitation} ${u.precipitation}`;
    $('m-uv').textContent = round(d.daily.uv_index_max[0]);
    $('m-pressure').textContent = `${round(c.pressure_msl)} hPa`;
    $('m-sunrise').textContent = fmtTime(d.daily.sunrise[0]);
    $('m-sunset').textContent = fmtTime(d.daily.sunset[0]);

    // Hourly: next 24 hours starting from the current hour
    const hourly = $('hourly');
    hourly.innerHTML = '';
    const nowHour = c.time.slice(0, 13);
    let start = d.hourly.time.findIndex((t) => t.slice(0, 13) === nowHour);
    if (start < 0) start = 0;
    for (let i = start; i < Math.min(start + 24, d.hourly.time.length); i++) {
      const hw = wmo(d.hourly.weather_code[i], d.hourly.is_day[i]);
      const el = document.createElement('div');
      el.className = 'hour';
      const pop = d.hourly.precipitation_probability[i];
      el.innerHTML = `
        <span class="t">${i === start ? 'Now' : fmtTime(d.hourly.time[i])}</span>
        <span class="i" title="${hw.text}">${hw.icon}</span>
        <span class="v">${round(d.hourly.temperature_2m[i])}°</span>
        <span class="p">${pop ? `💧${pop}%` : '&nbsp;'}</span>`;
      hourly.appendChild(el);
    }

    // Daily
    const daily = $('daily');
    daily.innerHTML = '';
    const lows = d.daily.temperature_2m_min;
    const highs = d.daily.temperature_2m_max;
    const min = Math.min(...lows);
    const max = Math.max(...highs);
    const span = Math.max(max - min, 1);
    d.daily.time.forEach((day, i) => {
      const dw = wmo(d.daily.weather_code[i]);
      const left = ((lows[i] - min) / span) * 100;
      const width = ((highs[i] - lows[i]) / span) * 100;
      const pop = d.daily.precipitation_probability_max[i];
      const li = document.createElement('li');
      li.className = 'day';
      li.innerHTML = `
        <span class="name">${fmtDay(day, i)}</span>
        <span class="i" title="${dw.text}">${dw.icon}</span>
        <span class="p">${pop ? `💧${pop}%` : ''}</span>
        <span class="range">
          <span class="lo">${round(lows[i])}°</span>
          <span class="bar"><span style="left:${left}%;width:${Math.max(width, 3)}%"></span></span>
          <span class="hi">${round(highs[i])}°</span>
        </span>`;
      daily.appendChild(li);
    });

    ['current', 'hourly-card', 'daily-card'].forEach((id) => { $(id).hidden = false; });

    $('greeting-sub').textContent =
      `It's ${round(c.temperature_2m)}${tUnit()} and ${w.text.toLowerCase()} in ${location.name}.`;
  }

  function setLocation(loc) {
    location = loc;
    store.set('location', JSON.stringify(loc));
    loadWeather();
  }

  // ---------- Search ----------
  const form = $('search-form');
  const input = $('search-input');
  const results = $('search-results');

  async function search(query) {
    if (!query.trim()) return;
    status('Searching…');
    try {
      const params = new URLSearchParams({ name: query.trim(), count: '8', language: 'en', format: 'json' });
      const res = await fetch(`${GEOCODE_URL}?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      results.innerHTML = '';
      if (!data.results || !data.results.length) {
        status(`No places found for "${query}".`, true);
        results.hidden = true;
        return;
      }
      status('');
      data.results.forEach((r) => {
        const label = [r.name, r.admin1, r.country_code].filter(Boolean).join(', ');
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.innerHTML = `${r.name} <small>${[r.admin1, r.country].filter(Boolean).join(', ')}</small>`;
        btn.addEventListener('click', () => {
          results.hidden = true;
          input.value = '';
          setLocation({ name: label, latitude: r.latitude, longitude: r.longitude });
        });
        li.appendChild(btn);
        results.appendChild(li);
      });
      results.hidden = false;
    } catch (err) {
      console.error(err);
      status('Search failed. Please try again.', true);
    }
  }

  form.addEventListener('submit', (e) => { e.preventDefault(); search(input.value); });
  document.addEventListener('click', (e) => { if (!form.contains(e.target)) results.hidden = true; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') results.hidden = true; });

  $('home-btn').addEventListener('click', () => setLocation(DEFAULT_LOCATION));

  $('locate-btn').addEventListener('click', () => {
    if (!navigator.geolocation) { status('Geolocation is not supported by this browser.', true); return; }
    status('Finding your location…');
    navigator.geolocation.getCurrentPosition(
      (pos) => setLocation({
        name: 'Your location',
        latitude: +pos.coords.latitude.toFixed(4),
        longitude: +pos.coords.longitude.toFixed(4),
      }),
      () => status('Could not get your location. Check browser permissions.', true),
      { timeout: 10000 }
    );
  });

  // Refresh when the tab becomes visible again so data stays current.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { greet(); loadWeather(); }
  });

  loadWeather();
})();
