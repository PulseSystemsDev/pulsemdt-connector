local WEB_URL    = 'https://pulsemdt.com'
local API_KEY    = GetConvar('pulsemdt_api_key', '')
local GUILD_ID   = GetConvar('pulsemdt_guild_id', '')
local BASE       = WEB_URL .. '/api/fivem/' .. GUILD_ID

local plateData       = {}
local codesData       = nil
local onDuty          = {}
local officerStatus   = {}
local officerInfo     = {}
local dutyTransitions = {}
local cadAccessByPlayer = {}
local cadAccessExpiresAt = {}
local cadAccessRequestAt = {}
local cadAccessPending = {}
local cadAccessRetryScheduled = {}
local nextCadAccessRequestNonce = 0
local downloadCodes
local hasCadJob

local CAD_ACCESS_TTL_SECONDS = 300
local CAD_ACCESS_REQUEST_COOLDOWN_MS = 10000

if not API_KEY or API_KEY == '' then
    print('^1[PulseMDT]^7 pulsemdt_api_key is empty. Add `set pulsemdt_api_key "..."` to server.cfg using a key from the web Admin page. Never use setr.')
end
if not GUILD_ID or GUILD_ID == '' then
    print('^1[PulseMDT]^7 pulsemdt_guild_id is empty. Add `set pulsemdt_guild_id "..."` to server.cfg.')
end

local serverOnline    = true
local writeQueue      = {}
local personCache     = {}
local callsCache      = nil
local bolosCache      = {}
local MAX_QUEUE       = 200
local HTTP_TIMEOUT_MS = 8000

local flushWriteQueue
local apiRequest

local function isOnDuty(src)
    return onDuty[src] == true
end

local function isHttpSuccess(code)
    return type(code) == 'number' and code >= 200 and code < 300
end

local function respond(context, src, requestId, result)
    if type(requestId) ~= 'number' then
        print(('^1[PulseMDT]^7 %s received an invalid request id from src %s'):format(context, tostring(src)))
        return
    end
    local ok, err = pcall(TriggerClientEvent, 'pulsemdt:rpcResponse', src, requestId, result)
    if not ok then
        print(('^1[PulseMDT]^7 %s response failed for src %s: %s'):format(context, tostring(src), tostring(err)))
    end
end

local function broadcastServerState()
    for src in pairs(onDuty) do
        TriggerClientEvent('pulsemdt:serverState', src, serverOnline)
    end
end

local function setOnline(online)
    if online == serverOnline then return end
    serverOnline = online
    print(('^3[PulseMDT]^7 CAD server is now %s'):format(online and '^2ONLINE^7' or '^1OFFLINE^7'))
    broadcastServerState()
    if online then flushWriteQueue() end
end

apiRequest = function(method, path, body, cb)
    local done = false
    local function finish(code, data)
        if done then return end
        done = true
        setOnline(code >= 100)
        if cb then cb(code, data) end
    end
    PerformHttpRequest(BASE .. path, function(code, response)
        local ok, data = pcall(json.decode, response)
        finish(code, ok and data or {})
    end, method, body and json.encode(body) or '', {
        ['Content-Type'] = 'application/json',
        ['Authorization'] = 'Bearer ' .. API_KEY,
    })
    SetTimeout(HTTP_TIMEOUT_MS, function() finish(0, {}) end)
end

