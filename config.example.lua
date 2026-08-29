-- PulseMDT FiveM Resource - Example Configuration
-- Copy this file to config.lua and fill in your values

Config = {}

-- API credentials are intentionally NOT stored in this shared file because
-- FiveM sends shared scripts to connected clients. Put these server-only
-- convars in server.cfg, using `set` (never `setr`):
-- set pulsemdt_api_key "your-api-key-here"
-- set pulsemdt_guild_id "your-guild-id-here"

-- Key to toggle the local CAD terminal open/close (FiveM key names).
-- Players can also use /cad.
-- See: https://docs.fivem.net/docs/game-references/input-mapper-parameter-ids/keyboard/
Config.ToggleKey = "F6"

-- How often (in milliseconds) to push unit location to the server
-- Lower = more accurate map, higher = less server load. Recommended: 3000-5000
Config.LocationUpdateInterval = 4000

-- Departments that can go on duty (must match your web dashboard department names)
Config.Departments = { "Police", "EMS", "Fire", "DOT" }

-- Default department when going on duty
Config.DefaultDepartment = "Police"

-- Panic button key (hold for 2 seconds to trigger)
Config.PanicKey = "F7"

-- Enable ANPR integration with Wraith ARS 2X
-- Requires the WraithARS2X resource: https://forum.cfx.re/t/1058277
-- When an officer locks a plate in Wraith, PulseMDT queries the database once
-- and shows the result (vehicle, owner, warrants, BOLO) in a top-right overlay.
-- The overlay clears when the plate is unlocked. Re-locking the same plate re-scans.
Config.EnableANPR = true

-- How long (in seconds) to keep the ANPR result overlay visible after a plate is locked.
-- Set to 0 to keep it on screen until the plate is manually unlocked in Wraith.
Config.ANPRDisplayTime = 0

-- Show a chat reminder for the /cad command and configured key after joining
Config.ShowWelcomeHint = true

-- ─── Framework integration ────────────────────────────────────────────────
-- Bridge PulseMDT to your server's framework so character identity and owned
-- vehicles sync automatically instead of being maintained by hand.
--   "standalone" - no framework, use Discord identity only (default, works everywhere)
--   "qb"         - QBCore  (exports 'qb-core')
--   "esx"        - ES Extended (es_extended)
--   "qbox"       - Qbox   (exports 'qbx_core')
Config.Framework = "standalone"

-- When true, going on duty maps the player's framework character (citizenid) to
-- a PulseMDT character and syncs their owned vehicle plates into the CAD.
Config.FrameworkSync = true

-- Economy hook: when true, fines paid on the web portal and payroll are moved
-- through the framework's money system (bank account). Requires a framework.
Config.EconomyHook = false
