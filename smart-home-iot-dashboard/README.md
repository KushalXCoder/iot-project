# Haven — Smart Home IoT Dashboard

Frontend-only Next.js + Tailwind CSS prototype inspired by the supplied reference screenshot.

## 9. Details of Website

### Website name and purpose

**Haven — Smart Home IoT Dashboard** is a responsive web dashboard for monitoring and demonstrating a connected home. It gives the user one place to review device connectivity, filter devices by room, manage household profiles, view security information, and try local controls before the hardware and backend services are integrated.

### Technical details

| Area | Details |
| --- | --- |
| Framework | Next.js 15.2.4 using the App Router |
| Language | TypeScript 5.7 |
| UI | React 19 with Tailwind CSS 3.4 and custom CSS |
| Icons | `lucide-react` |
| Rendering | Client-side interactive page with React state |
| Data storage | In-memory demo data only; refreshing the page resets changes |
| Hardware integration | Not connected yet; ESP32, camera, RFID, audio, MQTT, and API values are represented by demo data |
| Responsive behavior | Desktop sidebar plus a mobile navigation drawer |
| Run command | `npm install`, then `npm run dev` |
| Local URL | `http://localhost:3000` |

### Main pages and functions

- **Authentication screen:** demo sign-in and account creation forms. The form demonstrates the flow but does not authenticate against a server.
- **Overview:** total devices, connected devices, devices requiring attention, known people, security status, recent activity, and quick actions.
- **Devices:** searchable device list, room filters, status pills, local on/off state changes, and an add-device form.
- **People:** sample household profiles with role, last-seen time, and face-match confidence.
- **Security:** RFID access summary, activity information, camera permission flow, and a local intruder snapshot capture using the browser camera.
- **Audio controls:** demo Wi-Fi speaker controls for play, pause, volume, and track selection.

### Website screenshot

The following screenshot shows the authenticated dashboard overview using the included sample data:

![Haven smart-home dashboard overview](./public/haven-dashboard.png)

### Source code

The complete website implementation is contained in the project source:

- [Dashboard page and interactions](./app/page.tsx)
- [Global layout and metadata](./app/layout.tsx)
- [Responsive visual styling](./app/globals.css)
- [Tailwind configuration](./tailwind.config.ts)
- [Dependency and script configuration](./package.json)

### Current limitations and integration points

This version is a frontend prototype. Device states, IP addresses, access events, people, and music playback are dummy values, and buttons update local React state only. No ESP32, camera stream, API, MQTT broker, persistent database, or user authentication service is connected.

For the complete system, replace the camera placeholder with the ESP32-CAM stream URL, connect audio controls to the audio ESP32 or an MQTT/backend service, replace sample devices with authenticated API/MQTT readings, and route remote access through a secured backend gateway. A demonstration video has not been added; it can be recorded after the hardware integrations are available.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Included
- Responsive sidebar and room filters
- Device summary cards and searchable device list
- Interactive demo on/off toggles
- ESP32-CAM preview placeholder
- ESP32 + MAX98357A Wi-Fi music controls (demo state)
- RFID door access summary
- Network/device status panel

## Important
This is only a frontend prototype. Device states, IP addresses, access events and music playback are dummy data. Buttons change local UI state only. No ESP32, camera stream, API, MQTT broker or backend is connected yet.

## Later integration points
- Replace the camera placeholder with the ESP32-CAM stream URL after confirming the stream format.
- Connect music controls to HTTP endpoints on the audio ESP32 or to a backend/MQTT service.
- Replace sample device data with real API/MQTT readings.
- Use an authenticated backend/gateway for remote access; do not expose ESP32 devices directly to the public Internet.
