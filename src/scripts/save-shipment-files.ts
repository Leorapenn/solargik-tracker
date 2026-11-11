// Moves the documents of the imported shipments from monday.com into the project's SharePoint folder, and points the shipment's links at
// them. READ-ONLY against monday.com (the client refuses mutations). The files are saved into the project folder that is synced to this
// PC (OneDrive then uploads them to SharePoint):
//   <Projects - EXECUTION>\<project folder>\Procurement + Logistics\Shipments\<shipment name>\<file>
// Nothing is ever overwritten (a name already taken gets " (2)"), and it is safe to re-run: a file already saved is found by its name
// and size, and the link on the shipment is changed only for files that were saved.
//
// Usage (explicit project numbers only):
//   npm run shipments:files -- 360                 dry run: what would be saved, how big, where; writes nothing
//   npm run shipments:files -- 360 --apply         downloads, saves and re-links
//   add --key-only to skip photos and zip files
// Setting: EXECUTION_DIR = the synced "Projects - EXECUTION" folder (default: %USERPROFILE%\OneDrive - Solargik\Projects - EXECUTION).

import { existsSync, mkdirSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { mondayQuery } from "@/monday/client";
import { trackedProjectNumber, type ShipmentFile } from "@/lib/shipmentFromMonday";
import { SHIPMENT_FOLDER, SHIPMENT_SUBFOLDER, assetIdOf, fitName, isSharepointLink, safeName, sharepointLink, uniqueName } from "@/lib/shipmentFiles";
import { filesOf } from "@/server/services/shipments";

try {
  process.loadEnvFile();
} catch {
  // .env is optional if the variables are already set in the environment.
}

type Asset = { id: string; name: string; file_extension: string; file_size: number | null; public_url: string };
const SKIP_WITH_KEY_ONLY = /^\.?(jpe?g|png|gif|heic|webp|zip|rar|7z)$/i;
const mb = (n: number) => `${(n / 1048576).toFixed(1)} MB`;

// A network hiccup (monday.com or the file address) is tried again a few times before the file or shipment is given up and reported.
async function retry<T>(label: string, fn: () => Promise<T>, tries = 4): Promise<T> {
  let last: unknown;
  for (let i = 1; i <= tries; i++) {
    try {
      return await fn();
    } catch (error) {
      last = error;
      await new Promise((r) => setTimeout(r, 1500 * i));
    }
  }
  throw new Error(`${label}: ${last instanceof Error ? last.message : String(last)}`);
}

const EXEC = process.env.EXECUTION_DIR ?? join(process.env.USERPROFILE ?? "", "OneDrive - Solargik", "Projects - EXECUTION");

// The project's folder in the synced library: the one its SharePoint link names, else the only folder that starts with its number.
function projectFolder(project: { name: string; sharepointLink: string | null }): { folder: string | null; why: string } {
  const fromLink = project.sharepointLink ? decodeURIComponent(project.sharepointLink.split("/").filter(Boolean).pop() ?? "") : "";
  if (fromLink && existsSync(join(EXEC, fromLink))) return { folder: fromLink, why: "" };
  const number = trackedProjectNumber(project.name);
  const candidates = readdirSync(EXEC).filter((f) => number !== null && new RegExp(`^0*${number}(?!\\d)`).test(f) && statSync(join(EXEC, f)).isDirectory());
  if (candidates.length === 1) return { folder: candidates[0], why: "" };
  return { folder: null, why: candidates.length === 0 ? "no folder starting with its number" : `several folders (${candidates.join(" / ")})` };
}

async function main() {
  const args = process.argv.slice(2).filter(Boolean);
  const apply = args.includes("--apply");
  const keyOnly = args.includes("--key-only");
  const numbers = [...new Set(args.filter((a) => /^\d{1,4}$/.test(a)).map(Number))].sort((a, b) => a - b);
  if (numbers.length === 0) {
    console.error("Name the project numbers (e.g. 360). It never runs over everything by default.");
    process.exit(1);
  }
  if (!existsSync(EXEC)) throw new Error(`The synced folder was not found: ${EXEC} (set EXECUTION_DIR).`);

  const projects = (await prisma.project.findMany({ select: { id: true, name: true, sharepointLink: true } })).filter((p) => numbers.includes(trackedProjectNumber(p.name) ?? -1));
  let totalFiles = 0;
  let totalBytes = 0;
  let saved = 0;
  const problems: string[] = [];

  for (const project of projects) {
    const { folder, why } = projectFolder(project);
    if (!folder) {
      problems.push(`${project.name}: ${why}: skipped`);
      continue;
    }
    if (!existsSync(join(EXEC, folder, SHIPMENT_FOLDER))) {
      problems.push(`${project.name}: its folder has no "${SHIPMENT_FOLDER}": skipped`);
      continue;
    }
    const shipments = await prisma.shipment.findMany({ where: { projectId: project.id, mondayItemId: { not: null } }, orderBy: { reference: "asc" } });
    console.log(`\n${project.name}  ->  ${folder}`);
    for (const shipment of shipments) {
      const files = filesOf(shipment.files);
      const todo = files.filter((f) => !isSharepointLink(f.url));
      if (todo.length === 0) {
        if (files.length) console.log(`  ${shipment.reference.slice(0, 40).padEnd(40)} ${files.length} file(s) already in SharePoint`);
        continue;
      }
      let data: { items: { assets: Asset[] }[] };
      try {
        data = await retry(`${shipment.reference}`, () => mondayQuery<{ items: { assets: Asset[] }[] }>(`query { items(ids:[${shipment.mondayItemId}]) { assets { id name file_extension file_size public_url } } }`));
      } catch (error) {
        problems.push(`${shipment.reference}: monday.com did not answer (${error instanceof Error ? error.message : error}): left for the next run`);
        continue;
      }
      const assets = new Map((data.items[0]?.assets ?? []).map((a) => [a.id, a]));
      const shipmentFolder = safeName(shipment.reference, "shipment").slice(0, 45).trim();
      const dir = join(EXEC, folder, SHIPMENT_FOLDER, SHIPMENT_SUBFOLDER, shipmentFolder);
      const next: ShipmentFile[] = [];
      let bytes = 0;
      let count = 0;
      for (const f of files) {
        const asset = isSharepointLink(f.url) ? undefined : assets.get(assetIdOf(f.url) ?? "");
        if (isSharepointLink(f.url) || !asset) {
          if (!isSharepointLink(f.url)) problems.push(`${shipment.reference}: ${f.name} is no longer on monday.com: link kept`);
          next.push(f);
          continue;
        }
        if (keyOnly && SKIP_WITH_KEY_ONLY.test(asset.file_extension)) {
          next.push(f);
          continue;
        }
        const size = asset.file_size ?? 0;
        let name = fitName(safeName(asset.name), dir.length);
        // the same name and size already there = this file was saved before; otherwise never overwrite
        if (!(existsSync(join(dir, name)) && statSync(join(dir, name)).size === size && size > 0)) name = uniqueName(name, (n) => existsSync(join(dir, n)));
        count++;
        bytes += size;
        if (apply) {
          const target = join(dir, name);
          if (!existsSync(target)) {
            mkdirSync(dir, { recursive: true });
            let bytesRead: Buffer | null = null;
            try {
              bytesRead = await retry(asset.name, async () => {
                const res = await fetch(asset.public_url);
                if (!res.ok) throw new Error(`status ${res.status}`);
                return Buffer.from(await res.arrayBuffer());
              });
            } catch (error) {
              problems.push(`${shipment.reference}: ${asset.name} could not be downloaded (${error instanceof Error ? error.message : error}): link kept`);
              next.push(f);
              continue;
            }
            const part = `${target}.part`;
            writeFileSync(part, bytesRead);
            renameSync(part, target);
            saved++;
          }
        }
        next.push({ name, url: sharepointLink(folder, shipmentFolder, name), mondayUrl: f.url });
      }
      totalFiles += count;
      totalBytes += bytes;
      console.log(`  ${shipment.reference.slice(0, 40).padEnd(40)} ${String(count).padStart(3)} file(s), ${mb(bytes).padStart(9)}  ->  ...\\${SHIPMENT_FOLDER}\\${SHIPMENT_SUBFOLDER}\\${shipmentFolder}`);
      if (apply && count > 0) await prisma.shipment.update({ where: { id: shipment.id }, data: { files: next as unknown as Prisma.InputJsonValue } });
    }
  }

  console.log(`\nTOTAL: ${totalFiles} file(s), ${mb(totalBytes)}${apply ? `; ${saved} saved to the folder now` : ""}.`);
  for (const p of problems) console.log("  - " + p);
  if (!apply) console.log("\nDRY RUN (nothing downloaded or written): pass --apply to save the files and re-link the shipments.");
  else console.log("\nOneDrive now uploads them to SharePoint; the links work once that has finished.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
