<div align="center">

# ✈️ Infinite Flight Dashboard

**A beautiful flight log dashboard for [Infinite Flight](https://infiniteflight.com) pilots.**

### → [**Open the Dashboard**](https://aki-12138.github.io/Infinite-Flight-Dashboard/) ←

`aki-12138.github.io/Infinite-Flight-Dashboard`

[English](README.md) · [日本語](README.ja.md) · [简体中文](README.zh-CN.md) · [Report a bug](https://github.com/AKI-12138/Infinite-Flight-Dashboard/issues)

![Infinite Flight Dashboard — light mode overview](screenshots/hero-light.png)

</div>

---

## What it is

A simple dashboard that turns your Infinite Flight history into beautiful charts, a route map, and a 3D globe. 

Built for IF pilots who want to actually *see* their journey: which aircraft they fly most, which routes they've covered, how their flight time has grown over the years.

| Light mode | Dark mode |
|---|---|
| ![light fold](screenshots/fold-light.png) | ![dark](screenshots/hero-dark.png) |

## What you can do

- **See your stats at a glance** — total flights, hours, aircraft used, countries visited, all up top
- **Beautiful charts for everything** — your top aircraft, top airlines, top routes, top airports, top countries; plus flights per year, per month, per weekday
- **A world map of your routes** — every flight drawn as a great-circle line, your hubs and airports marked
- **Spin your routes on a 3D globe** — see your travel patterns from any angle
- **Filter and compare** — narrow by year, month, weekday, airline, aircraft, or country; built-in year-over-year comparison shows how your flying has grown
- **Easy import** — paste your flight log in almost any format. The dashboard figures out dates, aircraft codes, and airline names automatically
- **172 airports built-in** — major airports worldwide come pre-loaded; add custom ones if you fly somewhere unusual
- **Quick search** — find specific flights instantly with simple queries like `RJTT→KJFK B77W 2025`
- **Light and dark themes** — pick one, or let it follow your phone's setting
- **Works on phones** — same dashboard, mobile-friendly layout
- **Just open the link and use it** — no install, no signup, nothing to set up

![Top Flights by Time overlay](screenshots/overlay-top-flights.png)

## How to start using it

Just open this link in any modern browser:

**→ [aki-12138.github.io/Infinite-Flight-Dashboard](https://aki-12138.github.io/Infinite-Flight-Dashboard/)**

That's it. The first time you open it, you'll see an empty dashboard with two buttons — **Import CSV** (if you already have a flight log) or **Add your first flight** (start fresh). The rest of this guide explains everything you can do once you're in.

> 💡 **Tip:** On mobile, you can "Add to Home Screen" from your browser's share menu to make the dashboard feel like an app.

## How to use

### Importing flights from CSV

Click **📥 Import** (header) or **📂 Import CSV** (empty state), then either select a file or paste the CSV directly.

**Required format (6 columns):**

```
date,dep,arr,aircraft,airline,duration
2025-06-01,RJTT,RJOO,B772,ANA,1h15m
2025/6/2,rjoo,rjtt,a359,Japan Airlines,1:10
25-06-03,RJTT,RJCC,b77w,ANA,90m
```

**The importer is lenient.** It handles:
- Date variants: `2025-06-01`, `2025/6/1`, `25-06-01`, `20250601`
- Time variants: `1h15m`, `1:30`, `90m`, `1h30`, `1.5h`
- Aircraft codes: `B772`, `b772`, `B-772`, `Boeing 777-200` (cleaned up as best as possible)
- Airline names: `ANA`, `All Nippon Airways`, `Japan Airlines`, `JAL`
- Separators: comma (`,`), Japanese comma (`、`), tab
- Comments: lines starting with `#` are ignored
- Duplicates: same date + route + aircraft + airline + time are removed automatically

If a row fails to parse, the importer shows you exactly which line and why.

### Adding a single flight

Click **+ Add Flight** (header) or **+ Add your first flight** (empty state). Fill in:

| Field | Example | Notes |
|---|---|---|
| Date | `2025-06-01` | Picker enforces format |
| Flight Time | `1` h `15` m | Use the two number inputs |
| Departure (ICAO) | `RJTT` | 4-letter ICAO code |
| Arrival (ICAO) | `RJOO` | 4-letter ICAO code |
| Aircraft | `B772` | ICAO type code |
| Airline | `ANA` | IATA code or full name; auto-normalized |

Click **Add Flight** to save.

### Adding a custom airport

The app ships with **172 airports** built-in (major hubs worldwide). If you fly to a minor or military field that's not recognized, you'll see "Unknown airport" markers on the map. To fix that, add the airport manually.

**In the dashboard:**
1. Open **📥 Import** → switch to the **🛩 Airports** tab
2. Paste a CSV row in this format:

```
icao,lat,lng,city,country,continent
RJBE,34.6328,135.2239,Kobe,Japan,Asia
```

**Field reference:**

| Field | Format | Example |
|---|---|---|
| `icao` | 4-letter ICAO code | `RJBE` |
| `lat` | Decimal degrees (−90 to +90) | `34.6328` |
| `lng` | Decimal degrees (−180 to +180) | `135.2239` |
| `city` | Display name | `Kobe` |
| `country` | English country name | `Japan` |
| `continent` | One of: `Asia`, `Europe`, `Africa`, `North America`, `South America`, `Oceania`, `Antarctica` | `Asia` |

Custom airports are saved alongside your flights and export with them in the airports CSV.

### How to find latitude and longitude

You need **decimal degrees** (DD), not degrees-minutes-seconds (DMS). 4-6 decimal places is plenty for map display.

| Source | How |
|---|---|
| **Wikipedia** | Search the airport name → look at the right-side infobox → "Coordinates" line. If you see `35°33'08"N`, use the **decimal** form right next to it (`35.5523°N 139.7798°E` → `35.5523,139.7798`). |
| **Google Maps** | Search the airport → right-click on it → click the coordinates at the top of the menu to copy. |
| **OurAirports.com** | Search for the ICAO → coordinates shown near the top of the page. |
| **AirNav.com** | [airnav.com/airports](https://airnav.com/airports) → search by ICAO. |

**Notes:**
- **Sign matters.** Southern hemisphere lat is negative (Sydney `-33.9461`). Western hemisphere lng is negative (JFK `-73.7789`).
- **Strip all symbols.** No `°`, no `N`/`S`/`E`/`W`. Just digits and a minus sign.
- **Decimal, not DMS.** `35°33'08"N` won't work; convert it to `35.5523` first.

**Worked example (Kobe Airport, RJBE):**

| Source data | What to enter |
|---|---|
| `34°37′58″N 135°13′26″E` (DMS) | ❌ Doesn't work |
| `34.6328° N, 135.2239° E` (DD with symbols) | ❌ Doesn't work |
| `34.6328, 135.2239` | ✅ This is what you want |

### Search

The Flight Log has a search box at the top. **The simple way:** type any keyword (an airline name, an aircraft type, a year) and it filters. **The fancy way:** combine multiple terms separated by spaces, and they all have to match.

| Pattern | What it does | Example |
|---|---|---|
| `RJTT→RJOO` | Route filter (departure → arrival) | Tokyo to Osaka flights |
| `RJTT->RJOO` | Same — `->`, `→`, `>`, `-` all work as the arrow | |
| `RJTT` | Any flight involving this airport | All Haneda flights |
| `JFK` | IATA codes auto-resolve to ICAO | Same as `KJFK` |
| `ANA` | Airline name or code | All ANA flights |
| `B789` | Aircraft type | All 787-9 flights |
| `2025` | Year | 2025 flights |
| `2025-06` | Year-month | June 2025 |
| `-RJOO` | Exclusion (prefix `-`) | Exclude flights involving Osaka |
| Combine | Space-separated tokens AND together | `RJTT→KJFK B77W 2025` |

**Example: "All my Tokyo–New York B77W flights from 2025, but not the ones to Newark":**

```
RJTT→KJFK B77W 2025 -KEWR
```

### Filters

Above the dashboard, click **FILTERS ▾** to open the filter bar. Available chips:

- 🗓 **Year** — multi-select
- 📅 **Month** — multi-select
- 📆 **Weekday** — multi-select
- 🏢 **Airline** — multi-select, lists only airlines you've actually flown
- ✈️ **Aircraft** — multi-select
- 🏞 **Country/Region** — multi-select
- 🌐 **Scope** — All / Domestic / International

The dashboard updates live as you select. The **Comparing** card shows year-over-year deltas based on your current Year selection.

### Theme switching

The header toggle in the top-right cycles through three states:

| Mode | Icon | Behavior |
|---|---|---|
| Auto | 🔄 | Follows your OS preference, live-updates when OS theme changes |
| Light | ☀️ | Forces light |
| Dark | 🌙 | Forces dark |

Your choice persists across sessions.

![Mobile dark mode](screenshots/mobile-dark.png)

## Data & Privacy

- **100% local.** Your flights are stored in your browser's `localStorage`. There is no server, no analytics, no cookies, no third-party calls (other than CDN font/library loads).
- **No account.** No sign-up, no login.
- **Easy backup.** Click **📤 Export** anytime to download a CSV of your flights (and optionally your custom airports).
- **Easy migration.** Drop your exported CSV on a new device → **Import** → done.
- **Easy wipe.** Click **🗑 Clear** (header) to delete everything, with a confirmation dialog.

If you ever want to know "is my data really saved here?", click the ✓ icon in the header — it tells you the current storage status.

## Works on

Pretty much any modern browser, on desktop or mobile:

- 💻 Chrome, Safari, Firefox, Edge on Windows / Mac / Linux
- 📱 iPhone (Safari, Chrome), Android (Chrome, Samsung Internet)

If something doesn't look right, try updating your browser to the latest version.

## About this project

This is a **personal hobby project**, built by one Infinite Flight enthusiast and shared with the IF community to enjoy.

- **No guarantee of ongoing maintenance or support.** Updates may be sporadic — or stop entirely.
- **Things may change.** Features, UI, data format, even the URL itself could shift in future versions without notice.
- **Use it freely, but don't depend on it for anything critical.** If your flight history matters to you, keep a CSV backup.

That said, if you find a bug, [open an issue](https://github.com/AKI-12138/Infinite-Flight-Dashboard/issues) and I'll look at it when I get the time. No promises on when, but I do read them.

**One more thing worth knowing:** most of this code was written with the help of AI coding assistants (mainly Claude), under my direction and design choices. I'm not a JavaScript developer — this project exists because AI tools have made it possible for non-coders to ship polished software. If you find weird patterns in the code, it's probably either AI quirks or my unclear instructions (hard to tell which 😅).

## For developers

If you're a developer curious about how this is built, the code is all here in this repository — it's a static site (HTML / CSS / JavaScript) with no build step. A proper developer guide may come later.

## Credits

Built by [AKI-12138](https://github.com/AKI-12138) for the Infinite Flight community.

Inspired by every IF pilot who's ever wondered "wait, how many hours have I actually flown?".

Made possible by these wonderful open-source projects: [Leaflet](https://leafletjs.com/) (2D map), [Chart.js](https://www.chartjs.org/) (charts), [Globe.gl](https://globe.gl/) (3D globe), [Natural Earth](https://www.naturalearthdata.com/) (country borders), and the [Outfit](https://fonts.google.com/specimen/Outfit) and [JetBrains Mono](https://www.jetbrains.com/lp/mono/) fonts. Thank you to all the maintainers.

## License

**TBD.** Until a license is added, default copyright applies — you can read and view the code, but please don't redistribute or use it commercially without asking first.

---

<div align="center">

*Not affiliated with or endorsed by Infinite Flight LLC.*

</div>
