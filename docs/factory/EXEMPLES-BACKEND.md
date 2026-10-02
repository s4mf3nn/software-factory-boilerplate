# Exemples de feature par backend

Exemples **illustratifs**, vérifiés avec `pnpm verify` dans une copie du boilerplate. Ils ne sont pas des presets : le framework est une décision de l'ADR-0001, et le découpage interne d'une feature y est fixé. Vérifie les API dans la documentation (`docs/factory/CONTEXT7.md`) avant de les reprendre.

Principe commun : chaque feature exporte `feature` depuis `src/features/<nom>/index.ts`, `pnpm gen` écrit `src/features.gen.ts`, et `src/app.ts` monte la liste sans qu'aucun registre soit édité à la main. Le test s'exécute en mémoire, sans processus externe.

## Hono

```ts
// src/features/health/index.ts
import { Hono } from "hono";

export const routes = new Hono().get("/health", (c) => c.json({ status: "ok" }));
export const feature = { name: "health", routes };
```

```ts
// src/app.ts
import { Hono } from "hono";
import { features } from "./features.gen";

export const app = new Hono();
for (const f of features) app.route("/", f.routes);
```

```ts
// src/features/health/health.test.ts : pas de port, `app.request()` appelle le handler directement
import { expect, it } from "vitest";
import { app } from "../../app";

it("answers health", async () => {
  const res = await app.request("/health");
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ status: "ok" });
});
```

## Express

Dépendances : `express`, et `@types/express` en développement.

```ts
// src/features/health/index.ts
import { Router } from "express";

const router = Router();
router.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});
export const feature = { name: "health", router };
```

```ts
// src/app.ts
import express from "express";
import { features } from "./features.gen";

export const app = express();
for (const f of features) app.use(f.router);
```

```ts
// src/features/health/health.test.ts : port éphémère (0) pour éviter les collisions entre workspaces
import type { AddressInfo } from "node:net";
import { expect, it } from "vitest";
import { app } from "../../app";

it("answers health", async () => {
  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    expect(await res.json()).toEqual({ status: "ok" });
  } finally {
    server.close();
  }
});
```

Le point d'entrée qui écoute sur `$PORT` (`src/server.ts`) n'est chargé par aucun test : ajoute-le à `coverage.exclude` dans `vitest.config.ts`.

## Supabase (supabase-js)

Dépendance : `@supabase/supabase-js`. Le client reçoit un `fetch` injectable : le test n'a besoin d'aucune instance Supabase.

```ts
// src/features/todos/index.ts
import { createClient } from "@supabase/supabase-js";

export function createTodosService(url: string, key: string, fetchImpl: typeof fetch = fetch) {
  const client = createClient(url, key, { global: { fetch: fetchImpl } });
  return {
    async list() {
      const { data, error } = await client.from("todos").select("*");
      if (error) throw error;
      return data;
    },
  };
}
export const feature = { name: "todos", createTodosService };
```

```ts
// src/features/todos/todos.test.ts : un cas nominal et un cas d'erreur (seuil de branches à 80 %)
import { expect, it } from "vitest";
import { createTodosService } from "./index";

const json = (body: unknown, status = 200) =>
  (async () =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })) as typeof fetch;

it("lists todos through supabase-js", async () => {
  const service = createTodosService("http://localhost:54321", "anon", json([{ id: 1 }]));
  expect(await service.list()).toEqual([{ id: 1 }]);
});

it("throws on supabase error", async () => {
  const service = createTodosService("http://localhost:54321", "anon", json({ message: "boom" }, 500));
  await expect(service.list()).rejects.toBeTruthy();
});
```

Dans un vrai projet, `throw error` se remplace par une erreur métier typée (`src/shared/errors.ts`), et l'erreur Supabase ne sort jamais telle quelle d'un point d'entrée.

## Ce que les exemples ne couvrent pas

- `pnpm dev` et le point d'entrée : à définir par SPEC-0000.
- Instance Supabase locale par workspace : `scripts/workspace-data.sh` (voir le README, « Ressource de données par workspace »).
- Runtime non Node (Edge Functions Supabase en Deno, Cloudflare Workers) : `tsconfig.json` ne charge que les types Node. Adapte `types` et exclus le code Deno de `tsc` et de Biome, par ADR.
