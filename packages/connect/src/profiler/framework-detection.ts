/**
 * Framework and tech stack detection from marker files and dependency manifests.
 */

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type { TechStack } from "./types.js";

interface MarkerRule {
  name: string;
  files?: string[];
  deps?: string[];
  devDeps?: string[];
}

const FRAMEWORK_RULES: MarkerRule[] = [
  // JS/TS frameworks
  { name: "next.js", files: ["next.config.js", "next.config.mjs", "next.config.ts"], deps: ["next"] },
  { name: "react", deps: ["react"] },
  { name: "vue", deps: ["vue"], files: ["vue.config.js"] },
  { name: "nuxt", deps: ["nuxt"], files: ["nuxt.config.ts", "nuxt.config.js"] },
  { name: "angular", deps: ["@angular/core"], files: ["angular.json"] },
  { name: "svelte", deps: ["svelte"], files: ["svelte.config.js"] },
  { name: "sveltekit", deps: ["@sveltejs/kit"] },
  { name: "solid", deps: ["solid-js"] },
  { name: "astro", deps: ["astro"], files: ["astro.config.mjs", "astro.config.ts"] },
  { name: "remix", deps: ["@remix-run/react", "@remix-run/node"] },
  { name: "gatsby", deps: ["gatsby"] },
  { name: "express", deps: ["express"] },
  { name: "fastify", deps: ["fastify"] },
  { name: "hono", deps: ["hono"] },
  { name: "koa", deps: ["koa"] },
  { name: "nest.js", deps: ["@nestjs/core"] },
  { name: "electron", deps: ["electron"] },
  { name: "tailwind", deps: ["tailwindcss"], files: ["tailwind.config.js", "tailwind.config.ts", "tailwind.config.cjs", "tailwind.config.mjs"] },
  { name: "shadcn/ui", files: ["components.json"] },

  // Python frameworks
  { name: "django", deps: ["django"], files: ["manage.py"] },
  { name: "flask", deps: ["flask"] },
  { name: "fastapi", deps: ["fastapi"] },
  { name: "pytorch", deps: ["torch"] },
  { name: "tensorflow", deps: ["tensorflow"] },
  { name: "langchain", deps: ["langchain"] },
  { name: "streamlit", deps: ["streamlit"] },

  // Rust frameworks
  { name: "actix-web", deps: ["actix-web"] },
  { name: "tokio", deps: ["tokio"] },
  { name: "rocket", deps: ["rocket"] },
  { name: "axum", deps: ["axum"] },
  { name: "bevy", deps: ["bevy"] },

  // Go frameworks
  { name: "gin", deps: ["github.com/gin-gonic/gin"] },
  { name: "echo", deps: ["github.com/labstack/echo"] },
  { name: "fiber", deps: ["github.com/gofiber/fiber"] },
  { name: "cobra", deps: ["github.com/spf13/cobra"] },
];

const BUILD_TOOL_RULES: MarkerRule[] = [
  { name: "turbo", files: ["turbo.json"], deps: ["turbo"] },
  { name: "vite", files: ["vite.config.ts", "vite.config.js", "vite.config.mjs"], deps: ["vite"] },
  { name: "webpack", files: ["webpack.config.js", "webpack.config.ts"], deps: ["webpack"] },
  { name: "esbuild", deps: ["esbuild"] },
  { name: "rollup", files: ["rollup.config.js", "rollup.config.mjs"], deps: ["rollup"] },
  { name: "tsup", deps: ["tsup"] },
  { name: "swc", deps: ["@swc/core"] },
  { name: "babel", files: [".babelrc", "babel.config.js", "babel.config.json"], deps: ["@babel/core"] },
  { name: "nx", files: ["nx.json"], deps: ["nx"] },
  { name: "gradle", files: ["build.gradle", "build.gradle.kts"] },
  { name: "maven", files: ["pom.xml"] },
  { name: "cmake", files: ["CMakeLists.txt"] },
  { name: "make", files: ["Makefile"] },
];

