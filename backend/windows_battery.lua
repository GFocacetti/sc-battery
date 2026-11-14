local fs = require("fs")
local utils = require("utils")
local logger = require("logger")

-- Battery levels Windows knows for Bluetooth controllers, read by a hidden helper (windows_battery.ps1)
-- that refreshes them every minute while Steam runs.

local POWERSHELL = [[C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe]]

local M = {}

local function out_path()
    local dir = fs.join(utils.get_backend_path(), "..", "data")
    if not fs.exists(dir) then fs.create_directories(dir) end
    return fs.join(dir, "windows-batteries.json")
end

-- Start-Process returns at once and leaves the helper running on its own; the helper exits by itself
-- when Steam closes, and a second copy exits straight away
function M.start()
    local script = fs.join(utils.get_backend_path(), "windows_battery.ps1")
    utils.exec(string.format(
        [[%s -WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -WindowStyle Hidden -FilePath '%s' -ArgumentList '-WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -File \"%s\" -Out \"%s\"'"]],
        POWERSHELL, POWERSHELL, script, out_path()))
    logger:info("windows battery helper started")
end

-- JSON list of { name, level }
function scb_windows_batteries()
    local path = out_path()
    if not fs.exists(path) then return "[]" end
    local raw = utils.read_file(path) or ""
    raw = raw:gsub("^\239\187\191", ""):gsub("^%s+", ""):gsub("%s+$", "")
    if raw == "" or raw == "null" then return "[]" end
    return raw
end

return M
