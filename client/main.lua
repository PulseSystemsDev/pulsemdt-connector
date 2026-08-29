local isOpen = false
local isOnDuty = false
local currentShift = nil
local locationThreadGen = 0
local panicHeld = false
local panicTimer = nil
local currentLockedPlate = nil
local dutyRequestPending = false
local cadAccessProfile = nil
local pendingServerCalls = {}
local nextRequestId = 0

local function sendNUI(action, data)
    SendNUIMessage({ action = action, data = data or {} })
end

local function notify(msg, type)
    sendNUI('notification', { message = msg, type = type or 'info' })
end

local function callServer(event, payload, cb, fallback, timeoutMs)
    nextRequestId = nextRequestId + 1
    if nextRequestId > 2147483647 then nextRequestId = 1 end
    local requestId = nextRequestId
    pendingServerCalls[requestId] = { event = event, cb = cb }

    if payload == nil then
        TriggerServerEvent(event, requestId)
    else
        TriggerServerEvent(event, payload, requestId)
    end

    SetTimeout(timeoutMs or 10000, function()
        local pending = pendingServerCalls[requestId]
        if not pending then return end
        pendingServerCalls[requestId] = nil
        print(('^1[PulseMDT]^7 %s: no response from server after %dms, using fallback'):format(event, timeoutMs or 10000))
        pending.cb(fallback)
    end)
end

RegisterNetEvent('pulsemdt:rpcResponse', function(requestId, result)
    local pending = pendingServerCalls[requestId]
    if not pending then return end
    pendingServerCalls[requestId] = nil
    pending.cb(result)
end)

local function openMDT()
    if isOpen then return end
    isOpen = true
    if not isOnDuty and not dutyRequestPending then
        dutyRequestPending = true
    end
    TriggerServerEvent('pulsemdt:requestCadAccess')
    print(('^5[PulseMDT]^7 cad: opening (onDuty=%s)'):format(tostring(isOnDuty)))
    SetNuiFocus(true, true)
    sendNUI('open', {
        onDuty = isOnDuty,
        shift = currentShift,
        syncingDuty = dutyRequestPending,
        loadingDutyProfiles = not isOnDuty,
        accessProfile = cadAccessProfile,
    })
end

local function closeMDT()
    if not isOpen then return end
    isOpen = false
    SetNuiFocus(false, false)
    sendNUI('close', {})
end

local function pushLocation()
    if not isOnDuty or not currentShift then return end
    local ped = PlayerPedId()
    local coords = GetEntityCoords(ped)
    TriggerServerEvent('pulsemdt:pushLocation', {
        lat = coords.y,
        lng = coords.x,
        status = currentShift.status or 'available',
    })
end

local function startLocationTimer()
    locationThreadGen = locationThreadGen + 1
    local gen = locationThreadGen
    CreateThread(function()
        while locationThreadGen == gen and isOnDuty do
            Wait(Config.LocationUpdateInterval)
            if locationThreadGen == gen and isOnDuty then
                pushLocation()
            end
        end
    end)
end

local function stopLocationTimer()
    locationThreadGen = locationThreadGen + 1
end

if Config.EnableANPR then
    local function runPlateScan(plate, speed)
        plate = plate:upper():gsub('%s+', '')
        if plate == '' then return end
        if plate == currentLockedPlate then return end
        currentLockedPlate = plate
        sendNUI('anprScanning', { plate = plate, speed = math.floor((speed or 0) * 2.237), displayTime = Config.ANPRDisplayTime })
        TriggerServerEvent('pulsemdt:anprScan', { plate = plate })
    end

    AddEventHandler('WraithARS2X:onPlateLock', function(plate, vehicle, speed)
        if not isOnDuty then return end
        runPlateScan(plate, speed)
    end)

    AddEventHandler('WraithARS2X:onSpeedLock', function(vehicle, speed)
        if not isOnDuty then return end
        if not vehicle or not DoesEntityExist(vehicle) then return end
        local plate = GetVehicleNumberPlateText(vehicle)
        runPlateScan(plate, speed)
    end)

    CreateThread(function()
        while true do
            Wait(500)
            if currentLockedPlate then
                local ok, locked = pcall(function()
                    return exports['WraithARS2X']:GetCurrentLockedPlate()
                end)
                if ok and (not locked or locked == '') then
                    currentLockedPlate = nil
                    sendNUI('anprClear', {})
                end
            end
        end
    end)
end

RegisterNetEvent('pulsemdt:anprResult', function(data)
    sendNUI('anprResult', data)
end)

