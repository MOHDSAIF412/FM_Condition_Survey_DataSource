import React, { useEffect, useState } from 'react';
import { Sun, Cloud, CloudRain, CloudSun, CloudFog, CloudLightning, Snowflake, ChevronDown } from 'lucide-react';

/**
 * Date, time and the weather where the project is.
 *
 * Weather comes from Open-Meteo (free, no key). It is looked up from the
 * project's location text and cached for half an hour, and the card simply
 * shows the date and time when there is no signal or no location -- the app
 * works offline, so weather is never something the page waits for.
 */
const CACHE_KEY = 'fm_weather_cache_v1';
const CACHE_MS = 30 * 60 * 1000;

// WMO weather codes -> label and icon.
function describe(code) {
  if (code === 0) return { label: 'Clear Sky', Icon: Sun };
  if (code === 1 || code === 2) return { label: 'Partly Cloudy', Icon: CloudSun };
  if (code === 3) return { label: 'Overcast', Icon: Cloud };
  if (code === 45 || code === 48) return { label: 'Fog', Icon: CloudFog };
  if (code >= 51 && code <= 67) return { label: 'Rain', Icon: CloudRain };
  if (code >= 71 && code <= 77) return { label: 'Snow', Icon: Snowflake };
  if (code >= 80 && code <= 82) return { label: 'Showers', Icon: CloudRain };
  if (code >= 95) return { label: 'Thunderstorm', Icon: CloudLightning };
  return { label: 'Fair', Icon: CloudSun };
}

function readCache(place) {
  try {
    const all = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    return all[place] || null;
  } catch { return null; }
}
function writeCache(place, value) {
  try {
    const all = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    all[place] = value;
    localStorage.setItem(CACHE_KEY, JSON.stringify(all));
  } catch { /* storage unavailable: weather just is not cached */ }
}

async function fetchWeather(place) {
  const geo = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1`);
  const g = (await geo.json())?.results?.[0];
  if (!g) return null;
  const w = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${g.latitude}&longitude=${g.longitude}&current=temperature_2m,weather_code&timezone=auto`);
  const cur = (await w.json())?.current;
  if (!cur) return null;
  return { temp: Math.round(cur.temperature_2m), code: cur.weather_code, city: g.name, timezone: g.timezone, at: Date.now() };
}

export default function WeatherDateCard({ place }) {
  const [now, setNow] = useState(() => new Date());
  const [weather, setWeather] = useState(() => (place ? readCache(place) : null));

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30 * 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!place) return undefined;
    const cached = readCache(place);
    setWeather(cached);
    if (cached && Date.now() - cached.at < CACHE_MS) return undefined;
    let cancelled = false;
    fetchWeather(place)
      .then((w) => { if (!cancelled && w) { writeCache(place, w); setWeather(w); } })
      .catch(() => { /* offline: keep whatever is cached */ });
    return () => { cancelled = true; };
  }, [place]);

  const tz = weather?.timezone;
  const fmt = (opts) => {
    try { return new Intl.DateTimeFormat('en-GB', { ...opts, ...(tz ? { timeZone: tz } : {}) }).format(now); }
    catch { return new Intl.DateTimeFormat('en-GB', opts).format(now); }
  };
  const date = fmt({ weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  const time = fmt({ hour: '2-digit', minute: '2-digit', hour12: false });
  const d = weather ? describe(weather.code) : null;

  return (
    <div className="rounded-2xl bg-white/85 border border-white/70 shadow-card px-4 py-3 w-full sm:w-52 text-left">
      <p className="text-[11px] font-semibold text-slate-500">{date}</p>
      <p className="stat-value text-2xl font-bold text-slate-900 leading-tight">{time}</p>
      {weather && d && (
        <div className="mt-2 pt-2 border-t border-slate-200/80">
          <div className="flex items-center gap-2">
            <d.Icon className="w-6 h-6 text-amber-500" />
            <span className="text-lg font-bold text-slate-800">{weather.temp}°C</span>
          </div>
          <div className="flex items-center justify-between mt-1">
            <div>
              <p className="text-xs font-bold text-slate-700">{weather.city}</p>
              <p className="text-[11px] text-slate-500">{d.label}</p>
            </div>
            <ChevronDown className="w-4 h-4 text-slate-300" />
          </div>
        </div>
      )}
    </div>
  );
}