local function queueWrite(method, path, body)
    if #writeQueue >= MAX_QUEUE then table.remove(writeQueue, 1) end
    writeQueue[#writeQueue + 1] = { method = method, path = path, body = body }
end

flushWriteQueue = function()
    if #writeQueue == 0 then return end
    local pending = writeQueue
    writeQueue = {}
    print(('^3[PulseMDT]^7 Reconnected - replaying %d queued write(s)'):format(#pending))
    for _, w in ipairs(pending) do
        apiRequest(w.method, w.path, w.body, nil)
    end
end

local function apiWrite(method, path, body, cb)
    apiRequest(method, path, body, function(code, res)
        if code == 0 then queueWrite(method, path, body) end
        if cb then cb(code, res) end
    end)
end

exports('ApiRequest', function(method, path, body, cb)
    apiRequest(method, path, body, cb)
end)

exports('ApiWrite', function(method, path, body, cb)
    apiWrite(method, path, body, cb)
end)

exports('IsOnDuty', function(src)
    return onDuty[src] == true
        and hasCadJob ~= nil
        and hasCadJob(src, 'police', 'law', 'fire', 'ems', 'dispatch', 'dmv')
end)

exports('GetOnDutySources', function()
    local list = {}
    for src in pairs(onDuty) do
        if hasCadJob and hasCadJob(src, 'police', 'law', 'fire', 'ems', 'dispatch', 'dmv') then
            list[#list + 1] = src
        end
    end
    return list
end)

exports('HasCadJob', function(src, ...)
    return onDuty[src] == true and hasCadJob ~= nil and hasCadJob(src, ...)
end)

exports('GetOfficerStatus', function(src)
    if not onDuty[src] or not hasCadJob or not hasCadJob(src, 'police', 'law', 'fire', 'ems', 'dispatch', 'dmv') then return nil end
    return officerStatus[src] or 'available'
end)

exports('GetOfficer', function(src)
    if not onDuty[src] or not hasCadJob or not hasCadJob(src, 'police', 'law', 'fire', 'ems', 'dispatch', 'dmv') then return nil end
    return officerInfo[src]
end)

exports('GetAvailableOfficers', function()
    local list = {}
    for src in pairs(onDuty) do
        if hasCadJob and hasCadJob(src, 'police', 'fire', 'ems', 'dispatch')
            and (officerStatus[src] or 'available') == 'available' then
            list[#list + 1] = src
        end
    end
    return list
end)

local scriptConfig = {}

do
    local raw = LoadResourceFile(GetCurrentResourceName(), 'script-config.json')
    if raw then
        local ok, data = pcall(json.decode, raw)
        if ok and type(data) == 'table' then scriptConfig = data end
    end
end

local installedVersions = {}
do
    local raw = LoadResourceFile(GetCurrentResourceName(), 'installed-scripts.json')
    if raw then
        local ok, data = pcall(json.decode, raw)
        if ok and type(data) == 'table' then installedVersions = data end
    end
end

local function detectInstalledVersions()
    local detected = {}
    for key in pairs(scriptConfig) do
        if GetResourceState(key) ~= 'missing' then
            local version = GetResourceMetadata(key, 'version', 0)
            if type(version) == 'string' and version:match('^%d+%.%d+') then
                detected[key] = version
            end
        end
    end
    return detected
end

local function reportInstalledVersions()
    local detected = detectInstalledVersions()
    installedVersions = detected
    SaveResourceFile(GetCurrentResourceName(), 'installed-scripts.json', json.encode(installedVersions), -1)
    apiRequest('POST', '/scripts', { installedVersions = detected }, nil)
end

local B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
local function b64decode(data)
    data = tostring(data):gsub('[^' .. B64 .. '=]', '')
    return (data:gsub('.', function(x)
        if x == '=' then return '' end
        local r, f = '', (B64:find(x, 1, true) - 1)
        for i = 6, 1, -1 do r = r .. (f % 2 ^ i - f % 2 ^ (i - 1) > 0 and '1' or '0') end
        return r
    end):gsub('%d%d%d?%d?%d?%d?%d?%d?', function(x)
        if #x ~= 8 then return '' end
        local c = 0
        for i = 1, 8 do c = c + (x:sub(i, i) == '1' and 2 ^ (8 - i) or 0) end
        return string.char(c)
    end))
end

local function installScript(key, version)
    apiRequest('GET', '/scripts/files?key=' .. key, nil, function(code, res)
        if code ~= 200 or type(res) ~= 'table' or type(res.files) ~= 'table' then return end
        local ok = true
        for _, f in ipairs(res.files) do
            local content = b64decode(f.b64)
            if not SaveResourceFile(key, f.path, content, #content) then ok = false break end
        end
        if ok then
            installedVersions[key] = res.version
            SaveResourceFile(GetCurrentResourceName(), 'installed-scripts.json', json.encode(installedVersions), -1)
            apiWrite('POST', '/scripts', { scriptKey = key, installedVersion = res.version }, nil)
            print(('^2[PulseMDT]^7 %s updated to v%s. Apply it in console: ^3refresh; restart %s^7'):format(key, res.version, key))
        else
            print(('^3[PulseMDT]^7 %s v%s is approved but its resource folder is missing. Download it once from the dashboard (Scripts page), drop it in, then run ^3refresh; ensure %s^7 and updates will apply automatically after.'):format(key, res.version, key))
        end
    end)
end

local function checkForUpdates()
    for key, cfg in pairs(scriptConfig) do
        local approved = type(cfg) == 'table' and cfg.approvedVersion
        if type(approved) == 'string' and approved ~= '' and installedVersions[key] ~= approved then
            installScript(key, approved)
        end
    end
end

local function refreshScriptConfig()
    apiRequest('GET', '/scripts', nil, function(code, res)
        if code == 200 and type(res) == 'table' and type(res.scripts) == 'table' then
            scriptConfig = res.scripts
            SaveResourceFile(GetCurrentResourceName(), 'script-config.json', json.encode(scriptConfig), -1)
            reportInstalledVersions()
            TriggerEvent('pulsemdt:scriptsRefreshed')
            checkForUpdates()
        end
    end)
end

exports('GetScriptConfig', function(key)
    return scriptConfig[key]
end)

exports('GetInstalledVersion', function(key)
    return installedVersions[key]
end)

CreateThread(function()
    Wait(3000)
    while true do
        refreshScriptConfig()
        Wait(300000)
    end
end)

local function urlEncode(str)
    local encoded = tostring(str):gsub('[^%w%-%.%_%~]', function(c)
        return string.format('%%%02X', string.byte(c))
    end)
    return encoded
end

local function getDiscordId(src)
    local ids = GetPlayerIdentifiers(src)
    for _, id in ipairs(ids) do
        if id:sub(1, 8) == 'discord:' then
            return id:sub(9)
        end
    end
    return nil
end

local function normalizeShift(data)
    data = type(data) == 'table' and data or {}
    return {
        character_name = data.character_name or data.characterName or '',
        department = data.department or Config.DefaultDepartment,
        role = data.role or 'Officer',
        callsign = data.callsign,
        status = data.status or 'available',
    }
end

local function setLocalDuty(src, shift)
    shift = normalizeShift(shift)
    onDuty[src] = true
    officerStatus[src] = shift.status
    officerInfo[src] = {
        department = shift.department,
        role = shift.role,
        callsign = shift.callsign,
        characterName = shift.character_name,
    }
    return shift
end

local function clearLocalDuty(src)
    onDuty[src] = nil
    officerStatus[src] = nil
    officerInfo[src] = nil
end

hasCadJob = function(src, ...)
    if not cadAccessExpiresAt[src] or cadAccessExpiresAt[src] <= os.time() then
        cadAccessByPlayer[src] = nil
        cadAccessExpiresAt[src] = nil
        return false
    end
    local profile = cadAccessByPlayer[src]
    local jobs = profile and profile.access and profile.access.jobs
    if type(jobs) ~= 'table' then return false end
    for index = 1, select('#', ...) do
        if jobs[select(index, ...)] == true then return true end
    end
    return false
end

local function isSameDiscordPlayer(src, discordId)
    return discordId ~= nil and getDiscordId(src) == discordId
end

local function rejectCadRequest(context, src, requestId, message, empty)
    local result = type(empty) == 'table' and empty or {}
    result.forbidden = true
    result.error = message or 'Your Discord roles do not grant access to this CAD section.'
    respond(context .. '(forbidden)', src, requestId, result)
end

local function hasPublicSafetyAccess(src)
    return hasCadJob(src, 'police', 'law', 'fire', 'ems', 'dispatch', 'dmv')
end

local function hasReportAccess(src)
    return hasCadJob(src, 'police', 'law', 'fire', 'ems', 'dispatch')
end

local function hasLawAccess(src)
    return hasCadJob(src, 'police', 'law')
end

local function hasDispatchAccess(src)
    return hasCadJob(src, 'police', 'fire', 'ems', 'dispatch')
end

local function notifyCadDenied(src, message)
    TriggerClientEvent('pulsemdt:notify', src, message or 'Your Discord roles do not grant access to this CAD action.', 'danger')
end

local function revokePublicSafetyDuty(src, discordId, message)
    if not isOnDuty(src) then return end
    dutyTransitions[src] = nil
    clearLocalDuty(src)
    if discordId then apiWrite('POST', '/shift', { action = 'off', discordId = discordId }, nil) end
    TriggerClientEvent('pulsemdt:shiftEnded', src, nil)
    notifyCadDenied(src, message or 'Your public-safety CAD access was removed because your Discord permissions changed.')
end

local function fetchCadAccess(src, requestNonce, cb)
    local discordId = getDiscordId(src)
    if not discordId then
        cb(nil, 'A Discord account must be linked to FiveM before using /cad.')
        return
    end

    apiRequest('POST', '/auth', { discordId = discordId }, function(code, profile)
        if cadAccessPending[src] ~= requestNonce or not isSameDiscordPlayer(src, discordId) then return end
        if code == 200 and type(profile) == 'table' and profile.access and profile.access.isGuildMember then
            cadAccessByPlayer[src] = profile
            cadAccessExpiresAt[src] = os.time() + CAD_ACCESS_TTL_SECONDS
            if isOnDuty(src) and not hasPublicSafetyAccess(src) then
                revokePublicSafetyDuty(src, discordId)
            end
            cb(profile)
            return
        end

        if code == 0 or code == 429 or code >= 500 then
            -- An outage or upstream rate limit is not a verified permission denial.
            -- Only reuse authorization that is still inside its original TTL.
            if cadAccessExpiresAt[src] and cadAccessExpiresAt[src] > os.time()
                and cadAccessByPlayer[src] then
                cb(cadAccessByPlayer[src])
            else
                cb(nil, code == 429
                    and 'CAD authentication is temporarily rate limited by the service. Try again shortly.'
                    or 'CAD authentication is temporarily unavailable. Try again shortly.')
            end
            return
        end
        cadAccessByPlayer[src] = nil
        cadAccessExpiresAt[src] = nil
        revokePublicSafetyDuty(src, discordId)
        local message = type(profile) == 'table' and profile.error or nil
        cb(nil, message or 'Your Discord roles do not grant access to this community CAD.')
    end)
end

-- Coalesce access checks made during the local cooldown into a single deferred
-- refresh. An application cooldown must not masquerade as an HTTP rate limit.
local function requestCadAccess(src)
    if not GetPlayerName(src) then return end
    local now = GetGameTimer()
    local previous = cadAccessRequestAt[src]
    local elapsed = previous and (now - previous) or CAD_ACCESS_REQUEST_COOLDOWN_MS
    if cadAccessPending[src] then return end

    if elapsed >= 0 and elapsed < CAD_ACCESS_REQUEST_COOLDOWN_MS then
        if cadAccessExpiresAt[src] and cadAccessExpiresAt[src] > os.time()
            and cadAccessByPlayer[src] then
            TriggerClientEvent('pulsemdt:cadAccess', src, cadAccessByPlayer[src])
            return
        end
        if not cadAccessRetryScheduled[src] then
            local discordId = getDiscordId(src)
            if not discordId then
                TriggerClientEvent('pulsemdt:cadAccessError', src,
                    'A Discord account must be linked to FiveM before using /cad.')
                return
            end
            cadAccessRetryScheduled[src] = discordId
            SetTimeout(CAD_ACCESS_REQUEST_COOLDOWN_MS - elapsed + 100, function()
                if cadAccessRetryScheduled[src] ~= discordId then return end
                cadAccessRetryScheduled[src] = nil
                if isSameDiscordPlayer(src, discordId) then requestCadAccess(src) end
            end)
        end
        return
    end

    cadAccessRetryScheduled[src] = nil
    cadAccessRequestAt[src] = now
    nextCadAccessRequestNonce = nextCadAccessRequestNonce + 1
    if nextCadAccessRequestNonce > 2147483647 then nextCadAccessRequestNonce = 1 end
    local requestNonce = nextCadAccessRequestNonce
    cadAccessPending[src] = requestNonce
    fetchCadAccess(src, requestNonce, function(profile, errorMessage)
        if cadAccessPending[src] ~= requestNonce then return end
        cadAccessPending[src] = nil
        if profile then
            TriggerClientEvent('pulsemdt:cadAccess', src, profile)
        else
            TriggerClientEvent('pulsemdt:cadAccessError', src, errorMessage)
        end
    end)
end

RegisterNetEvent('pulsemdt:requestCadAccess', function()
    requestCadAccess(source)
end)

CreateThread(function()
    while true do
        Wait(30000)
        local now = os.time()
        for src in pairs(onDuty) do
            if not cadAccessExpiresAt[src] or cadAccessExpiresAt[src] <= now then
                revokePublicSafetyDuty(src, getDiscordId(src), 'Your duty session ended because Discord permissions could not be reverified.')
            end
        end
    end
end)

RegisterNetEvent('pulsemdt:getCivilianRecord', function(data, requestId)
    local src = source
    if not hasCadJob(src, 'civilian') then
        respond('getCivilianRecord(forbidden)', src, requestId, { error = 'Civilian access is not available for your Discord account.' })
        return
    end
    local discordId = getDiscordId(src)
    local charId = tonumber(data and data.charId)
    if not discordId or not charId then
        respond('getCivilianRecord(invalid)', src, requestId, { error = 'Character information is missing.' })
        return
    end
    apiRequest('GET', '/civilian-records?discordId=' .. urlEncode(discordId) .. '&charId=' .. tostring(math.floor(charId)), nil, function(code, result)
        if not isSameDiscordPlayer(src, discordId) or not hasCadJob(src, 'civilian') then return end
        if code == 200 and type(result) == 'table' then
            respond('getCivilianRecord(response)', src, requestId, result)
        else
            respond('getCivilianRecord(error)', src, requestId, { error = type(result) == 'table' and result.error or 'Civilian records are unavailable.' })
        end
    end)
end)

RegisterNetEvent('pulsemdt:requestDutyProfiles', function()
    local src = source
    if not hasPublicSafetyAccess(src) then
        TriggerClientEvent('pulsemdt:dutyProfiles', src, { profiles = {}, forbidden = true })
        return
    end
    local discordId = getDiscordId(src)
    if not discordId then
        TriggerClientEvent('pulsemdt:dutyProfiles', src, { profiles = {} })
        return
    end

    apiRequest('GET', '/roster?discordId=' .. urlEncode(discordId), nil, function(code, profiles)
        if not isSameDiscordPlayer(src, discordId) or not hasPublicSafetyAccess(src) then return end
        TriggerClientEvent('pulsemdt:dutyProfiles', src, {
            profiles = isHttpSuccess(code) and type(profiles) == 'table' and profiles or {},
            offline = code == 0,
        })
    end)
end)

RegisterNetEvent('pulsemdt:syncDutyState', function()
    local src = source
    if not hasPublicSafetyAccess(src) then
        TriggerClientEvent('pulsemdt:dutyStateSynced', src, { onDuty = false, forbidden = true })
        return
    end
    if isOnDuty(src) then
        local shift = normalizeShift(officerInfo[src])
        shift.status = officerStatus[src] or shift.status
        TriggerClientEvent('pulsemdt:serverState', src, serverOnline)
        TriggerClientEvent('pulsemdt:dutyStateSynced', src, { onDuty = true, shift = shift })
        return
    end
    if dutyTransitions[src] then return end

    local discordId = getDiscordId(src)
    if not discordId then
        TriggerClientEvent('pulsemdt:dutyStateSynced', src, { onDuty = false })
        return
    end

    dutyTransitions[src] = 'sync'
    apiRequest('GET', '/shift', nil, function(code, shifts)
        if not isSameDiscordPlayer(src, discordId) or not hasPublicSafetyAccess(src) then return end
        if dutyTransitions[src] ~= 'sync' then return end
        dutyTransitions[src] = nil

        if isHttpSuccess(code) and type(shifts) == 'table' then
            for _, activeShift in ipairs(shifts) do
                if tostring(activeShift.user_id or '') == tostring(discordId) then
                    local shift = setLocalDuty(src, activeShift)
                    TriggerClientEvent('pulsemdt:serverState', src, serverOnline)
                    TriggerClientEvent('pulsemdt:dutyStateSynced', src, { onDuty = true, shift = shift })
                    if not codesData then downloadCodes() end
                    return
                end
            end
        end

        TriggerClientEvent('pulsemdt:dutyStateSynced', src, { onDuty = false })
    end)
end)

RegisterNetEvent('pulsemdt:shiftOn', function(data)
    local src = source
    data = type(data) == 'table' and data or {}
    if not hasPublicSafetyAccess(src) then
        TriggerClientEvent('pulsemdt:shiftError', src, 'Your Discord roles do not grant access to public-safety duty tools.')
        return
    end
    if isOnDuty(src) then
        TriggerClientEvent('pulsemdt:shiftError', src, 'You are already on duty.')
        return
    end
    if dutyTransitions[src] then
        TriggerClientEvent('pulsemdt:shiftError', src, 'Your duty status is already being updated.')
        return
    end
    local discordId = getDiscordId(src)
    if not discordId then
        TriggerClientEvent('pulsemdt:shiftError', src, 'Could not find your Discord ID. Make sure Discord is linked to FiveM.')
        return
    end
    dutyTransitions[src] = 'on'
    local body = {
        action     = 'on',
        discordId  = discordId,
        department = data.department or Config.DefaultDepartment,
        role       = data.role or 'Officer',
        callsign   = data.callsign,
        charId     = data.charId,
        characterName = data.characterName or GetPlayerName(src),
    }

    if Config.FrameworkSync and _G.PulseFramework and _G.PulseFramework.IsActive() then
        local ident = _G.PulseFramework.GetIdentity(src)
        if ident then
            body.frameworkId = ident.id
            body.frameworkName = ident.name
            body.frameworkJob = ident.job
            body.frameworkGrade = ident.grade
            if not data.characterName and ident.name and ident.name ~= '' then
                body.characterName = ident.name
            end
            body.ownedPlates = _G.PulseFramework.GetOwnedPlates(src)
        end
    end
    apiRequest('POST', '/shift', body, function(code, res)
        if not isSameDiscordPlayer(src, discordId) or not hasPublicSafetyAccess(src) then return end
        if dutyTransitions[src] ~= 'on' then return end
        dutyTransitions[src] = nil
        if isHttpSuccess(code) then
            local rosterProfile = type(res) == 'table' and type(res.profile) == 'table' and res.profile or nil
            if type(res) == 'table' and res.charId then body.charId = res.charId end
            if rosterProfile then
                body.department = rosterProfile.department or body.department
                body.role = rosterProfile.role or body.role
                body.callsign = rosterProfile.callsign or body.callsign
            end
            local shift = setLocalDuty(src, body)
            TriggerClientEvent('pulsemdt:serverState', src, serverOnline)
            if not codesData then downloadCodes() end
            TriggerClientEvent('pulsemdt:shiftStarted', src, {
                character_name = shift.character_name,
                department = shift.department,
                role = shift.role,
                callsign = shift.callsign,
                status = shift.status,
            })
        elseif code == 0 then
            local shift = setLocalDuty(src, body)
            queueWrite('POST', '/shift', body)
            TriggerClientEvent('pulsemdt:serverState', src, false)
            TriggerClientEvent('pulsemdt:shiftStarted', src, {
                character_name = shift.character_name,
                department = shift.department,
                role = shift.role,
                callsign = shift.callsign,
                status = shift.status,
                offline = true,
            })
        else
            TriggerClientEvent('pulsemdt:shiftError', src, 'Failed to start shift. Check pulsemdt_api_key and pulsemdt_guild_id in server.cfg.')
        end
    end)
end)

RegisterNetEvent('pulsemdt:shiftOff', function()
    local src = source
    if not isOnDuty(src) then
        TriggerClientEvent('pulsemdt:shiftError', src, 'You are already off duty.')
        return
    end
    if dutyTransitions[src] then
        TriggerClientEvent('pulsemdt:shiftError', src, 'Your duty status is already being updated.')
        return
    end

    dutyTransitions[src] = 'off'
    clearLocalDuty(src)
    local discordId = getDiscordId(src)
    if not discordId then
        dutyTransitions[src] = nil
        TriggerClientEvent('pulsemdt:shiftEnded', src, nil)
        return
    end
    apiRequest('POST', '/shift', { action = 'off', discordId = discordId }, function(code, _)
        if not isSameDiscordPlayer(src, discordId) then return end
        if dutyTransitions[src] ~= 'off' then return end
        dutyTransitions[src] = nil
        if code == 0 then queueWrite('POST', '/shift', { action = 'off', discordId = discordId }) end
        if isHttpSuccess(code) then
            apiRequest('GET', '/stats', nil, function(scode, stats)
                TriggerClientEvent('pulsemdt:shiftEnded', src, isHttpSuccess(scode) and stats or nil)
            end)
        else
            TriggerClientEvent('pulsemdt:shiftEnded', src, nil)
        end
    end)
end)

RegisterNetEvent('pulsemdt:updateStatus', function(data)
    local src = source
    if not isOnDuty(src) or not hasPublicSafetyAccess(src) then return end
    data = type(data) == 'table' and data or {}
    if data.status then officerStatus[src] = data.status end
    local discordId = getDiscordId(src)
    if not discordId then return end
    apiRequest('POST', '/location', {
        discordId = discordId,
        status = data.status,
    }, nil)
end)

RegisterNetEvent('pulsemdt:pushLocation', function(data)
    local src = source
    if not isOnDuty(src) or not hasPublicSafetyAccess(src) then return end
    data = type(data) == 'table' and data or {}
    if data.status then officerStatus[src] = data.status end
    local discordId = getDiscordId(src)
    if not discordId then return end
    apiRequest('POST', '/location', {
        discordId = discordId,
        lat = data.lat,
        lng = data.lng,
        status = data.status,
    }, nil)
end)

RegisterNetEvent('pulsemdt:ncicLookup', function(data, requestId)
    local src = source
    if not hasLawAccess(src) then
        rejectCadRequest('ncicLookup', src, requestId, 'Your Discord roles do not grant access to person records.')
        return
    end
    if not isOnDuty(src) then
        respond('ncicLookup(off-duty)', src, requestId, { requiresDuty = true, error = 'Go on duty to search CAD records.' })
        return
    end
    data = type(data) == 'table' and data or {}
    local discordId = getDiscordId(src)
    local query = data.query or ''
    apiRequest('GET', '/ncic?query=' .. urlEncode(query), nil, function(code, res)
        if not isSameDiscordPlayer(src, discordId) or not hasLawAccess(src) then return end
        local result
        if code == 200 then
            personCache[query] = res
            result = res
        elseif personCache[query] then
            result = { offline = true, cached = true, data = personCache[query] }
            for k, v in pairs(personCache[query]) do if result[k] == nil then result[k] = v end end
        else
            result = { offline = true }
        end
        respond('ncicLookup(response)', src, requestId, result)
    end)
end)

RegisterNetEvent('pulsemdt:plateLookup', function(data, requestId)
    local src = source
    if not hasLawAccess(src) then
        rejectCadRequest('plateLookup', src, requestId, 'Your Discord roles do not grant access to vehicle records.')
        return
    end
    if not isOnDuty(src) then
        respond('plateLookup(off-duty)', src, requestId, { requiresDuty = true, error = 'Go on duty to search vehicle records.' })
        return
    end
    data = type(data) == 'table' and data or {}
    local discordId = getDiscordId(src)
    local plate = (data.plate or ''):upper():gsub('%s+', '')
    apiRequest('GET', '/ncic?plate=' .. urlEncode(plate), nil, function(code, res)
        if not isSameDiscordPlayer(src, discordId) or not hasLawAccess(src) then return end
        if code == 200 then
            local veh  = (res.vehicle ~= nil and res.vehicle ~= json.null) and res.vehicle or false
            local own  = (res.owner   ~= nil and res.owner   ~= json.null) and res.owner   or false
            local bolo = (res.bolo    ~= nil and res.bolo    ~= json.null) and res.bolo    or false
            plateData[plate] = { vehicle = veh, owner = own, warrants = res.warrants or {}, bolo = bolo }
            respond('plateLookup(live)', src, requestId, res)
        else
            local stored = plateData[plate]
            local result = stored and {
                vehicle  = stored.vehicle,
                owner    = stored.owner,
                warrants = stored.warrants,
                bolo     = stored.bolo,
                offline  = true,
                cached   = true,
            } or { offline = true }
            respond('plateLookup(cached)', src, requestId, result)
        end
    end)
end)

RegisterNetEvent('pulsemdt:getCalls', function(requestId)
    local src = source
    print(('^5[PulseMDT]^7 getCalls requested by src %s (onDuty=%s)'):format(src, tostring(isOnDuty(src))))
    if not hasDispatchAccess(src) then
        rejectCadRequest('getCalls', src, requestId, 'Your Discord roles do not grant access to live dispatch.', { calls = {} })
        return
    end
    if not isOnDuty(src) then
        respond('getCalls(off-duty)', src, requestId, { requiresDuty = true, calls = {} })
        return
    end
    local discordId = getDiscordId(src)
    local startedAt = GetGameTimer()
    apiRequest('GET', '/cad', nil, function(code, res)
        if not isSameDiscordPlayer(src, discordId) or not hasDispatchAccess(src) then return end
        print(('^5[PulseMDT]^7 getCalls response for src %s: code=%s elapsed=%dms'):format(src, tostring(code), GetGameTimer() - startedAt))
        if code == 200 then
            callsCache = res
            respond('getCalls(live)', src, requestId, res)
        elseif callsCache then
            respond('getCalls(cached)', src, requestId, { offline = true, cached = true, calls = callsCache })
        else
            respond('getCalls(empty)', src, requestId, { offline = true })
        end
    end)
end)

downloadCodes = function()
    apiRequest('GET', '/codes', nil, function(code, res)
        if code == 200 and type(res) == 'table' then
            codesData = res
        end
    end)
end

RegisterNetEvent('pulsemdt:getCodes', function(requestId)
    local src = source
    print(('^5[PulseMDT]^7 getCodes requested by src %s (onDuty=%s, cached=%s)'):format(src, tostring(isOnDuty(src)), tostring(codesData ~= nil)))
    if not hasPublicSafetyAccess(src) then
        rejectCadRequest('getCodes', src, requestId, 'Your Discord roles do not grant access to public-safety codes.', { codes = {} })
        return
    end
    if not isOnDuty(src) then
        respond('getCodes(off-duty)', src, requestId, { requiresDuty = true, codes = {} })
        return
    end
    respond('getCodes(response)', src, requestId, codesData or {})
end)

RegisterNetEvent('pulsemdt:getWarrants', function(requestId)
    local src = source
    if not hasLawAccess(src) then
        rejectCadRequest('getWarrants', src, requestId, 'Your Discord roles do not grant access to warrants.', { warrants = {} })
        return
    end
    if not isOnDuty(src) then
        respond('getWarrants(off-duty)', src, requestId, { requiresDuty = true, warrants = {} })
        return
    end
    local discordId = getDiscordId(src)
    apiRequest('GET', '/warrants', nil, function(code, res)
        if not isSameDiscordPlayer(src, discordId) or not hasLawAccess(src) then return end
        if code == 200 and type(res) == 'table' then
            respond('getWarrants(live)', src, requestId, { warrants = res })
        else
            respond('getWarrants(empty)', src, requestId, { offline = true, warrants = {} })
        end
    end)
end)

RegisterNetEvent('pulsemdt:issueWarrant', function(data, requestId)
    local src = source
    if not hasLawAccess(src) then
        rejectCadRequest('issueWarrant', src, requestId, 'Your Discord roles do not grant permission to issue warrants.', { ok = false })
        return
    end
    if not isOnDuty(src) then
        respond('issueWarrant(off-duty)', src, requestId, { ok = false, requiresDuty = true, error = 'Go on duty to issue a warrant.' })
        return
    end
    data = type(data) == 'table' and data or {}
    local charId = tonumber(data.charId)
    local reason = data.reason
    if not charId or not reason or reason == '' then
        respond('issueWarrant(invalid)', src, requestId, { ok = false, error = 'Missing character or reason' })
        return
    end
    local discordId = getDiscordId(src)
    local officer = officerInfo[src]
    local body = {
        charId = charId,
        characterName = data.characterName,
        reason = reason,
        issuedBy = discordId,
        issuedByName = officer and officer.characterName or GetPlayerName(src),
        expiresAt = data.expiresAt,
    }
    apiRequest('POST', '/warrants', body, function(code, res)
        if not isSameDiscordPlayer(src, discordId) or not hasLawAccess(src) then return end
        respond('issueWarrant(response)', src, requestId, { ok = code == 201, id = res and res.id or nil })
    end)
end)

RegisterNetEvent('pulsemdt:getReports', function(requestId)
    local src = source
    if not hasReportAccess(src) then
        rejectCadRequest('getReports', src, requestId, 'Your Discord roles do not grant access to public-safety reports.', { reports = {} })
        return
    end
    if not isOnDuty(src) then
        respond('getReports(off-duty)', src, requestId, { requiresDuty = true, reports = {} })
        return
    end
    local discordId = getDiscordId(src)
    apiRequest('GET', '/reports', nil, function(code, res)
        if not isSameDiscordPlayer(src, discordId) or not hasReportAccess(src) then return end
        if code == 200 and type(res) == 'table' then
            respond('getReports(live)', src, requestId, { reports = res })
        else
            respond('getReports(empty)', src, requestId, { offline = true, reports = {} })
        end
    end)
end)

RegisterNetEvent('pulsemdt:submitReport', function(data, requestId)
    local src = source
    if not hasReportAccess(src) then
        rejectCadRequest('submitReport', src, requestId, 'Your Discord roles do not grant permission to file public-safety reports.', { ok = false })
        return
    end
    if not isOnDuty(src) then
        respond('submitReport(off-duty)', src, requestId, { ok = false, requiresDuty = true, error = 'Go on duty to file a report.' })
        return
    end
    data = type(data) == 'table' and data or {}
    local incidentType = data.incidentType
    local location = data.location
    local narrative = data.narrative
    if not incidentType or not location or not narrative or narrative == '' then
        respond('submitReport(invalid)', src, requestId, { ok = false, error = 'Missing incident type, location, or narrative' })
        return
    end
    local discordId = getDiscordId(src)
    local officer = officerInfo[src]
    local body = {
        discordId = discordId,
        departmentName = officer and officer.department or nil,
        incidentType = incidentType,
        location = location,
        units = data.units,
        narrative = narrative,
        disposition = data.disposition,
    }
    apiRequest('POST', '/reports', body, function(code, res)
        if not isSameDiscordPlayer(src, discordId) or not hasReportAccess(src) then return end
        respond('submitReport(response)', src, requestId, { ok = code == 201, id = res and res.id or nil, error = code ~= 201 and res and res.error or nil })
    end)
end)

RegisterNetEvent('pulsemdt:getOnDutyUnits', function(requestId)
    local src = source
    if not hasPublicSafetyAccess(src) then
        rejectCadRequest('getOnDutyUnits', src, requestId, 'Your Discord roles do not grant access to the active roster.', { units = {} })
        return
    end
    if not isOnDuty(src) then
        respond('getOnDutyUnits(off-duty)', src, requestId, { requiresDuty = true, units = {} })
        return
    end
    local discordId = getDiscordId(src)
    apiRequest('GET', '/units', nil, function(code, res)
        if not isSameDiscordPlayer(src, discordId) or not hasPublicSafetyAccess(src) then return end
        if code == 200 and type(res) == 'table' then
            respond('getOnDutyUnits(live)', src, requestId, { units = res })
        else
            respond('getOnDutyUnits(empty)', src, requestId, { offline = true, units = {} })
        end
    end)
end)

RegisterNetEvent('pulsemdt:getShiftHistory', function(requestId)
    local src = source
    if not hasPublicSafetyAccess(src) then
        rejectCadRequest('getShiftHistory', src, requestId, 'Your Discord roles do not grant access to shift history.', { shifts = {} })
        return
    end
    if not isOnDuty(src) then
        respond('getShiftHistory(off-duty)', src, requestId, { requiresDuty = true, shifts = {} })
        return
    end
    local discordId = getDiscordId(src)
    apiRequest('GET', '/shift-history', nil, function(code, res)
        if not isSameDiscordPlayer(src, discordId) or not hasPublicSafetyAccess(src) then return end
        if code == 200 and type(res) == 'table' then
            respond('getShiftHistory(live)', src, requestId, { shifts = res })
        else
            respond('getShiftHistory(empty)', src, requestId, { offline = true, shifts = {} })
        end
    end)
end)

CreateThread(function()
    Wait(5000)
    downloadCodes()
end)

RegisterNetEvent('pulsemdt:panic', function()
    local src = source
    if not isOnDuty(src) or not hasPublicSafetyAccess(src) then
        notifyCadDenied(src, 'You must have an authorized public-safety role and be on duty to use panic.')
        return
    end
    local discordId = getDiscordId(src)
    local name = GetPlayerName(src)
    local ped = GetPlayerPed(src)
    local coords = GetEntityCoords(ped)
    local location = string.format('%.1f, %.1f', coords.x, coords.y)

    apiWrite('POST', '/logs', {
        discordId = discordId,
        event = 'panic',
        details = 'Panic button triggered by ' .. name .. ' at ' .. location,
    }, nil)

    for target in pairs(onDuty) do
        if hasPublicSafetyAccess(target) then
            TriggerClientEvent('pulsemdt:panicAlert', target, {
                name = name,
                location = location,
                discordId = discordId,
            })
        end
    end
end)

RegisterNetEvent('pulsemdt:anprScan', function(data)
    local src = source
    if not isOnDuty(src) or not hasLawAccess(src) then return end
    data = type(data) == 'table' and data or {}
    local discordId = getDiscordId(src)
    local plate = (data.plate or ''):upper():gsub('%s+', '')
    if plate == '' then return end

    apiRequest('GET', '/ncic?plate=' .. urlEncode(plate), nil, function(code, res)
        if not isSameDiscordPlayer(src, discordId) or not hasLawAccess(src) then return end
        if code == 200 then
            local veh      = (res.vehicle ~= nil and res.vehicle ~= json.null) and res.vehicle or false
            local own      = (res.owner   ~= nil and res.owner   ~= json.null) and res.owner   or false
            local bolo     = (res.bolo    ~= nil and res.bolo    ~= json.null) and res.bolo    or false
            local warrants = res.warrants or {}

            plateData[plate] = { vehicle = veh, owner = own, warrants = warrants, bolo = bolo }

            TriggerClientEvent('pulsemdt:anprResult', src, {
                plate    = plate,
                vehicle  = veh,
                owner    = own,
                warrants = warrants,
                bolo     = bolo,
                offline  = false,
            })

            local hasBolo    = bolo ~= false
            local hasWarrant = #warrants > 0
            local stolen     = veh and veh.status == 'stolen'

            if hasBolo or hasWarrant or stolen then
                local reason = hasBolo and ('BOLO: ' .. (bolo.description or ''))
                            or (hasWarrant and 'Warrant on file')
                            or 'Stolen vehicle'
                TriggerClientEvent('pulsemdt:anprHit', src, { plate = plate, reason = reason })
                apiWrite('POST', '/logs', {
                    event   = 'anpr_hit',
                    details = 'ANPR hit on plate ' .. plate .. ': ' .. reason,
                }, nil)
            end
        else
            local stored = plateData[plate]
            if stored then
                TriggerClientEvent('pulsemdt:anprResult', src, {
                    plate    = plate,
                    vehicle  = stored.vehicle,
                    owner    = stored.owner,
                    warrants = stored.warrants,
                    bolo     = stored.bolo,
                    offline  = true,
                    cached   = true,
                })

                local hasBolo    = stored.bolo ~= false
                local hasWarrant = #stored.warrants > 0
                local stolen     = stored.vehicle and stored.vehicle.status == 'stolen'

                if hasBolo or hasWarrant or stolen then
                    local reason = hasBolo and ('BOLO: ' .. (stored.bolo.description or ''))
                                or (hasWarrant and 'Warrant on file')
                                or 'Stolen vehicle'
                    TriggerClientEvent('pulsemdt:anprHit', src, {
                        plate  = plate,
                        reason = reason .. ' (offline)',
                    })
                end
            else
                TriggerClientEvent('pulsemdt:anprResult', src, {
                    plate    = plate,
                    vehicle  = false,
                    owner    = false,
                    warrants = {},
                    bolo     = false,
                    offline  = true,
                    cached   = false,
                })
            end
        end
    end)
end)

RegisterNetEvent('pulsemdt:createCall', function(data, requestId)
    local src = source
    if not hasDispatchAccess(src) then
        rejectCadRequest('createCall', src, requestId, 'Your Discord roles do not grant permission to create dispatch calls.')
        return
    end
    data = type(data) == 'table' and data or {}
    local discordId = getDiscordId(src)
    local ped = GetPlayerPed(src)
    local coords = GetEntityCoords(ped)
    local body = {
        call_type   = data.call_type or '911 Call',
        location    = data.location or 'Unknown',
        description = data.description,
        priority    = data.priority or 3,
        discordId   = discordId,
        lat         = coords.y,
        lng         = coords.x,
    }
    apiWrite('POST', '/cad', body, function(code, res)
        if not isSameDiscordPlayer(src, discordId) or not hasDispatchAccess(src) then return end
        if code == 201 then
            respond('createCall(response)', src, requestId, res)
            TriggerClientEvent('pulsemdt:callReported', src, res)
        elseif code == 0 then
            respond('createCall(queued)', src, requestId, { offline = true, queued = true })
            TriggerClientEvent('pulsemdt:notify', src, 'CAD offline - call saved and will sync when back online.')
        else
            respond('createCall(error)', src, requestId, res)
        end
    end)
end)

AddEventHandler('playerDropped', function()
    local src = source
    onDuty[src] = nil
    officerStatus[src] = nil
    officerInfo[src] = nil
    cadAccessByPlayer[src] = nil
    cadAccessExpiresAt[src] = nil
    cadAccessRequestAt[src] = nil
    cadAccessPending[src] = nil
    cadAccessRetryScheduled[src] = nil
    dutyTransitions[src] = nil
    local discordId = getDiscordId(src)
    if not discordId then return end
    apiWrite('POST', '/shift', { action = 'off', discordId = discordId }, nil)
end)

CreateThread(function()
    while true do
        apiRequest('GET', '/bolos', nil, function(code, bolos)
            if code == 200 and type(bolos) == 'table' then
                bolosCache = bolos
            end
            for src in pairs(onDuty) do
                if hasLawAccess(src) or hasDispatchAccess(src) then
                    TriggerClientEvent('pulsemdt:boloSync', src, bolosCache)
                end
            end
        end)
        if not codesData and serverOnline then downloadCodes() end
        Wait(serverOnline and 60000 or 15000)
    end
end)
