import "dotenv/config";
import { defineConfig } from "prisma/config";

/** Migrations need session/direct pooler (5432). Runtime uses DATABASE_URL (6543 on Vercel). */
const migrationUrl = process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"];

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: migrationUrl,
  },
});