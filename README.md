# PulseMDT 2 FiveM game pack

[Download pulse-game-pack.zip](https://github.com/PulseSystemsDev/pulsemdt-connector/releases/latest/download/pulse-game-pack.zip) for the current PulseMDT dashboard. Extract the ZIP into your FiveM server's `resources` folder. It contains `[pulse]/pulsemdt`, 24 `pulse_*` resources, and `[pulse]/pulse.cfg`. Keep the folder names as they are.

## Connect a game server

1. In your PulseMDT community, open **Administration → Game servers** and create a server key.
2. Add these lines to `server.cfg` after your framework resources:

   ```cfg
   set pulsemdt_api_url "https://api.pulsemdt.com"
   set pulsemdt_server_key "pmdt_gs_..."
   exec resources/[pulse]/pulse.cfg
   ```

   Use `set`, never `setr`, so the server key stays private. If you only want the tablet, copy `[pulse]/pulsemdt` to `resources/pulsemdt` and use `ensure pulsemdt` instead of the `exec` line.
3. Restart the server. **Administration → Game servers** should show **Connected** within a minute. If it does not, check the `[PulseMDT]` lines in the FXServer console, the full server key, and outbound HTTPS access.
4. In **Administration → Discord roles**, invite the PulseMDT bot to your Discord server and map Discord roles to PulseMDT roles. Players must join the community with the same Discord account used by FiveM.

The resource includes `/mdt` and the F6 tablet shortcut. See [`game/pulsemdt/README.md`](game/pulsemdt/README.md) for commands, framework support, and integration exports.

## Source and older releases

The PulseMDT 2 resource is in [`game/pulsemdt`](game/pulsemdt). This repository's root resource and older `pulsemdt-connector.zip` releases are for PulseMDT 1.x. PulseMDT 2 ignores the old `pulsemdt_api_key` and `pulsemdt_guild_id` settings. Do not install the old ZIP or copy its `config.example.lua` for a 2.0 server.

