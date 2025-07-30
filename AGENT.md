# Agent Guidelines for Fire-Riser Live Editor

## Commands
- **Dev**: `pnpm dev` (starts Vite dev server on http://localhost:5173)
- **Build**: `pnpm build` (compiles TypeScript and builds for production)
- **Lint**: `pnpm lint` (runs ESLint on all files)
- **Preview**: `pnpm preview` (preview production build)
- **Test**: No test framework configured - use manual testing via dev server

## Architecture
- **React 18 + Vite** single-page application for fire alarm riser diagram editor
- **Core component**: `src/App.tsx` - main live editor with Monaco Editor (left) and SVG viewer (right)
- **Layout engine**: `src/layout/elkLayout.ts` uses ELK.js for automatic orthogonal circuit bus routing
- **Symbols**: All fire alarm symbols defined in `SYMBOLS` object in `App.tsx`
- **Data format**: JSON spec with devices, circuits, EOLs, and panel position
- **Export**: SVG output for AutoCAD/PDF workflows

## Code Style
- **TypeScript** with strict config, React functional components with hooks
- **ESLint** with TypeScript, React Hooks, and React Refresh plugins
- **Tailwind CSS** for styling - use utility classes, avoid custom CSS
- **Naming**: interfaces PascalCase, functions camelCase, components PascalCase
- **Imports**: ES modules, no relative imports beyond one level
- **Error handling**: Graceful JSON parsing with fallbacks, no console.error in production
