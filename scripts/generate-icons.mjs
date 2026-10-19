import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const asset = await readFile(path.join(root, "assets/icon.svg"));
const res = path.join(root, "android/app/src/main/res");
for (const [density, size] of Object.entries({
  mdpi: 48,
  hdpi: 72,
  xhdpi: 96,
  xxhdpi: 144,
  xxxhdpi: 192,
})) {
  const folder = path.join(res, `mipmap-${density}`);
  await mkdir(folder, { recursive: true });
  for (const name of ["ic_launcher", "ic_launcher_round"])
    await sharp(asset)
      .resize(size, size)
      .png()
      .toFile(path.join(folder, `${name}.png`));
  // Adaptive icons use the safe centre area; the OS applies the final mask.
  const foregroundSize = Math.round(size * 2.25);
  const centreSize = Math.round(foregroundSize * 0.6);
  const mark = await sharp(asset)
    .resize(centreSize, centreSize)
    .png()
    .toBuffer();
  await sharp({
    create: {
      width: foregroundSize,
      height: foregroundSize,
      channels: 4,
      background: "#147d65",
    },
  })
    .composite([{ input: mark, gravity: "centre" }])
    .png()
    .toFile(path.join(folder, "ic_launcher_foreground.png"));
}
await writeFile(
  path.join(res, "values/ic_launcher_background.xml"),
  '<resources><color name="ic_launcher_background">#147d65</color></resources>',
);
// Replace all generated splash images with the same owned mark and background.
for (const folder of await readdir(res)) {
  if (!folder.startsWith("drawable")) continue;
  const files = await readdir(path.join(res, folder));
  if (!files.includes("splash.png")) continue;
  const mark = await sharp(asset).resize(180, 180).png().toBuffer();
  await sharp({
    create: { width: 960, height: 960, channels: 4, background: "#f4f7f4" },
  })
    .composite([{ input: mark, gravity: "centre" }])
    .png()
    .toFile(path.join(res, folder, "splash.png"));
}
const iosAssets = path.join(root, "ios/App/App/Assets.xcassets");
await sharp(asset)
  .resize(1024, 1024)
  .removeAlpha()
  .png()
  .toFile(path.join(iosAssets, "AppIcon.appiconset/AppIcon-512@2x.png"));
const mark = await sharp(asset).resize(330, 330).png().toBuffer();
for (const name of [
  "splash-2732x2732.png",
  "splash-2732x2732-1.png",
  "splash-2732x2732-2.png",
])
  await sharp({
    create: { width: 2732, height: 2732, channels: 4, background: "#f4f7f4" },
  })
    .composite([{ input: mark, gravity: "centre" }])
    .png()
    .toFile(path.join(iosAssets, "Splash.imageset", name));
await mkdir(path.join(root, "public"), { recursive: true });
await sharp(asset)
  .resize(192, 192)
  .png()
  .toFile(path.join(root, "public/icon.png"));
console.log("Generated Android, iOS and web app icons.");
