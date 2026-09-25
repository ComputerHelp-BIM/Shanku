# Shanku Bridge for Revit 0.1.0

Connects **Revit 2025** to **Shanku** in your browser on the same computer: load the open Revit model
into Shanku and keep the selection in step both ways. Protocol: `docs/bridge/protocol.md`.

## Install

1. Close Revit.
2. Unzip `Shanku.Revit-0.1.0.zip`, open PowerShell in the folder, then:
   ```powershell
   Unblock-File .\install.ps1
   powershell -ExecutionPolicy RemoteSigned -File .\install.ps1
   ```
3. Start Revit. On the first start Revit asks about the unsigned add-in: choose **Always Load**.

Remove it with `install.ps1 -Uninstall`.

## Use

1. Open a project in Revit, then **Shanku → Connect**: Revit shows a 6-digit code (5 minutes, once).
2. In Shanku (https://shanku.vercel.app), click **Revit** in the status bar (or search *Connect to Revit*),
   enter the code, and allow Chrome's *local network access* prompt.
3. **Load from Revit** opens the model in Shanku. Select in either program and the other follows.

A browser stays paired across restarts; **Shanku → Disconnect** unpairs every browser.

## What it does, and does not do (0.1.0)

- Reads only. Loading exports IFC4 Reference View inside a transaction that is rolled back, so the
  model is never changed. Selection sync only selects.
- Listens on `http://localhost:7071` for Shanku's sites only (see `shanku_bridge_config.json` for the
  port and extra sites). Nothing leaves your computer.
- Revit runs requests when it is idle: with a dialog open in Revit, Shanku waits.

## Troubleshooting

| Symptom | Fix |
|---|---|
| No Shanku tab | Check `%APPDATA%\Autodesk\Revit\Addins\2025\Shanku.Revit.addin` exists; see `%APPDATA%\Shanku\bridge.log`. |
| Connect says the port is in use | Set another `port` in `shanku_bridge_config.json` (in the add-in folder) and in Shanku's Revit window. |
| Shanku says "Revit not found" | Revit is closed, the add-in is not loaded, or Chrome's local network access was blocked (site settings). |
| Load takes long | Large models export slowly; Shanku waits up to 10 minutes. Close dialogs in Revit. |

Log: `%APPDATA%\Shanku\bridge.log`.

## Build

Needs the .NET 8 SDK (not Revit): `.\build.ps1` runs the tests, builds, and assembles `dist\`.

## Changelog

### 0.1.0 — 2026-09-24
- First release (milestone 1): pairing with a one-time code, load the model as IFC4 RV, selection sync
  both ways, Shanku ribbon tab (Connect, Disconnect, Open Shanku), log file.