const TESTING_RULES: MarkerRule[] = [
  { name: "vitest", files: ["vitest.config.ts", "vitest.config.js", "vitest.config.mjs"], deps: ["vitest"] },
  { name: "jest", files: ["jest.config.js", "jest.config.ts", "jest.config.json"], deps: ["jest"] },
  { name: "mocha", deps: ["mocha"] },
  { name: "playwright", deps: ["@playwright/test", "playwright"] },
  { name: "cypress", files: ["cypress.config.js", "cypress.config.ts"], deps: ["cypress"] },
  { name: "pytest", deps: ["pytest"], files: ["pytest.ini", "pyproject.toml"] },
  { name: "go-test", files: ["*_test.go"] },
  { name: "cargo-test", files: ["Cargo.toml"] },
  { name: "rspec", deps: ["rspec"] },
  { name: "junit", deps: ["junit"] },
];

const DATABASE_DEPS: Record<string, string> = {
  "@libsql/client": "turso/libsql",
  "libsql": "turso/libsql",
  "pg": "postgres",
  "postgres": "postgres",
  "@prisma/client": "prisma",
  "prisma": "prisma",
  "drizzle-orm": "drizzle",
  "mongoose": "mongodb",
  "mongodb": "mongodb",
  "mysql2": "mysql",
  "better-sqlite3": "sqlite",
  "sqlite3": "sqlite",
  "redis": "redis",
  "ioredis": "redis",
  "@supabase/supabase-js": "supabase",
  "firebase": "firebase",
  "typeorm": "typeorm",
  "sequelize": "sequelize",
  "sqlalchemy": "postgres",
  "psycopg2": "postgres",
  "pymongo": "mongodb",
  "diesel": "postgres",
  "sqlx": "postgres",
  "sea-orm": "postgres",
};

const DEPLOYMENT_RULES: MarkerRule[] = [
  { name: "vercel", files: ["vercel.json", ".vercel"] },
  { name: "docker", files: ["Dockerfile", "docker-compose.yml", "docker-compose.yaml", ".dockerignore"] },
  { name: "railway", files: ["railway.json", "railway.toml"] },
  { name: "fly.io", files: ["fly.toml"] },
  { name: "netlify", files: ["netlify.toml"] },
  { name: "cloudflare", files: ["wrangler.toml", "wrangler.json"] },
  { name: "aws", files: ["serverless.yml", "serverless.yaml", "cdk.json", "sam.json", "template.yaml"] },
  { name: "gcp", files: ["app.yaml", "cloudbuild.yaml"] },
  { name: "kubernetes", files: ["k8s/", "kubernetes/", "kustomization.yaml"] },
  { name: "github-actions", files: [".github/workflows"] },
  { name: "terraform", files: ["main.tf", "terraform.tf"] },
  { name: "heroku", files: ["Procfile"] },
];

export async function detectTechStack(workspaceRoot: string): Promise<TechStack> {
  const allDeps = await gatherAllDependencies(workspaceRoot);
  const frameworks: string[] = [];
  const buildTools: string[] = [];
  const testing: string[] = [];
  const database: string[] = [];
  const deployment: string[] = [];

  // Detect frameworks
  for (const rule of FRAMEWORK_RULES) {
    if (matchesRule(workspaceRoot, rule, allDeps)) {
      frameworks.push(rule.name);
    }
  }

  // Detect build tools
  for (const rule of BUILD_TOOL_RULES) {
    if (matchesRule(workspaceRoot, rule, allDeps)) {
      buildTools.push(rule.name);
    }
  }

  // Detect testing
  for (const rule of TESTING_RULES) {
    if (rule.name === "go-test" || rule.name === "cargo-test") {
      // Special handling: check file existence
      if (rule.name === "cargo-test" && existsSync(path.join(workspaceRoot, "Cargo.toml"))) {
        testing.push("cargo test");
      }
      continue;
    }
    if (matchesRule(workspaceRoot, rule, allDeps)) {
      testing.push(rule.name);
    }
  }

  // Detect databases
  for (const [dep, db] of Object.entries(DATABASE_DEPS)) {
    if (allDeps.has(dep) && !database.includes(db)) {
      database.push(db);
    }
  }

  // Detect deployment
  for (const rule of DEPLOYMENT_RULES) {
    if (matchesRule(workspaceRoot, rule, allDeps)) {
      deployment.push(rule.name);
    }
  }

  // Detect package manager
  const packageManager = detectPackageManager(workspaceRoot);

  // Detect runtime
  const runtime = await detectRuntime(workspaceRoot);

  return {
    languages: [], // Filled in by scanner
    frameworks,
    runtime,
    packageManager,
    buildTools,
    testing,
    database,
    deployment,
  };
}

