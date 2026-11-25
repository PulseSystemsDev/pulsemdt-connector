-- PulseMDT 2.0 resource configuration (client side).
--
-- The connection itself is configured in server.cfg, never here, so the key stays on the server:
--
--   set pulsemdt_api_url "https://api.pulsemdt.com"
--   set pulsemdt_server_key "pmdt_gs_..."        -- from Administration > Game servers. Use set, never setr.
--   set pulsemdt_notify_new_calls "true"          -- tell available units about new calls in their discipline
--
-- Start this resource before any pulse_* scripts: they call exports.pulsemdt:* and keep working unchanged.

Config = {}

-- Keys players can rebind under Settings > Key Bindings > FiveM.
Config.TabletKey = 'F6'
Config.PanicKey = 'F7'

-- Chat commands. Set one to false to turn it off.
Config.Commands = {
    tablet = 'mdt',       -- open the tablet
    duty = 'duty',        -- /duty LSPD 1A21  (agency code, callsign; callsign optional if your profile has one)
    offduty = 'offduty',
    status = 'status',    -- /status OS  (any status code or alias your community uses, like 10-97)
    panic = 'panic',
    call911 = '911',      -- /911 what is happening  (anyone can call, on duty or not)
    plate = 'plate',      -- /plate 8KLM441  (vehicle query with the officer-safety banner)
    person = 'person',    -- /person john smith  (name check; "last, first" works too)
}

-- Optional keys for quick status changes, for example { key = 'NUMPAD1', code = 'AV' }.
Config.QuickStatus = {}

-- Postal codes on calls and unit positions. Works with the common "nearest-postal" resource;
-- set to false if you do not run one.
Config.PostalResource = 'nearest-postal'

-- How often (milliseconds) an on-duty player's street name is refreshed for the dispatch board.
Config.StreetUpdateInterval = 5000

-- Use pulse_notify for alerts when it is running; otherwise the GTA notification feed is used.
Config.UsePulseNotify = true

-- Seconds a panic alert's blip stays on the map for other units.
Config.PanicBlipSeconds = 90

-- Radio. When enabled, signing on puts the player on their agency's channel and signing off leaves the radio.
-- With incidentChannels, units assigned to a call move to that call's channel and back when they clear.
-- Works with pma-voice as is; for another radio script, replace setChannel with that script's export.
Config.Radio = {
    enabled = false,
    agencyChannels = {
        LSPD = 1,
        BCSO = 2,
        SAHP = 3,
        LSFD = 4,
        EMS = 5,
    },
    incidentChannels = false,
    incidentChannelBase = 100,
    incidentChannelRange = 50,
    setChannel = function(channel)
        if GetResourceState('pma-voice') ~= 'started' then return false end
        exports['pma-voice']:setRadioChannel(channel)
        return true
    end,
}
