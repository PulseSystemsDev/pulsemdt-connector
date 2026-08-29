# PulseMDT (FiveM)

Free in-game CAD/MDT connector for [PulseMDT](https://pulsemdt.com). Officers press a key or run `/cad` to open a live dispatch terminal tied to your community's PulseMDT dashboard: duty status, calls, NCIC and plate lookups, warrants, reports, BOLOs, and unit roster.

## Features

- Local CAD terminal (NUI) with civilian records, dispatch, NCIC/plate lookup, warrants, reports, roster, and duty status panels
- Discord-role-gated access, re-verified continuously so permission changes apply without a reconnect
- Offline-resilient: cached reads and a replay queue for writes keep officers working through a CAD outage
- Optional ANPR integration with Wraith ARS 2X
- Optional framework bridge (QBCore, ESX, Qbox, or standalone) for character identity, owned vehicles, and economy hooks
- A `dependency 'pulsemdt'` export layer so other PulseMDT add-on resources share the same connection

## Installation

1. Drop this folder into your server's `resources` directory as `pulsemdt`.
2. Copy `config.example.lua` to `config.lua` and adjust settings for your server.
3. Add your API key and guild ID to `server.cfg` as server-only convars (never `setr`):
   ```
   set pulsemdt_api_key "your-api-key-here"
   set pulsemdt_guild_id "your-guild-id-here"
   ```
   Get these from your PulseMDT dashboard's Admin page.
4. Add `ensure pulsemdt` to `server.cfg`.

## Configuration

See `config.example.lua` for every option and inline documentation.

## Links

- [PulseMDT](https://pulsemdt.com)
- [pulsesystems.dev](https://pulsesystems.dev)
- [Releases](https://github.com/PulseSystemsDev/pulsemdt-fivem/releases)