function matchesRule(
  workspaceRoot: string,
  rule: MarkerRule,
  allDeps: Set<string>,
): boolean {
  // Check deps first (cheaper)
  if (rule.deps) {
    for (const dep of rule.deps) {
      if (allDeps.has(dep)) return true;
    }
  }
  if (rule.devDeps) {
    for (const dep of rule.devDeps) {
      if (allDeps.has(dep)) return true;
    }
  }

  // Check marker files
  if (rule.files) {
    for (const file of rule.files) {
      if (file.includes("*")) continue; // Skip glob patterns
      if (existsSync(path.join(workspaceRoot, file))) return true;
    }
  }

  return false;
}

async function gatherAllDependencies(workspaceRoot: string): Promise<Set<string>> {
  const deps = new Set<string>();

  // package.json (JS/TS)
  await parsePackageJsonDeps(path.join(workspaceRoot, "package.json"), deps);

  // Also check workspace package.json files
  for (const dir of ["packages", "apps"]) {
    const dirPath = path.join(workspaceRoot, dir);
    if (existsSync(dirPath)) {
      try {
        const { readdir } = await import("node:fs/promises");
        const entries = await readdir(dirPath, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            await parsePackageJsonDeps(path.join(dirPath, entry.name, "package.json"), deps);
          }
        }
      } catch {
        // Skip
      }
    }
  }

  // requirements.txt (Python)
  await parsePythonDeps(path.join(workspaceRoot, "requirements.txt"), deps);
  await parsePyprojectDeps(path.join(workspaceRoot, "pyproject.toml"), deps);

  // Cargo.toml (Rust)
  await parseCargoDeps(path.join(workspaceRoot, "Cargo.toml"), deps);

  // go.mod (Go)
  await parseGoModDeps(path.join(workspaceRoot, "go.mod"), deps);

  // Gemfile (Ruby)
  await parseGemfileDeps(path.join(workspaceRoot, "Gemfile"), deps);

  return deps;
}

async function parsePackageJsonDeps(filePath: string, deps: Set<string>): Promise<void> {
  if (!existsSync(filePath)) return;
  try {
    const content = await readFile(filePath, "utf-8");
    const pkg = JSON.parse(content);
    for (const key of ["dependencies", "devDependencies", "peerDependencies"]) {
      if (pkg[key] && typeof pkg[key] === "object") {
        for (const dep of Object.keys(pkg[key])) {
          deps.add(dep);
        }
      }
    }
  } catch {
    // Skip malformed package.json
  }
}

async function parsePythonDeps(filePath: string, deps: Set<string>): Promise<void> {
  if (!existsSync(filePath)) return;
  try {
    const content = await readFile(filePath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("-")) continue;
      const name = trimmed.split(/[>=<!\[;]/)[0]?.trim();
      if (name) deps.add(name.toLowerCase());
    }
  } catch {
    // Skip
  }
}

