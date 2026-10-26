# Glob Map

Glob Map is a map navigation web app built for better **pedestrian and metro guidance** across the Klang Valley, with support for Singapore and Taipei / New Taipei / Keelung in the line data.

It combines real rail track geometry from OpenStreetMap, scheduled timetables and live train positions from data.gov.my, and turn-by-turn journeys modelled on the Google Maps navigation experience.

## Features

### Rail network
- **Real track geometry**: every line is drawn along its actual OSM track, not as straight lines between stations
- **Auto-discovered lines**: drop a file into `src/metro/<COUNTRY>/` and the `RailLineManager` picks it up
- **Interchange merging**: stations are merged automatically by proximity and name, with a manual override file for the exceptions
- **Smart visibility**: lines appear at city zoom, station markers only when zoomed in close, and nothing is drawn outside supported regions
- **Station markers** with rail-type icons (metro, monorail, train, bus), snapped onto the track
- **Station cards** with every line serving the station, operator logos, and the next scheduled departures
- **Live trains** shown on the map (Rapid Rail, Malaysia)

### Navigation
- **Search** with type-ahead for both start and destination, plus automatic "My location"
- **Four travel modes**: Drive, Ride (ride-hailing), Public transport, Walk
- **Multiple route options**: fastest, shortest, alternatives, and for transit: fewest transfers and least walking
- **Pedestrian routing** that prefers footways and park paths (Valhalla)
- **Public transport planner** built from the rail data: walk, ride with interchanges, walk
- **Fare estimates** for rail and ride-hailing
- **Turn-by-turn journeys**: tilted follow camera, next-turn banner with a "Then" hint, time left and arrival time, speed, voice guidance, off-route rerouting, and arrival feedback
- **Demo mode** that simulates travel along a route, so you can test without moving
- **Responsive UI**: bottom-sheet route panel on phones that can be minimised, full-width search bar, cards that scale with the screen

## Built With

