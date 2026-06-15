// Injects the in-app APK self-updater into the freshly-generated Android
// project (the `android/` folder is created in CI by `npx cap add android`,
// not committed, so we patch it each build).
//
// It:
//   1. Stamps versionCode / versionName into app/build.gradle so installed
//      apps can tell when a newer APK exists.
//   2. Adds the REQUEST_INSTALL_PACKAGES permission + a FileProvider for the
//      downloaded APK to AndroidManifest.xml.
//   3. Writes res/xml/apk_paths.xml describing the download location.
//   4. Drops in the ApkUpdaterPlugin (DownloadManager + system installer).
//   5. Registers the plugin in MainActivity.
//
// Env: APK_VERSION_CODE (integer, monotonic), APK_VERSION_NAME (string).

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

const ANDROID = 'android'
const PKG = 'io.github.riporipoteam.ripoai'
const PKG_DIR = join(ANDROID, 'app/src/main/java', ...PKG.split('.'))

const versionCode = parseInt(process.env.APK_VERSION_CODE || '1', 10) || 1
const versionName = process.env.APK_VERSION_NAME || `1.0.${versionCode}`

function patch(file, fn) {
  const src = readFileSync(file, 'utf8')
  const out = fn(src)
  if (out !== src) {
    writeFileSync(file, out)
    console.log(`patched ${file}`)
  } else {
    console.log(`no change ${file}`)
  }
}

// 1. Version stamp -----------------------------------------------------------
patch(join(ANDROID, 'app/build.gradle'), (s) =>
  s
    .replace(/versionCode\s+\d+/, `versionCode ${versionCode}`)
    .replace(/versionName\s+"[^"]*"/, `versionName "${versionName}"`),
)

// 2. Manifest: install permission + FileProvider -----------------------------
patch(join(ANDROID, 'app/src/main/AndroidManifest.xml'), (s) => {
  let out = s
  if (!out.includes('REQUEST_INSTALL_PACKAGES')) {
    out = out.replace(
      /<application/,
      '<uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />\n\n    <application',
    )
  }
  if (!out.includes('.apkprovider')) {
    const provider = `        <provider
            android:name="androidx.core.content.FileProvider"
            android:authorities="\${applicationId}.apkprovider"
            android:exported="false"
            android:grantUriPermissions="true">
            <meta-data
                android:name="android.support.FILE_PROVIDER_PATHS"
                android:resource="@xml/apk_paths" />
        </provider>
    </application>`
    out = out.replace(/\s*<\/application>/, `\n${provider}`)
  }
  return out
})

// 3. apk_paths.xml -----------------------------------------------------------
const xmlDir = join(ANDROID, 'app/src/main/res/xml')
if (!existsSync(xmlDir)) mkdirSync(xmlDir, { recursive: true })
writeFileSync(
  join(xmlDir, 'apk_paths.xml'),
  `<?xml version="1.0" encoding="utf-8"?>
<paths>
    <external-files-path name="apk_update" path="Download" />
</paths>
`,
)
console.log('wrote apk_paths.xml')

// 4. ApkUpdaterPlugin.java ----------------------------------------------------
if (!existsSync(PKG_DIR)) mkdirSync(PKG_DIR, { recursive: true })
writeFileSync(
  join(PKG_DIR, 'ApkUpdaterPlugin.java'),
  `package ${PKG};

import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.database.Cursor;
import android.net.Uri;
import android.os.Environment;

import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;

// Downloads the latest APK and hands it to Android's package installer so the
// app can update itself without going through a store.
@CapacitorPlugin(name = "ApkUpdater")
public class ApkUpdaterPlugin extends Plugin {

    private static final String FILE_NAME = "AskAI-update.apk";
    private long downloadId = -1L;
    private BroadcastReceiver receiver;

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        final String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("Missing url");
            return;
        }
        final Context ctx = getContext();
        try {
            final File outFile = new File(
                ctx.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), FILE_NAME);
            if (outFile.exists()) {
                outFile.delete();
            }

            DownloadManager dm =
                (DownloadManager) ctx.getSystemService(Context.DOWNLOAD_SERVICE);
            DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
            req.setTitle("AskAI update");
            req.setDescription("Downloading the latest AskAI…");
            req.setNotificationVisibility(
                DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            req.setDestinationInExternalFilesDir(
                ctx, Environment.DIRECTORY_DOWNLOADS, FILE_NAME);
            req.setMimeType("application/vnd.android.package-archive");

            receiver = new BroadcastReceiver() {
                @Override
                public void onReceive(Context c, Intent intent) {
                    long id = intent.getLongExtra(
                        DownloadManager.EXTRA_DOWNLOAD_ID, -1L);
                    if (id != downloadId) {
                        return;
                    }
                    try {
                        c.unregisterReceiver(this);
                    } catch (Exception ignored) {
                    }
                    if (isDownloadOk(dm, id)) {
                        install(ctx, outFile);
                    }
                }
            };
            ContextCompat.registerReceiver(
                ctx,
                receiver,
                new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE),
                ContextCompat.RECEIVER_EXPORTED);

            downloadId = dm.enqueue(req);

            JSObject ret = new JSObject();
            ret.put("started", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Update failed: " + e.getMessage());
        }
    }

    private boolean isDownloadOk(DownloadManager dm, long id) {
        Cursor c = null;
        try {
            c = dm.query(new DownloadManager.Query().setFilterById(id));
            if (c != null && c.moveToFirst()) {
                int status = c.getInt(c.getColumnIndex(DownloadManager.COLUMN_STATUS));
                return status == DownloadManager.STATUS_SUCCESSFUL;
            }
        } catch (Exception ignored) {
        } finally {
            if (c != null) {
                c.close();
            }
        }
        return false;
    }

    private void install(Context ctx, File file) {
        try {
            Uri apkUri = FileProvider.getUriForFile(
                ctx, ctx.getPackageName() + ".apkprovider", file);
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION
                | Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(intent);
        } catch (Exception ignored) {
        }
    }
}
`,
)
console.log('wrote ApkUpdaterPlugin.java')

// 5. Register the plugin in MainActivity -------------------------------------
const mainActivity = join(PKG_DIR, 'MainActivity.java')
if (existsSync(mainActivity)) {
  patch(mainActivity, (s) => {
    if (s.includes('ApkUpdaterPlugin.class')) return s
    return `package ${PKG};

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ApkUpdaterPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
`
  })
} else {
  console.warn(`MainActivity not found at ${mainActivity}`)
}
