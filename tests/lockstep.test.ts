import { test, expect } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/** Version surfaces must move in lockstep: VERSION == package.json == the
 *  CLI's --version string == web/site.json implementation_version, and the
 *  CHANGELOG carries a header for the current version. */
test("version surfaces are in lockstep", async () => {
  const root = join(import.meta.dir, "..");
  const versionFile = (await readFile(join(root, "VERSION"), "utf8")).trim();
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  expect(pkg.version).toBe(versionFile);

  const cli = await readFile(join(root, "src", "cli.ts"), "utf8");
  const m = cli.match(/^const VERSION = "(.+)";$/m);
  expect(m?.[1]).toBe(versionFile);

  const site = JSON.parse(await readFile(join(root, "web", "site.json"), "utf8"));
  expect(site.meta.implementation_version).toBe(versionFile);

  const changelog = await readFile(join(root, "CHANGELOG.md"), "utf8");
  expect(changelog).toMatch(new RegExp(`^## \\[${versionFile}\\]`, "m"));
});
