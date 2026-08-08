import { defineConfig, loadEnv, type PluginOption } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";

export default defineConfig(async ({ mode }) => {
  // In production the platform injects real environment variables; locally we
  // hydrate process.env from .env so SSR code sees the same values.
  Object.assign(process.env, loadEnv(mode, process.cwd(), ""));

  const plugins: PluginOption[] = [
    tailwindcss(),
    tanstackStart({
      // Route TanStack Start's server entry through src/server.ts (SSR error wrapper).
      server: { entry: "server" },
      // Server-only modules must never reach the browser bundle.
      importProtection: {
        behavior: "error",
        client: { files: ["**/backend/**"], specifiers: ["server-only"] },
      },
    }),
    viteReact(),
  ];

  return {
    plugins,
    environments: {
      ssr: {
        build: {
          rollupOptions: {
            output: {
              // Keep the TanStack Start runtime in a single chunk: splitting it
              // puts `createMiddleware` and the server module in two chunks that
              // import each other, and the cycle throws at module-evaluation time.
              advancedChunks: {
                groups: [
                  {
                    name: "tanstack-start-runtime",
                    test: /node_modules[\\/]@tanstack[\\/](react-start|start-client-core|start-server-core)[\\/]/,
                    priority: 100,
                  },
                ],
              },
            },
          },
        },
      },
    },
    resolve: {
      alias: { "@": `${process.cwd()}/src` },
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react-dom/client",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
      ],
    },
    server: {
      host: true,
      port: Number(process.env.PORT ?? 8080),
    },
    preview: {
      host: true,
      port: Number(process.env.PORT ?? 8080),
    },
  };
});
