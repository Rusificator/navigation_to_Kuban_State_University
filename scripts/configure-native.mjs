/** Idempotent platform configuration; run after cap sync. No signing or secrets. */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as plist from "plist";
import xcode from "xcode";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = (...parts) => path.join(root, ...parts);
const write = async (relative, text) => {
  await mkdir(path.dirname(file(relative)), { recursive: true });
  await writeFile(file(relative), text);
};
let manifest = await readFile(
  file("android/app/src/main/AndroidManifest.xml"),
  "utf8",
);
for (const permission of ["ACCESS_COARSE_LOCATION", "ACCESS_FINE_LOCATION"]) {
  if (!manifest.includes(`android.permission.${permission}`))
    manifest = manifest.replace(
      "</manifest>",
      `    <uses-permission android:name="android.permission.${permission}" />\n</manifest>`,
    );
}
if (!manifest.includes("android.hardware.location.gps"))
  manifest = manifest.replace(
    "</manifest>",
    '    <uses-feature android:name="android.hardware.location.gps" android:required="false" />\n</manifest>',
  );
if (!manifest.includes('android:scheme="kubsu-next"')) {
  manifest = manifest.replace(
    "</activity>",
    `<intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="kubsu-next" android:host="place" />
            </intent-filter>
        </activity>`,
  );
}
await write("android/app/src/main/AndroidManifest.xml", manifest);
for (const [locale, appName] of [
  ["", "КубГУ Навигатор"],
  ["-en", "KubSU Navigator"],
]) {
  await write(
    `android/app/src/main/res/values${locale}/strings.xml`,
    `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">${appName}</string>
    <string name="title_activity_main">${appName}</string>
    <string name="package_name">org.kubsu.navigator.next</string>
    <string name="custom_url_scheme">kubsu-next</string>
</resources>\n`,
  );
}
const gradle = await readFile(file("android/app/build.gradle"), "utf8");
await write(
  "android/app/build.gradle",
  gradle
    .replace(/versionName "[^"]+"/, 'versionName "0.2.0"')
    .replace(/versionCode \d+/, "versionCode 2"),
);
const infoFile = "ios/App/App/Info.plist";
const info = plist.parse(await readFile(file(infoFile), "utf8"));
const locationText = {
  ru: "Показывать ваше положение на карте территории КубГУ. Координаты остаются на устройстве; в фоне слежение не работает.",
  en: "Show your position on the KubSU campus map. Coordinates stay on your device; tracking stops in the background.",
};
info.NSLocationWhenInUseUsageDescription = locationText.en;
// Required by the Capacitor geolocation plugin; the app requests foreground use only.
info.NSLocationAlwaysAndWhenInUseUsageDescription = locationText.en;
info.CFBundleLocalizations = ["ru", "en"];
info.CFBundleURLTypes = [
  {
    CFBundleURLName: "org.kubsu.navigator.next.place",
    CFBundleURLSchemes: ["kubsu-next"],
  },
];
await write(infoFile, plist.build(info));
for (const locale of ["ru", "en"]) {
  await write(
    `ios/App/App/${locale}.lproj/InfoPlist.strings`,
    `"CFBundleDisplayName" = "${locale === "ru" ? "КубГУ Навигатор" : "KubSU Navigator"}";
"NSLocationWhenInUseUsageDescription" = "${locationText[locale]}";
"NSLocationAlwaysAndWhenInUseUsageDescription" = "${locationText[locale]}";\n`,
  );
}
await write(
  "ios/App/App/PrivacyInfo.xcprivacy",
  plist.build({
    NSPrivacyTracking: false,
    NSPrivacyTrackingDomains: [],
    NSPrivacyCollectedDataTypes: [],
    NSPrivacyAccessedAPITypes: [
      {
        NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryUserDefaults",
        NSPrivacyAccessedAPITypeReasons: ["CA92.1"],
      },
    ],
  }),
);
const projectPath = file("ios/App/App.xcodeproj/project.pbxproj");
const project = xcode.project(projectPath);
project.parseSync();
const group = project.findPBXGroupKey({ path: "App" });
if (!group) throw Error("iOS App group missing; inspect the Xcode template");
function addResource(name, type) {
  const objects = project.hash.project.objects;
  const references = objects.PBXFileReference;
  if (
    Object.values(references).some(
      (v) =>
        typeof v === "object" && String(v.path).replaceAll('"', "") === name,
    )
  )
    return;
  const referenceId = project.generateUuid(),
    buildId = project.generateUuid();
  references[referenceId] = {
    isa: "PBXFileReference",
    lastKnownFileType: type,
    path: `"${name}"`,
    sourceTree: '"<group>"',
  };
  references[`${referenceId}_comment`] = name;
  objects.PBXBuildFile[buildId] = {
    isa: "PBXBuildFile",
    fileRef: referenceId,
    fileRef_comment: name,
  };
  objects.PBXBuildFile[`${buildId}_comment`] = `${name} in Resources`;
  objects.PBXGroup[group].children.push({ value: referenceId, comment: name });
  const resources = Object.values(objects.PBXResourcesBuildPhase).find(
    (v) => typeof v === "object" && v.isa === "PBXResourcesBuildPhase",
  );
  if (!resources) throw Error("iOS resource build phase missing");
  resources.files.push({ value: buildId, comment: `${name} in Resources` });
}
addResource("PrivacyInfo.xcprivacy", "text.xml");
for (const locale of ["ru", "en"]) {
  addResource(`${locale}.lproj`, "folder");
  project.addKnownRegion(locale);
}
project.updateBuildProperty("MARKETING_VERSION", "0.2.0");
project.updateBuildProperty("CURRENT_PROJECT_VERSION", "2");
project.updateBuildProperty("IPHONEOS_DEPLOYMENT_TARGET", "16.0");
await writeFile(projectPath, project.writeSync());
console.log(
  "Configured foreground location, deep links, localized names and privacy resources.",
);