async function parsePyprojectDeps(filePath: string, deps: Set<string>): Promise<void> {
  if (!existsSync(filePath)) return;
  try {
    const content = await readFile(filePath, "utf-8");
    // Simple TOML parsing for dependencies
    const depSection = content.match(/\[(?:project\.)?dependencies\]([\s\S]*?)(?:\[|$)/);
    if (depSection) {
      for (const line of depSection[1].split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        // Handle both "name = ..." and "name" formats
        const name = trimmed.split(/[=,\[]/)[0]?.trim().replace(/^["']|["']$/g, "");
        if (name && name.length > 0 && !name.includes(" ")) {
          deps.add(name.toLowerCase());
        }
      }
    }
  } catch {
    // Skip
  }
}

async function parseCargoDeps(filePath: string, deps: Set<string>): Promise<void> {
  if (!existsSync(filePath)) return;
  try {
    const content = await readFile(filePath, "utf-8");
    const sections = content.match(/\[(?:dev-)?dependencies\]([\s\S]*?)(?:\[|$)/g);
    if (sections) {
      for (const section of sections) {
        for (const line of section.split("\n")) {
          const match = line.match(/^(\w[\w-]*)\s*=/);
          if (match) deps.add(match[1]);
        }
      }
    }
  } catch {
    // Skip
  }
}

async function parseGoModDeps(filePath: string, deps: Set<string>): Promise<void> {
  if (!existsSync(filePath)) return;
  try {
    const content = await readFile(filePath, "utf-8");
    const requireBlock = content.match(/require\s*\(([\s\S]*?)\)/);
    if (requireBlock) {
      for (const line of requireBlock[1].split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("//")) continue;
        const parts = trimmed.split(/\s+/);
        if (parts[0]) deps.add(parts[0]);
      }
    }
    // Single require lines
    const singleRequires = content.matchAll(/^require\s+(\S+)/gm);
    for (const match of singleRequires) {
      if (match[1]) deps.add(match[1]);
    }
  } catch {
    // Skip
  }
}

async function parseGemfileDeps(filePath: string, deps: Set<string>): Promise<void> {
  if (!existsSync(filePath)) return;
  try {
    const content = await readFile(filePath, "utf-8");
    for (const line of content.split("\n")) {
      const match = line.match(/gem\s+['"](\w[\w-]*)['"]/);
      if (match) deps.add(match[1]);
    }
  } catch {
    // Skip
  }
}

function detectPackageManager(workspaceRoot: string): string {
  if (existsSync(path.join(workspaceRoot, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(path.join(workspaceRoot, "bun.lockb")) || existsSync(path.join(workspaceRoot, "bun.lock"))) return "bun";
  if (existsSync(path.join(workspaceRoot, "yarn.lock"))) return "yarn";
  if (existsSync(path.join(workspaceRoot, "package-lock.json"))) return "npm";
  if (existsSync(path.join(workspaceRoot, "Cargo.toml"))) return "cargo";
  if (existsSync(path.join(workspaceRoot, "go.mod"))) return "go";
  if (existsSync(path.join(workspaceRoot, "Pipfile"))) return "pipenv";
  if (existsSync(path.join(workspaceRoot, "poetry.lock"))) return "poetry";
  if (existsSync(path.join(workspaceRoot, "requirements.txt"))) return "pip";
  if (existsSync(path.join(workspaceRoot, "Gemfile"))) return "bundler";
  if (existsSync(path.join(workspaceRoot, "deno.json")) || existsSync(path.join(workspaceRoot, "deno.lock"))) return "deno";
  return "unknown";
}

async function detectRuntime(workspaceRoot: string): Promise<string> {
  // Check .node-version, .nvmrc
  for (const file of [".node-version", ".nvmrc"]) {
    const filePath = path.join(workspaceRoot, file);
    if (existsSync(filePath)) {
      try {
        const version = (await readFile(filePath, "utf-8")).trim();
        return `node ${version}`;
      } catch {
        // Skip
      }
    }
  }

  // Check package.json engines
  const pkgPath = path.join(workspaceRoot, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(await readFile(pkgPath, "utf-8"));
      if (pkg.engines?.node) return `node ${pkg.engines.node}`;
    } catch {
      // Skip
    }
  }

  // Check runtime.txt (Python on Heroku etc.)
  const runtimeTxt = path.join(workspaceRoot, "runtime.txt");
  if (existsSync(runtimeTxt)) {
    try {
      return (await readFile(runtimeTxt, "utf-8")).trim();
    } catch {
      // Skip
    }
  }

  // Check go.mod for Go version
  const goMod = path.join(workspaceRoot, "go.mod");
  if (existsSync(goMod)) {
    try {
      const content = await readFile(goMod, "utf-8");
      const match = content.match(/^go\s+([\d.]+)/m);
      if (match) return `go ${match[1]}`;
    } catch {
      // Skip
    }
  }

  // Check Cargo.toml for Rust edition
  const cargoToml = path.join(workspaceRoot, "Cargo.toml");
  if (existsSync(cargoToml)) {
    try {
      const content = await readFile(cargoToml, "utf-8");
      const match = content.match(/edition\s*=\s*"(\d+)"/);
      if (match) return `rust edition ${match[1]}`;
    } catch {
      // Skip
    }
  }

  // Infer from package manager
  if (existsSync(pkgPath)) return "node";
  if (existsSync(path.join(workspaceRoot, "requirements.txt")) || existsSync(path.join(workspaceRoot, "pyproject.toml"))) return "python";
  if (existsSync(goMod)) return "go";
  if (existsSync(cargoToml)) return "rust";

  return "unknown";
}
