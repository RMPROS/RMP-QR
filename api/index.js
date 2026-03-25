// Vercel serverless function entry point.
// esbuild compiles server/index.ts → dist/server.js during `pnpm build`.
// Vercel's @vercel/node runtime picks up the default export as the request handler.
export { default } from "../dist/server.js";