RegisterCommand('cad', function()
    if isOpen then closeMDT() else openMDT() end
end, false)

RegisterKeyMapping('cad', 'Toggle Pulse CAD', 'keyboard', Config.ToggleKey)

RegisterNUICallback('close', function(_, cb)
    closeMDT()
    cb({})
end)

RegisterNUICallback('onDuty', function(data, cb)
    if isOnDuty then
        cb({ ok = false, error = 'You are already on duty.' })
        return
    end
    if dutyRequestPending then
        cb({ ok = false, error = 'Your duty status is already being updated.' })
        return
    end
    dutyRequestPending = true
    TriggerServerEvent('pulsemdt:shiftOn', data)
    cb({ ok = true })
end)

RegisterNUICallback('offDuty', function(_, cb)
    if not isOnDuty then
        cb({ ok = false, error = 'You are already off duty.' })
        return
    end
    if dutyRequestPending then
        cb({ ok = false, error = 'Your duty status is already being updated.' })
        return
    end
    dutyRequestPending = true
    TriggerServerEvent('pulsemdt:shiftOff')
    cb({ ok = true })
end)

RegisterNUICallback('refreshCadAccess', function(_, cb)
    TriggerServerEvent('pulsemdt:requestCadAccess')
    cb({ ok = true })
end)

RegisterNUICallback('getCivilianRecord', function(data, cb)
    callServer('pulsemdt:getCivilianRecord', data, function(result) cb(result or {}) end, { error = 'Civilian records are unavailable.' })
end)

RegisterNUICallback('updateStatus', function(data, cb)
    if currentShift then currentShift.status = data.status end
    TriggerServerEvent('pulsemdt:updateStatus', data)
    cb({})
end)

RegisterNUICallback('ncicLookup', function(data, cb)
    callServer('pulsemdt:ncicLookup', data, cb, { offline = true })
end)

RegisterNUICallback('plateLookup', function(data, cb)
    callServer('pulsemdt:plateLookup', data, cb, { offline = true })
end)

RegisterNUICallback('getCalls', function(_, cb)
    callServer('pulsemdt:getCalls', nil, cb, { offline = true })
end)

RegisterNUICallback('createCall', function(data, cb)
    callServer('pulsemdt:createCall', data, function(result) cb(result or {}) end, { offline = true, queued = true })
end)

RegisterNUICallback('getWarrants', function(_, cb)
    callServer('pulsemdt:getWarrants', nil, function(result) cb(result or { warrants = {} }) end, { offline = true, warrants = {} })
end)

RegisterNUICallback('issueWarrant', function(data, cb)
    callServer('pulsemdt:issueWarrant', data, function(result) cb(result or { ok = false }) end, { ok = false, offline = true })
end)

RegisterNUICallback('getReports', function(_, cb)
    callServer('pulsemdt:getReports', nil, function(result) cb(result or { reports = {} }) end, { offline = true, reports = {} })
end)

RegisterNUICallback('submitReport', function(data, cb)
    callServer('pulsemdt:submitReport', data, function(result) cb(result or { ok = false }) end, { ok = false, offline = true })
end)

RegisterNUICallback('getOnDutyUnits', function(_, cb)
    callServer('pulsemdt:getOnDutyUnits', nil, function(result) cb(result or { units = {} }) end, { offline = true, units = {} })
end)

RegisterNUICallback('getShiftHistory', function(_, cb)
    callServer('pulsemdt:getShiftHistory', nil, function(result) cb(result or { shifts = {} }) end, { offline = true, shifts = {} })
end)

RegisterNetEvent('pulsemdt:callReported', function(data)
    notify('Call #' .. (data.id or '?') .. ' reported', 'success')
end)

RegisterNUICallback('panic', function(_, cb)
    TriggerServerEvent('pulsemdt:panic', {})
    cb({})
end)

RegisterNetEvent('pulsemdt:shiftError', function(msg)
    dutyRequestPending = false
    sendNUI('shiftError', { message = msg })
    notify(msg, 'danger')
end)

RegisterNetEvent('pulsemdt:shiftStarted', function(shift)
    dutyRequestPending = false
    isOnDuty = true
    currentShift = shift
    sendNUI('shiftStarted', shift)
    startLocationTimer()
    notify('You are now on duty as ' .. shift.character_name .. (shift.offline and ' (offline mode)' or ''), 'success')
end)

RegisterNetEvent('pulsemdt:shiftEnded', function(stats)
    dutyRequestPending = false
    isOnDuty = false
    currentShift = nil
    currentLockedPlate = nil
    sendNUI('shiftEnded', stats or {})
    sendNUI('anprClear', {})
    stopLocationTimer()
    notify('You are now off duty', 'info')
end)

