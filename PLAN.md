# CodeSync — Project Plan

**Goal:** Real-time collaborative code editor (Google Docs for code)  
**Stack:** React + TypeScript (Vite) · Monaco Editor · Socket.IO · Node.js + Express · PostgreSQL · Redis · JWT · Judge0 · AWS EC2 + Nginx + PM2  
**Performance target:** <100ms latency for ≤50 concurrent users per room

**Current status:** Portfolio-ready local MVP is working. Core collaboration, auth, room flow, and code execution are implemented. Remaining work is mostly deployment, production hardening, and a few portfolio/product stretch features.

---

## Phase 1 — Foundation ✅ DONE

- [x] Monorepo setup (client + server + infra + load-tests)
- [x] PostgreSQL schema — `users`, `rooms`, `documents` tables
- [x] JWT auth — register, login, access token (15m) + refresh token (7d)
- [x] Auto token refresh on 401 in HTTP client
- [x] Room management API — create, list, get, delete with ownership checks
- [x] Basic Express server with middleware (CORS, JSON, auth)

## Phase 2 — Real-time Collaboration ✅ DONE

- [x] Socket.IO server with JWT auth middleware on handshake
- [x] Yjs CRDT document sync — concurrent insert/delete convergence
- [x] In-memory room state with bounded history entries for replay
- [x] Debounced PostgreSQL persistence (2s after last edit)
- [x] Redis pub/sub for multi-instance horizontal scaling
- [x] Cursor/selection presence — Redis-backed with 30s TTL
- [x] Monaco Editor integration on client
- [x] `useSocket` hook — room join, Yjs update sync, and cursor sync
- [x] Monaco/Yjs binding — change tracking, CRDT update sync, remote update application
- [x] Presence badge UI (collaborator cursors in top-right)
- [x] Code execution via Judge0 (JS, TS, Python, Java, C++, C, Go, Rust)
- [x] Output panel for execution results
- [x] Java execution compatibility fix (`Main` class normalization for Judge0)
- [x] Base starter templates for supported languages
- [x] Reliable editor bootstrapping so starter code loads when room state arrives before Monaco mount

## Phase 3 — Stability & Portfolio Polish ✅ DONE

- [x] Fix root build so `npm run build` succeeds
- [x] Add Vite env typing for `import.meta.env`
- [x] Improve editor/socket flow so local edits emit correctly and remote edits do not re-emit
- [x] Add visible loading/error states for login, rooms, editor load, and execution
- [x] Add top-level React error boundary / graceful fallback
- [x] Centralize local auth session helpers and cleanup on expiry/logout
- [x] Improve execution feedback so users see running/result/error states
- [x] Add VS Code-style editor modes for theme, word wrap, minimap, and font size
- [x] Add README with setup instructions, architecture notes, tradeoffs, and next steps
- [x] Add example env files for client and server
- [x] Make the output panel more prominent in the UI
- [x] Test the full stack manually with live PostgreSQL + Redis + Judge0 in a clean local environment
- [x] Add repeatable local smoke tests for Yjs collaboration, cursors, notes, permissions, and execution
- [x] Remove legacy OT socket path after Yjs migration

## Phase 4 — Infrastructure & Hardening 🔲 TODO

- [ ] Deploy to AWS EC2 (t3.medium) using `infra/ec2-setup.sh`
- [ ] Point domain, run Certbot, enable HTTPS in `infra/nginx.conf`
- [x] Create example env files and document required variables
- [x] Add deployment runbook for EC2, Nginx, Certbot, PM2, env setup, smoke test, and k6
- [ ] Set up production environment variables on the live server
- [ ] Run k6 load test (`load-tests/concurrent-users.js`) against live deployment
- [ ] Validate p95 connection time < 200ms under 50 VUs
- [x] Switch auth tokens from localStorage to httpOnly cookies (security hardening)
- [x] PM2 cluster mode config for multi-core utilization
- [ ] Set up PostgreSQL on RDS (or EC2) with proper credentials

## Phase 5 — Product & Stretch Features ✅ MOSTLY DONE

- [x] Room permissions — invite-only / read-only viewer mode
- [x] Document version history (replay ops from DB)
- [x] Add architecture diagram to README
- [x] Expand architectural write-up (Yjs CRDT, Redis pub/sub, debounced persistence)
- [x] Improve language switching inside an already-open editor
- [x] Add stdin support and richer execution UX
- [x] Add per-room notes doc for shared ideas
- [x] Add demo GIF to README

---

## What’s Done In This Pass

- [x] Build now passes from the repo root
- [x] Client env typing added for Vite
- [x] Auth/session handling cleaned up with shared helpers
- [x] Error boundary added
- [x] Loading/error states improved across the main flows
- [x] Execution flow improved with clearer runtime feedback
- [x] Judge0 execution errors now surface more clearly
- [x] Java `Main` class mismatch fixed for execution
- [x] README and `.env.example` files added
- [x] Legacy OT files and socket events removed; history replay kept as a separate audit/replay helper

## Next Best Tasks

1. Run `infra/ec2-setup.sh` on the target EC2 instance with the real repo URL, domain, and Certbot email
2. Fill production `server/.env` on the live server and restart PM2
3. Run `BASE_URL=https://your-domain k6 run load-tests/concurrent-users.js`

---

## Known Tradeoffs (by design)

| Decision | Tradeoff |
|---|---|
| Yjs CRDT over Socket.IO | Better concurrent merging; custom provider layer is less mature than y-websocket |
| In-memory Yjs room state | Fast collaboration; 2s window of potential data loss on crash |
| httpOnly auth cookies | Better XSS resistance; needs same-origin/proxy-aware API and Socket.IO credentials |
| Debounced DB writes (2s) | Reduces DB load; trades off immediate durability |
