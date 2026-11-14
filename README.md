# SC-Battery

A Millennium plugin that shows the battery level of the connected Steam Controller in the top bar of the Steam desktop client, the way Big Picture already does.

## Features

- Battery icon, percentage, or both, right next to the news and notification buttons.
- Green with a bolt while charging, red below 15%.
- Every Steam Controller connected at the same time gets its own indicator.
- Optionally shows any other wireless controller Steam reports a battery for.

The level comes from Steam itself (the same value Big Picture shows), as reported by the controller firmware.

## Settings

Open Millennium's plugin panel and pick **SC-Battery**:

- **Show**: icon and percentage, icon only, or percentage only.
- **Steam Controller only**: turn off to include other wireless controllers.

## Building

```
pnpm install
npm run build
```

Copy `plugin.json`, `backend/` and `.millennium/Dist` into `Steam\millennium\plugins\sc-battery`, then restart Steam.

## License

GPL-3.0-only. See [LICENSE](LICENSE).
