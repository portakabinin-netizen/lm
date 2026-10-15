const fs = require('fs');
const path = require('path');

const rootDir = __dirname;

const androidBase = path.join(
  rootDir,
  'android/app/src/main/java/com/hibiz/app'
);

const resLayoutDir = path.join(
  rootDir,
  'android/app/src/main/res/layout'
);

const manifestPath = path.join(
  rootDir,
  'android/app/src/main/AndroidManifest.xml'
);

const mainAppPath = path.join(androidBase, 'MainApplication.kt');

const nativeSource = path.join(rootDir, 'native-files');

console.log("🛠️ Starting Upgraded Native Restoration...");

/* ================= 1. ENSURE DIRECTORIES ================= */

if (!fs.existsSync(androidBase)) {
  fs.mkdirSync(androidBase, { recursive: true });
  console.log("📁 Created java directory");
}

if (!fs.existsSync(resLayoutDir)) {
  fs.mkdirSync(resLayoutDir, { recursive: true });
  console.log("📁 Created res/layout directory");
}

/* ================= 2. SYNC KOTLIN FILES ================= */

const requiredFiles = [
  'CallReceiver.kt',
  'CallTrackerModule.kt',
  'CallTrackerPackage.kt',
  'OverlayModule.kt',
  'OverlayService.kt'
];

requiredFiles.forEach(file => {
  const src = path.join(nativeSource, file);
  const dest = path.join(androidBase, file);

  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`✅ Synced Kotlin: ${file}`);
  } else {
    console.log(`⚠️ Missing source: ${file}`);
  }
});

/* ================= 3. SYNC OVERLAY LAYOUT XML ================= */

const layoutSrc = path.join(nativeSource, 'overlay_layout.xml');
const layoutDest = path.join(resLayoutDir, 'overlay_layout.xml');

if (fs.existsSync(layoutSrc)) {
  fs.copyFileSync(layoutSrc, layoutDest);
  console.log("✅ Synced: overlay_layout.xml → res/layout");
} else {
  console.log("⚠️ overlay_layout.xml not found in native-files");
}


/* ================= 4. RESTORE CORE ANDROID FILES ================= */

const coreFiles = [
  { src: 'AndroidManifest.xml', dest: path.join(rootDir, 'android/app/src/main/AndroidManifest.xml') },
  { src: 'MainActivity.kt', dest: path.join(androidBase, 'MainActivity.kt') },
  { src: 'MainApplication.kt', dest: path.join(androidBase, 'MainApplication.kt') },
];

coreFiles.forEach(file => {
  const srcPath = path.join(nativeSource, file.src);

  if (!fs.existsSync(file.dest) && fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, file.dest);
    console.log(`✅ Restored core file: ${file.src}`);
  }
});


/* ================= 5. PATCH ANDROID MANIFEST ================= */

if (fs.existsSync(manifestPath)) {
  let content = fs.readFileSync(manifestPath, 'utf8');

  const permissions = [
    'android.permission.READ_PHONE_STATE',
    'android.permission.READ_CALL_LOG',
    'android.permission.READ_PHONE_NUMBERS',
    'android.permission.SYSTEM_ALERT_WINDOW',
    'android.permission.FOREGROUND_SERVICE',
    'android.permission.FOREGROUND_SERVICE_LOCATION',
    'android.permission.FOREGROUND_SERVICE_SPECIAL_USE'
  ];

  permissions.forEach(perm => {
    if (!content.includes(`name="${perm}"`)) {
      content = content.replace(
        '<application',
        `<uses-permission android:name="${perm}" />\n    <application`
      );
    }
  });

  // Remove old configs — use specific non-greedy patterns anchored to the element name
  content = content.replace(/<service[^>]*\.OverlayService[^>]*>[\s\S]*?<\/service>/g, '');
  content = content.replace(/<service[^>]*\.OverlayService[^>]*\/>/g, '');
  content = content.replace(/<receiver[^>]*\.CallReceiver[^>]*>[\s\S]*?<\/receiver>/g, '');

  const receiverConfig = `
        <receiver
            android:name=".CallReceiver"
            android:exported="true"
            android:enabled="true"
            android:permission="android.permission.BROADCAST_PHONE_STATE">
            <intent-filter android:priority="999">
                <action android:name="android.intent.action.PHONE_STATE" />
            </intent-filter>
        </receiver>`;

  const serviceConfig = `
        <service
            android:name=".OverlayService"
            android:enabled="true"
            android:exported="false"
            android:foregroundServiceType="specialUse">
            <property
                android:name="android.app.PROPERTY_SPECIAL_USE_CATEGORY"
                android:value="This service identifies incoming leads and displays CRM information via an overlay." />
        </service>`;

  content = content.replace(
    '</application>',
    `${serviceConfig}\n${receiverConfig}\n    </application>`
  );

  fs.writeFileSync(manifestPath, content);
  console.log("✅ Manifest patched.");
}

/* ================= 6. PATCH MAINAPPLICATION.KT ================= */

if (fs.existsSync(mainAppPath)) {
  let content = fs.readFileSync(mainAppPath, 'utf8');

  if (!content.includes('CallTrackerPackage()')) {
    console.log("➕ Adding CallTrackerPackage...");

    const packageListRegex =
      /(override fun getPackages\(\): List<ReactPackage> =[\s\S]*?PackageList\(this\)\.packages)(\.apply \{[\s\S]*?\})?/;

    const commentStr = "// Packages that cannot be autolinked yet can be added manually here, for example:";

    if (packageListRegex.test(content)) {
      if (content.includes('.apply {')) {
        content = content.replace(
          '.apply {',
          '.apply {\n          add(CallTrackerPackage())'
        );
      } else {
        content = content.replace(
          'PackageList(this).packages',
          'PackageList(this).packages.apply {\n          add(CallTrackerPackage())\n        }'
        );
      }

      fs.writeFileSync(mainAppPath, content);
      console.log("✅ MainApplication patched.");
    } else if (content.includes(commentStr)) {
      content = content.replace(
        commentStr,
        `${commentStr}\n          add(CallTrackerPackage())`
      );
      
      fs.writeFileSync(mainAppPath, content);
      console.log("✅ MainApplication patched (new structure).");
    } else {
      console.error("❌ getPackages() pattern not found.");
    }
  } else {
    console.log("ℹ️ CallTrackerPackage already linked.");
  }
} else {
  console.error("❌ MainApplication.kt not found.");
}

console.log("🏁 Native restoration COMPLETE.");