RegisterNetEvent('pulsemdt:dutyStateSynced', function(data)
    dutyRequestPending = false
    local wasOnDuty = isOnDuty
    isOnDuty = data and data.onDuty == true
    currentShift = isOnDuty and data.shift or nil
    sendNUI('dutyStateSynced', { onDuty = isOnDuty, shift = currentShift })

    if isOnDuty then
        if not wasOnDuty then startLocationTimer() end
    else
        currentLockedPlate = nil
        stopLocationTimer()
    end
end)

RegisterNetEvent('pulsemdt:dutyProfiles', function(data)
    sendNUI('dutyProfiles', data or { profiles = {} })
end)

local function hasOperationalCadAccess(profile)
    local jobs = profile and profile.access and profile.access.jobs
    if type(jobs) ~= 'table' then return false end
    return jobs.dmv == true
        or jobs.law == true
        or jobs.police == true
        or jobs.fire == true
        or jobs.ems == true
        or jobs.dispatch == true
end

RegisterNetEvent('pulsemdt:cadAccess', function(profile)
    cadAccessProfile = profile
    sendNUI('cadAccess', profile or {})
    if not isOnDuty and hasOperationalCadAccess(profile) then
        TriggerServerEvent('pulsemdt:requestDutyProfiles')
        if dutyRequestPending then TriggerServerEvent('pulsemdt:syncDutyState') end
    elseif not isOnDuty and dutyRequestPending then
        dutyRequestPending = false
        sendNUI('dutyStateSynced', { onDuty = false })
    end
end)

RegisterNetEvent('pulsemdt:cadAccessError', function(message)
    cadAccessProfile = nil
    dutyRequestPending = false
    sendNUI('cadAccessError', { message = message })
    notify(message, 'danger')
end)

CreateThread(function()
    while true do
        Wait(120000)
        if isOpen or isOnDuty then TriggerServerEvent('pulsemdt:requestCadAccess') end
    end
end)

RegisterNetEvent('pulsemdt:anprHit', function(data)
    notify('ANPR HIT: ' .. data.plate .. ' - ' .. data.reason, 'warning')
end)

RegisterNetEvent('pulsemdt:boloSync', function(bolos)
    sendNUI('boloSync', bolos)
end)

RegisterNetEvent('pulsemdt:newCall', function(call)
    sendNUI('newCall', call)
    notify('New ' .. call.call_type .. ' at ' .. call.location, 'dispatch')
end)

RegisterNetEvent('pulsemdt:panicAlert', function(data)
    sendNUI('panicAlert', data)
    notify('PANIC: ' .. data.name .. ' at ' .. (data.location or 'unknown'), 'danger')
end)

local serverOnline = true
RegisterNetEvent('pulsemdt:serverState', function(online)
    local was = serverOnline
    serverOnline = online and true or false
    sendNUI('serverState', { online = serverOnline })
    if was ~= serverOnline then
        if serverOnline then
            notify('CAD reconnected. Syncing queued actions.', 'success')
        else
            notify('CAD offline. Showing cached data; actions will sync when reconnected.', 'warning')
        end
    end
end)

RegisterNetEvent('pulsemdt:notify', function(msg, kind)
    notify(msg, kind or 'warning')
end)

AddEventHandler('onResourceStop', function(resourceName)
    if GetCurrentResourceName() ~= resourceName then return end
    if isOnDuty then TriggerServerEvent('pulsemdt:shiftOff', {}) end
    stopLocationTimer()
end)

RegisterCommand('panic', function()
    if not isOnDuty then
        notify('You must be on duty to use the panic button', 'error')
        return
    end
    TriggerServerEvent('pulsemdt:panic', {})
    notify('PANIC BUTTON TRIGGERED', 'danger')
end, false)

RegisterKeyMapping('panic', 'PulseMDT Panic Button', 'keyboard', Config.PanicKey)

RegisterNUICallback('getCodes', function(_, cb)
    callServer('pulsemdt:getCodes', nil, function(result) cb(result or {}) end, {})
end)

if Config.ShowWelcomeHint then
    CreateThread(function()
        Wait(5000)
        TriggerEvent('chat:addMessage', {
            color = { 6, 182, 212 },
            multiline = true,
            args = { 'PulseMDT', 'Use /cad or press ' .. Config.ToggleKey .. ' to open the local CAD terminal.' }
        })
    end)
end
