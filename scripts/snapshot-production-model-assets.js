#!/usr/bin/env node

"use strict";

require("dotenv").config();

const fs = require("fs/promises");
const path = require("path");

function required(value, name) {
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function remoteQuery(sql) {
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${required(process.env.CF_ACCOUNT_ID, "CF_ACCOUNT_ID")}` +
    `/d1/database/${required(process.env.D1_DATABASE_ID, "D1_DATABASE_ID")}/query`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${required(process.env.CF_API_TOKEN, "CF_API_TOKEN")}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ sql }),
    signal: AbortSignal.timeout(120000),
  });
  const payload = await response.json();
  if (!response.ok || !payload.success) {
    throw new Error(`D1 query failed: ${JSON.stringify(payload.errors || payload)}`);
  }
  return payload.result[0].results;
}

async function main() {
  const outputArg = process.argv[2];
  if (!outputArg) throw new Error("Usage: snapshot-production-model-assets.js OUTPUT.json");
  const output = path.resolve(outputArg);
  const models = await remoteQuery(
    `SELECT id,name,slug,category,status,image_url,texture_url,file_url,updated_at
       FROM models_3d ORDER BY id`
  );
  const snapshot = {
    source: "Cloudflare D1 production models_3d",
    queriedAt: new Date().toISOString(),
    count: models.length,
    activeCount: models.filter((model) => model.status === "active").length,
    models,
  };
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ output, count: snapshot.count, activeCount: snapshot.activeCount }, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
