# BizTalk Orchestration Viewer

A local-first viewer for BizTalk orchestration artifacts. It reads `.odx`, `.btm`,
`.xsd`, binding XML, or other BizTalk-adjacent XML files and renders an
interactive orchestration diagram with shape details and migration notes.

## Run

```bash
npm install
npm run dev
```

Open the URL printed by Vite, then drag a BizTalk artifact into the app.

From PowerShell, you can also run `./start.ps1`; it installs dependencies on
the first run and starts the local viewer. The application processes artifacts
in the browser and does not upload them to a service.

## Build and package

Run the packaging script from PowerShell:

```powershell
./build-package.ps1
```

The script performs a clean dependency reinstall with `npm ci`, creates the
production build, and writes a versioned ZIP file to `artifacts/`. Pass
`-OutputDirectory <path>` to use a different output directory.

## What It Does

- Detects orchestration shapes from XML element names and BizTalk-style
  attributes.
- Builds a readable flow from document order and nested containers.
- Highlights receive/send, transform, decide, loop, scope, expression, and
  exception-like shapes.
- Shows referenced ports, messages, maps, schemas, bindings, and attributes
  when available.
- Provides a compact migration hint for each recognized shape.

This is intentionally static and local. It does not need BizTalk Server or a
tracking database.
