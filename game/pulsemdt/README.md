# pulsemdt (FiveM resource, PulseMDT 2.0)

Connects a FiveM server to a PulseMDT 2.0 community: duty and unit status from the game, live unit positions on
the dispatch board, 911 calls, panic, call alerts and waypoints, and a terminal (F6).

The terminal uses the same workstation look as the website: a menu bar and taskbar in the unit's seat color (blue
for police, red for fire, wine for EMS), the waiting calls as a grid you can take from, your call with waypoint and
notes, plate and name returns with a history of what you ran this session, 911, panic, and F1 to F9 for status.

## Install

1. Copy this folder to your server's `resources` as `pulsemdt`.
2. In the website, open Administration > Game servers, create a key, and paste the two lines into `server.cfg`:

   ```
   set pulsemdt_api_url "https://api.pulsemdt.com"
   set pulsemdt_server_key "pmdt_gs_..."
   ensure pulsemdt
   ```

   Use `set`, never `setr`. Start `pulsemdt` before any `pulse_*` resource.
3. Players join the community on the website with the Discord account they play with. Their roles there decide
   what they can do in game.

Client options (keys, commands, postal resource) are in `config.lua`.

## Commands

| Command | Does |
| --- | --- |
| `/mdt` or F6 | Open the tablet |
| `/duty LSPD 1A21` | Go on duty (agency code, callsign) |
| `/offduty` | Go off duty |
| `/status OS` | Change status (your community's codes or 10-codes) |
| `/panic` or F7 | Emergency button (press again to clear) |
| `/911 what is happening` | Call 911, anyone can |
| `/plate 8KLM441` | Vehicle query with the officer-safety banner |
| `/person john smith` | Name check (`last, first` works) |

## Plate readers

Any radar or camera script connects with one line on the server:

```lua
exports.pulsemdt:ReportPlateRead(source, plate, 'Camera name')
```

Reads come only from on-duty officers, are cached for 10 seconds per plate, are logged in the read audit, and
only hits (BOLO, stolen, owner warrant or caution, registration problems) reach the officer.

## Station alerting

When dispatch (or a run card fill) assigns a crew that signed on to an apparatus, the resource raises a server
event that a station script can turn into tones, lights or a readerboard:

```lua
AddEventHandler('pulsemdt:stationAlert', function(alert)
  -- alert.apparatusId, alert.callsign (E7), alert.unitType (engine), alert.shortNumber,
  -- alert.natureName, alert.priority, alert.location.address, alert.location.x, alert.location.y
end)
```

Fire crews also get an in-game alert when their incident goes to a higher alarm, every unit hears a Mayday, and
units on an incident are told when command calls for a PAR.

## Frameworks (QBCore, Qbox, ESX)

PulseMDT finds a running framework on its own. When a player loads a character there, the same character appears
in PulseMDT (matched by citizen id, renamed when it changes), so plates, records and the civilian portal line up
with what is being played. To choose explicitly, or to switch the bridge off:

```cfg
set pulsemdt_framework "auto"   # auto, qbcore, qbox, esx or none
```

## Ambient and scripted 911 calls

Callout scripts (ERS and similar) report calls with one line. Several reports of the same scene within a few
minutes become notes on one call instead of a pile of duplicates; calls from real players are never merged.

```lua
exports.pulsemdt:ReportNpcCall({
  message = 'Shots heard behind the store',
  address = 'Innocence Blvd, Davis',
  postal = '8022',
  coords = { x = coords.x, y = coords.y },
  natureCode = 'SHOTS',
})
```

## Upgrading from PulseMDT 1.x

The resource keeps the name `pulsemdt`, so `pulse_*` scripts that call `exports.pulsemdt:*` keep working.
Duty exports (`IsOnDuty`, `GetOfficer`, `GetAvailableOfficers`, `HasCadJob`, ...) answer from 2.0 duty state.
Every `ApiRequest`/`ApiWrite` path the 1.x `pulse_*` resources use is answered in its 1.x shape: 911, panic and
plate or serial lookups map to 2.0 CAD and records, and characters, money, garage, dealership, property, needs,
vehicle keys, jail, medical, stations, logs and script settings go to the API's 1.x adapter, backed by 2.0 data.
Character, vehicle and property ids stay integers, so scripts that format them with `%d` keep working, and a
migrated community keeps its 1.x ids. Script settings are edited under Administration, Game scripts.

The server side is built from `apps/game-bridge` in the PulseMDT repository (`npm run build -w @pulsemdt/game-bridge`).

## Radio

Set `Config.Radio.enabled = true` in `config.lua`. Signing on puts the player on their agency's channel
(`agencyChannels`, by agency code) and signing off leaves the radio. With `incidentChannels`, units assigned to a
call move to that call's channel (`incidentChannelBase` plus the call number) and back to their agency's channel
when they clear. pma-voice works as is; for another radio script, change `setChannel` to call that script's export.
The terminal's status bar shows the current channel.
