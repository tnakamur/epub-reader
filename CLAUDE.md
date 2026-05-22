# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common development commands

- Start the development stack: `docker compose up`
- Start in detached mode: `docker compose up -d`
- View logs: `docker compose logs -f`
- View logs for a specific service: `docker compose logs -f api`
- Rebuild and restart: `docker compose up --build`
- Stop the stack: `docker compose down`
- Access API container shell: `docker compose exec api sh`
- Access web container shell: `docker compose exec web sh`
- Access database container: `docker compose exec db psql -U ${POSTGRES_USER} -d ${POSTGRES_DB}`

## High-level architecture

The EPUB reader application consists of three main components:

1. **Frontend (client/)**: Static HTML/CSS/JavaScript served via Nginx
   - Reader interface built with foliate-js for EPUB rendering
   - Features: page turning, highlights, notes, themes, TOC, progress tracking
   - Communicates with backend via REST API

2. **Backend API (server/)**: Node.js/Express server
   - REST endpoints for authentication, books, highlights, progress
   - JWT-based authentication
   - EPUB file storage and serving
   - PostgreSQL database for persistence

3. **Database (db/)**: PostgreSQL
   - Stores user data, book metadata, highlights, reading progress
   - Schema defined in `db/migrations/`

4. **Reverse Proxy (Caddy)**: Handles SSL termination and routing
   - Routes requests to appropriate services based on subdomain
   - Provides security headers including CSP
   - Configured via `Caddyfile`

EPUB rendering is handled by foliate-js (client-side), which provides standards-compliant EPUB 3 support including automatic detection of writing-mode for vertical text layout.

## Key directories

- `client/`: Frontend code (HTML, CSS, JavaScript)
- `server/`: Backend API code
- `db/`: Database migration scripts
- `nginx/`: Nginx configuration for frontend serving

## Development workflow

1. Make changes to frontend code in `client/`
2. Make changes to backend code in `server/`
3. Run database migrations if needed (in `db/migrations/`)
4. Test changes by restarting affected services with `docker compose up --build`
5. Verify functionality in browser at `http://localhost:<port>` or via configured subdomains

## Testing

- Manual testing via browser interface
- API testing with curl or similar tools
- Database inspection via `docker compose exec db psql`