- [![TypeScript][TypeScript]][typescript-url]
- [![React][React]][react-url]
- [![Vite][Vite]][vite-url]
- [MapLibre GL JS](https://maplibre.org) for the map
- [Valhalla](https://valhalla.github.io/valhalla/) for pedestrian routing
- [OSRM](https://project-osrm.org) for driving routes (and walking fallback)
- [OpenFreeMap](https://openfreemap.org) for map tiles
- [Photon](https://photon.komoot.io) for place search
- [OpenStreetMap Overpass API](https://overpass-api.de) for line and station data
- [data.gov.my GTFS](https://developer.data.gov.my) for timetables and live vehicle positions

## Getting Started

### Prerequisites

- **Node.js 18 or newer** (the data scripts use the built-in `fetch`)
- npm

```shell
npm install npm@latest -g
```

### 1. Install

```shell
git clone https://github.com/itszhadanjun/glob-map.git
cd glob-map
npm install
npm install maplibre-gl gtfs-realtime-bindings
npm install dotenv @types/express @types/cors
npm install -D fflate csv-parse
```

### 2. Check the TypeScript setup

- `src/vite-env.d.ts` must contain `/// <reference types="vite/client" />` (needed for `import.meta.glob`)
- `tsconfig.app.json` needs `"resolveJsonModule": true` (the track data is imported as JSON)

### 3. Generate the rail line data

Lines are fetched once from OpenStreetMap and saved into the project. Never call Overpass from the browser.

```shell
node scripts/fetchLine.mjs          # every line in scripts/lines.config.mjs
node scripts/fetchLine.mjs MY       # one country (MY, SG or TW)
node scripts/fetchLine.mjs KJL AGL  # specific line codes
```

This writes `src/metro/<COUNTRY>/<CODE>.ts` and `src/metro/data/<COUNTRY>-<CODE>.json`. It pauses 10 seconds between lines to be polite to the shared servers, so a full run takes a few minutes.

If a line picks the wrong relation, find the right one on openstreetmap.org and set `relationId` for that line in `scripts/lines.config.mjs`, then rerun. Edit the config rather than the generated `.ts` files, because rerunning overwrites them.

### 4. Generate the timetables (Malaysia)

```shell
node scripts/fetchTimetable.mjs          # all feeds
node scripts/fetchTimetable.mjs ktmb     # one feed
```

This downloads the GTFS static feeds and writes small per-station files into `public/timetable/`. Rerun it now and then to refresh the schedule.

### 5. Add operator logos (optional)

Put logo files in `public/logos/` using the names in `src/metro/operators.ts`. Without them, the cards show an initials badge. Use official logos from each operator's brand page and check their licence.

### 6. Run

```shell
npm run dev
```

Open the local URL Vite prints.

### Testing on a phone

Browsers only allow location access on `https` or `localhost`. To test GPS on your phone over your local network:

```shell
npm install -D @vitejs/plugin-basic-ssl
```

Add the plugin to `vite.config.ts` and set `server.host: true`, or deploy the app to an `https` host.

## Project Structure

```
glob-map/
├── public/
│   ├── logos/                 operator logos
│   └── timetable/             generated GTFS timetables
├── scripts/
│   ├── lines.config.mjs       which lines to fetch (name, colour, operator...)
│   ├── fetchLine.mjs          OSM -> track geometry + stations
│   └── fetchTimetable.mjs     data.gov.my GTFS -> per-station timetables
└── src/
    ├── components/
    │   ├── Searchbox.tsx      start, destination, mode tabs
    │   ├── RoutePanel.tsx     route options, fares, steps (minimisable)
    │   ├── NavigationHUD.tsx  turn-by-turn journey overlay
    │   └── LineCard.tsx       station and line popup
    ├── hooks/useIsMobile.ts
    ├── metro/
    │   ├── MY/ SG/ TW/        generated line files, one per line
    │   ├── data/              generated track geometry (JSON)
    │   ├── RailLineManager.ts line discovery and station merging
    │   ├── manualMerges.ts    manual interchange rules
    │   ├── regions.ts         supported regions and zoom thresholds
    │   ├── icons.ts           rail-type marker icons
    │   ├── snap.ts            snaps markers onto the track
    │   ├── live.ts            timetables and live vehicle positions
    │   ├── operators.ts       operator logo map
    │   └── types.ts
    ├── navigation/
    │   ├── routing.ts         walk, drive, ride and transit routing
    │   ├── trackpath.ts       follows real track between stations
    │   ├── fares.ts           fare estimation (editable rate card)
    │   ├── guidance.ts        places turns along the route
    │   ├── useJourney.ts      GPS tracking, rerouting, ETA
    │   └── voice.ts           spoken guidance
    ├── App.tsx
    └── App.css
```

## Configuration

| What | Where |
| --- | --- |
| Add or change a rail line | `scripts/lines.config.mjs`, then rerun `fetchLine.mjs` |
| Merge or split interchange stations by hand | `src/metro/manualMerges.ts` |
| Supported regions and zoom levels | `src/metro/regions.ts` |
| Fare rates | `src/navigation/fares.ts` |
| Rapid On-Demand service zones | `RAPID_ON_DEMAND_ZONES` in `src/navigation/fares.ts` |
| Map style | `style` in `src/App.tsx` |

## Known Limitations

- **Public transport times are estimates.** The planner uses fixed assumptions (average speed, stop time, transfer and wait time), not live timetables.
- **Fares are rough estimates.** The rates in `fares.ts` are placeholders to verify. Grab, Gojek and Uber publish no price API.
- **Timetables cover Malaysia only** (Rapid Rail and KTM). Singapore and Taiwan lines show routes and stations but no departures yet.
- **Live data is positions only.** data.gov.my does not yet offer trip updates or service alerts, so there are no live "arriving in X min" times.
- **Data quality follows OpenStreetMap.** Station order, missing track, and name differences can show up in generated line files, and some interchanges need a manual merge rule.
- **Public routing servers** (Valhalla, OSRM, Photon, Overpass) are free community services for light use. For production traffic, self-host them or use a paid provider.

## Roadmap

- [ ] Singapore (LTA DataMall) and Taiwan (TDX) timetables
- [ ] Rapid Bus and BRT timetables
- [ ] Route-to-line matching in departure lists
- [ ] Day / night map style
- [ ] Offline support

## Data Sources and Attribution

- Map data and rail geometry © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), licensed under the ODbL
- Timetables and vehicle positions from [data.gov.my](https://data.gov.my), licensed under CC BY 4.0
- Map tiles by [OpenFreeMap](https://openfreemap.org)

Keep these credits visible in any deployed version of the app.

<!-- Markdown Links & Images -->
[TypeScript]: https://shields.io/badge/TypeScript-3178C6?logo=TypeScript&logoColor=FFF&style=flat-square
[React]: https://shields.io/badge/React-20232A?logo=React&logoColor=61DAFB&style=flat-square
[Vite]: https://shields.io/badge/Vite-646CFF?logo=Vite&logoColor=FFF&style=flat-square
[typescript-url]: https://www.typescriptlang.org
[react-url]: https://react.dev
[vite-url]: https://vite.dev