# RescueLink Monorepo

This workspace now includes:

- `backend/` Django + DRF + JWT + SQLite3
- `frontend/` React (Vite) dashboard, light readable theme
- `mobile/` React Native (Expo) citizen app
- `.uploads/` local folder for uploaded emergency photos

## Default test accounts

- `admin` / `admin1234`
- `drrm` / `drrm1234`
- `citizen` / `citizen1234`

## 1) Run backend

```powershell
cd backend
.\.venv\Scripts\activate
python manage.py runserver
```

Backend URLs:

- API health: `http://127.0.0.1:8000/api/health/`
- Admin: `http://127.0.0.1:8000/admin/`
- JWT token: `http://127.0.0.1:8000/api/auth/token/`

## 2) Run web dashboard

```powershell
cd frontend
npm run dev
```

Open `http://127.0.0.1:5173/`

## 3) Run mobile app

```powershell
cd mobile
npm start
```

Notes:

- Android emulator uses `http://10.0.2.2:8000/api`
- iOS simulator/web use `http://127.0.0.1:8000/api`
- For physical device testing, update `API_BASE_URL` in `mobile/App.js` to your machine LAN IP

## Current implementation status

Implemented:

- JWT login for web and mobile
- Create emergency report with photo upload + lat/lng + contact
- Report list on dashboard
- Respond action (`DRRM`, `BFP`, `POLICE`)
- Status update flow (`PENDING` to `RESOLVED` etc.)
- Map display via Leaflet + OpenStreetMap
- Polling refresh every 10 seconds on web

Recommended next:

- Role-based permissions for DRRM/BFP/POLICE/admin actions
- Notification module
- Push notifications in mobile app
- Input validation and duplicate report checks
- Production deployment setup (SQLite migration path if needed)
