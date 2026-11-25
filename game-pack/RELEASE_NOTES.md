# PulseMDT 2.0 FiveM game pack

Download `pulse-game-pack.zip` and extract it into your FiveM server's `resources` folder. The archive contains `[pulse]/pulsemdt`, the companion `pulse_*` resources, and `[pulse]/pulse.cfg`.

Create a server key under **Administration → Game servers**, then add this after your framework in `server.cfg`:

```cfg
set pulsemdt_api_url "https://api.pulsemdt.com"
set pulsemdt_server_key "pmdt_gs_..."
exec resources/[pulse]/pulse.cfg
```

Restart the server and check for **Connected** in PulseMDT. Map Discord roles under **Administration → Discord roles** if players need staff access. The older `pulsemdt-connector.zip` and `pulsemdt_api_key`/`pulsemdt_guild_id` settings are for 1.x and cannot connect to PulseMDT 2.

