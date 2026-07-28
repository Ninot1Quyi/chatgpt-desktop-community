package moe.shizuku.manager;

import android.app.Activity;
import android.content.Intent;
import android.content.res.Configuration;
import android.net.Uri;
import android.os.Build;
import android.util.Base64;
import android.util.Log;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.File;
import java.io.FileOutputStream;
import java.io.FileReader;
import java.io.FileWriter;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.atomic.AtomicLong;

import rikka.shizuku.Shizuku;

final class CodexBridge {

    private static final String TAG = "CodexBridge";
    private static final String INITIALIZE_ID = "__android_initialize__";
    private static final int MAX_DATA_URL_BYTES = 20 * 1024 * 1024;

    private final Activity activity;
    private final File home;
    private final File codexHome;
    private final File workspace;
    private final File globalState;
    private final AtomicLong nextRpcId = new AtomicLong();
    private final Map<String, String> rpcToJs = new ConcurrentHashMap<>();
    private final ConcurrentLinkedQueue<String> queuedMessages = new ConcurrentLinkedQueue<>();

    private volatile WebView webView;
    private volatile Process process;
    private volatile BufferedWriter processInput;
    private volatile String status = "stopped";
    private volatile String lastError;
    private volatile String serverCodexHome;
    private volatile int generation;

    CodexBridge(Activity activity) {
        this.activity = activity;
        home = activity.getFilesDir();
        codexHome = new File(home, ".codex");
        workspace = new File(home, "workspace");
        globalState = new File(codexHome, ".codex-global-state.json");
    }

    void onPageReady(WebView view) {
        webView = view;
        String message;
        while ((message = queuedMessages.poll()) != null) dispatchJavascript(message);
        emit("status", statusJson());
    }

    synchronized void start() {
        if (process != null) return;
        int run = ++generation;
        status = "starting";
        lastError = null;
        emit("status", statusJson());
        try {
            prepareRuntime();
            File binary = new File(activity.getApplicationInfo().nativeLibraryDir,
                    "libcodex_app_server.so");
            if (!binary.canExecute()) {
                throw new IllegalStateException("Codex runtime is not executable: " + binary);
            }

            ProcessBuilder builder = new ProcessBuilder(
                    binary.getAbsolutePath(),
                    "--listen", "stdio://",
                    "--session-source", "vscode");
            builder.directory(workspace);
            Map<String, String> env = builder.environment();
            env.put("HOME", home.getAbsolutePath());
            env.put("CODEX_HOME", codexHome.getAbsolutePath());
            env.put("TMPDIR", activity.getCacheDir().getAbsolutePath());
            env.put("RISH_APPLICATION_ID", activity.getPackageName());
            env.put("LOG_FORMAT", "json");
            env.put("RUST_LOG", "warn");
            env.put("PATH", new File(codexHome, "bin").getAbsolutePath()
                    + ":/system/bin:/system/xbin:/vendor/bin");

            process = builder.start();
            processInput = new BufferedWriter(new OutputStreamWriter(
                    process.getOutputStream(), StandardCharsets.UTF_8));
            readStdout(process, run);
            readStderr(process, run);
            waitForExit(process, run);

            JSONObject params = new JSONObject()
                    .put("clientInfo", new JSONObject()
                            .put("name", "codex_mobile")
                            .put("title", "Codex Mobile")
                            .put("version", versionName()))
                    .put("capabilities", new JSONObject().put("experimentalApi", true));
            sendRaw(new JSONObject()
                    .put("id", INITIALIZE_ID)
                    .put("method", "initialize")
                    .put("params", params));
        } catch (Exception error) {
            crash(run, error.getMessage());
        }
    }

    @JavascriptInterface
    public void postMessage(String raw) {
        String jsId = null;
        try {
            JSONObject message = new JSONObject(raw);
            jsId = message.getString("id");
            String action = message.getString("action");
            switch (action) {
                case "request":
                    request(jsId, message.getString("method"), message.opt("params"));
                    return;
                case "respond":
                    respondToServer(message);
                    respond(jsId, true, null);
                    return;
                case "getStatus":
                    respond(jsId, statusJson(), null);
                    return;
                case "restart":
                    restart();
                    respond(jsId, true, null);
                    return;
                case "getAppInfo":
                    respond(jsId, appInfo(), null);
                    return;
                case "pickDirectory":
                    respond(jsId, workspace.getAbsolutePath(), null);
                    return;
                case "openExternal":
                    openExternal(message.optString("url"));
                    respond(jsId, true, null);
                    return;
                case "openPath":
                    respond(jsId, false, null);
                    return;
                case "saveTempFile":
                    respond(jsId, saveTempFile(message), null);
                    return;
                case "keepAwake":
                    keepAwake(message.optBoolean("on"));
                    respond(jsId, true, null);
                    return;
                case "gsRead":
                    respond(jsId, readGlobalState(), null);
                    return;
                case "gsPatch":
                    patchGlobalState(message.optJSONObject("patch"));
                    respond(jsId, true, null);
                    emit("gsChanged", new JSONObject());
                    return;
                case "openHelper":
                    activity.runOnUiThread(() ->
                            activity.startActivity(new Intent(activity, MainActivity.class)
                                    .putExtra(MainActivity.EXTRA_AUTO_START, true)));
                    respond(jsId, true, null);
                    return;
                case "helperStatus":
                    respond(jsId, helperStatus(), null);
                    return;
                case "logout":
                    logout();
                    respond(jsId, true, null);
                    return;
                default:
                    respond(jsId, null, "Unsupported Android bridge action: " + action);
            }
        } catch (Exception error) {
            if (jsId != null) respond(jsId, null, error.getMessage());
            else Log.e(TAG, "Invalid bridge message", error);
        }
    }

    private void request(String jsId, String method, Object params) throws JSONException {
        if (!"ready".equals(status)) {
            respond(jsId, null, "app-server not ready");
            return;
        }
        String rpcId = "android-rpc:" + nextRpcId.incrementAndGet();
        rpcToJs.put(rpcId, jsId);
        JSONObject request = new JSONObject()
                .put("id", rpcId)
                .put("method", method)
                .put("params", params == null || params == JSONObject.NULL
                        ? new JSONObject() : params);
        if (!sendRaw(request)) {
            rpcToJs.remove(rpcId);
            respond(jsId, null, "app-server stdin is not writable");
        }
    }

    private void respondToServer(JSONObject message) throws JSONException {
        JSONObject response = new JSONObject().put("id", message.get("requestId"));
        String error = message.optString("error", "");
        if (!error.isEmpty()) {
            response.put("error", new JSONObject().put("code", -32000).put("message", error));
        } else {
            Object result = message.opt("result");
            response.put("result", result == null || result == JSONObject.NULL
                    ? new JSONObject() : result);
        }
        sendRaw(response);
    }

    private void readStdout(Process running, int run) {
        new Thread(() -> {
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(
                    running.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    if (run != generation || line.trim().isEmpty()) continue;
                    try {
                        dispatchServerMessage(new JSONObject(line));
                    } catch (JSONException ignored) {
                        Log.w(TAG, "Ignoring non-JSON app-server stdout");
                    }
                }
            } catch (Exception error) {
                if (run == generation) Log.w(TAG, "stdout reader stopped", error);
            }
        }, "codex-stdout").start();
    }

    private void readStderr(Process running, int run) {
        new Thread(() -> {
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(
                    running.getErrorStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    if (run == generation && !line.trim().isEmpty()) {
                        Log.w(TAG, line.length() > 800 ? line.substring(0, 800) : line);
                    }
                }
            } catch (Exception ignored) {
            }
        }, "codex-stderr").start();
    }

    private void waitForExit(Process running, int run) {
        new Thread(() -> {
            try {
                int code = running.waitFor();
                if (run == generation) crash(run, "app-server exited (code " + code + ")");
            } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
            }
        }, "codex-wait").start();
    }

    private void dispatchServerMessage(JSONObject message) throws JSONException {
        Object idValue = message.opt("id");
        boolean hasId = idValue != null && idValue != JSONObject.NULL;
        if (hasId && (message.has("result") || message.has("error"))) {
            String id = String.valueOf(idValue);
            if (INITIALIZE_ID.equals(id)) {
                if (message.has("error")) {
                    crash(generation, errorMessage(message.optJSONObject("error")));
                } else {
                    JSONObject result = message.optJSONObject("result");
                    serverCodexHome = result == null ? codexHome.getAbsolutePath()
                            : result.optString("codexHome", codexHome.getAbsolutePath());
                    status = "ready";
                    lastError = null;
                    emit("status", statusJson());
                }
                return;
            }
            String jsId = rpcToJs.remove(id);
            if (jsId != null) {
                if (message.has("error")) {
                    respond(jsId, null, errorMessage(message.optJSONObject("error")));
                } else {
                    respond(jsId, message.opt("result"), null);
                }
            }
            return;
        }
        if (hasId && message.has("method")) {
            emit("serverRequest", new JSONObject()
                    .put("id", idValue)
                    .put("method", message.getString("method"))
                    .put("params", message.opt("params") == null
                            ? new JSONObject() : message.opt("params")));
            return;
        }
        if (message.has("method")) {
            emit("notification", new JSONObject()
                    .put("method", message.getString("method"))
                    .put("params", message.opt("params") == null
                            ? new JSONObject() : message.opt("params")));
        }
    }

    private synchronized boolean sendRaw(JSONObject value) {
        try {
            if (process == null || processInput == null) return false;
            processInput.write(value.toString());
            processInput.newLine();
            processInput.flush();
            return true;
        } catch (Exception error) {
            Log.e(TAG, "app-server write failed", error);
            return false;
        }
    }

    private synchronized void restart() {
        int oldGeneration = generation;
        generation++;
        Process old = process;
        process = null;
        processInput = null;
        rpcToJs.clear();
        if (old != null) old.destroy();
        if (oldGeneration >= 0) start();
    }

    private synchronized void crash(int run, String error) {
        if (run != generation) return;
        Process old = process;
        process = null;
        processInput = null;
        status = "crashed";
        lastError = error == null ? "Unknown app-server error" : error;
        if (old != null) old.destroy();
        for (String jsId : rpcToJs.values()) respond(jsId, null, lastError);
        rpcToJs.clear();
        emit("status", statusJson());
    }

    private void prepareRuntime() throws Exception {
        if (!codexHome.exists() && !codexHome.mkdirs()) {
            throw new IllegalStateException("Cannot create " + codexHome);
        }
        if (!workspace.exists() && !workspace.mkdirs()) {
            throw new IllegalStateException("Cannot create " + workspace);
        }
        File bin = new File(codexHome, "bin");
        if (!bin.exists() && !bin.mkdirs()) {
            throw new IllegalStateException("Cannot create " + bin);
        }
        copyAsset("rish", new File(bin, "rish"), true);
        copyAsset("rish_shizuku.dex", new File(bin, "rish_shizuku.dex"), false);

        File instructions = new File(workspace, "AGENTS.md");
        if (!instructions.exists()) {
            String text = "# Android workspace\n\n"
                    + "You are running locally on Android. Work inside this workspace by default.\n"
                    + "For ADB-level system operations, use `rish -c '<command>'` after the user "
                    + "starts the built-in Codex privilege service. `rish` is not root; it runs "
                    + "with Android shell privileges.\n";
            try (FileWriter writer = new FileWriter(instructions)) {
                writer.write(text);
            }
        }
    }

    private void copyAsset(String name, File target, boolean executable) throws Exception {
        if (!executable && target.isFile()) return;
        try (java.io.InputStream input = activity.getAssets().open(name);
             FileOutputStream output = new FileOutputStream(target, false)) {
            byte[] buffer = new byte[8192];
            int count;
            while ((count = input.read(buffer)) >= 0) output.write(buffer, 0, count);
        }
        target.setReadable(true, true);
        target.setWritable(executable || Build.VERSION.SDK_INT < 34, true);
        target.setExecutable(executable, true);
    }

    private JSONObject statusJson() {
        try {
            return new JSONObject()
                    .put("status", status)
                    .put("codexHome", serverCodexHome == null
                            ? codexHome.getAbsolutePath() : serverCodexHome)
                    .put("binary", new File(activity.getApplicationInfo().nativeLibraryDir,
                            "libcodex_app_server.so").getAbsolutePath())
                    .put("binaryCandidates", new org.json.JSONArray())
                    .put("error", lastError == null ? JSONObject.NULL : lastError);
        } catch (JSONException impossible) {
            throw new IllegalStateException(impossible);
        }
    }

    private JSONObject appInfo() throws JSONException {
        boolean dark = (activity.getResources().getConfiguration().uiMode
                & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        return new JSONObject()
                .put("version", versionName())
                .put("platform", "android")
                .put("home", workspace.getAbsolutePath())
                .put("theme", dark ? "dark" : "light");
    }

    private JSONObject helperStatus() throws JSONException {
        boolean running = Shizuku.pingBinder();
        return new JSONObject()
                .put("running", running)
                .put("uid", running ? Shizuku.getUid() : JSONObject.NULL);
    }

    private void openExternal(String url) {
        if (!url.startsWith("https://") && !url.startsWith("http://")) {
            throw new IllegalArgumentException("Only http(s) URLs are allowed");
        }
        activity.runOnUiThread(() ->
                activity.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))));
    }

    private void keepAwake(boolean on) {
        activity.runOnUiThread(() -> {
            if (on) activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        });
    }

    private String saveTempFile(JSONObject message) throws Exception {
        String dataUrl = message.getString("dataUrl");
        int comma = dataUrl.indexOf(',');
        if (comma < 0 || !dataUrl.substring(0, comma).endsWith(";base64")) {
            throw new IllegalArgumentException("Invalid data URL");
        }
        byte[] data = Base64.decode(dataUrl.substring(comma + 1), Base64.DEFAULT);
        if (data.length > MAX_DATA_URL_BYTES) throw new IllegalArgumentException("File is too large");
        String prefix = safePart(message.optString("prefix", "codex-file"), "codex-file");
        String ext = safeExtension(message.optString("ext", ".bin"));
        File file = new File(activity.getCacheDir(),
                prefix + "-" + System.currentTimeMillis() + ext);
        try (FileOutputStream output = new FileOutputStream(file)) {
            output.write(data);
        }
        return file.getAbsolutePath();
    }

    private static String safePart(String value, String fallback) {
        String safe = value.replaceAll("[^A-Za-z0-9_-]", "");
        return safe.isEmpty() ? fallback : safe.substring(0, Math.min(safe.length(), 40));
    }

    private static String safeExtension(String value) {
        if (!value.matches("\\.[A-Za-z0-9]{1,8}")) return ".bin";
        return value;
    }

    private synchronized JSONObject readGlobalState() {
        if (!globalState.isFile()) return new JSONObject();
        try (BufferedReader reader = new BufferedReader(new FileReader(globalState))) {
            StringBuilder text = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) text.append(line);
            return new JSONObject(text.toString());
        } catch (Exception ignored) {
            return new JSONObject();
        }
    }

    private synchronized void patchGlobalState(JSONObject patch) throws Exception {
        JSONObject next = readGlobalState();
        if (patch != null) {
            Iterator<String> keys = patch.keys();
            while (keys.hasNext()) {
                String key = keys.next();
                next.put(key, patch.get(key));
            }
        }
        File temp = new File(globalState.getParentFile(), globalState.getName() + ".tmp");
        try (FileWriter writer = new FileWriter(temp)) {
            writer.write(next.toString());
        }
        if (!temp.renameTo(globalState)) throw new IllegalStateException("Cannot save global state");
    }

    private void logout() {
        File auth = new File(codexHome, "auth.json");
        if (auth.isFile()) {
            File backup = new File(codexHome, "auth.json.bak-logout-" + System.currentTimeMillis());
            if (!auth.renameTo(backup)) throw new IllegalStateException("Cannot back up auth.json");
        }
        restart();
    }

    private String versionName() {
        try {
            return activity.getPackageManager()
                    .getPackageInfo(activity.getPackageName(), 0).versionName;
        } catch (Exception ignored) {
            return "0";
        }
    }

    private static String errorMessage(JSONObject error) {
        return error == null ? "Unknown app-server error"
                : error.optString("message", error.toString());
    }

    private void respond(String id, Object result, String error) {
        try {
            JSONObject message = new JSONObject()
                    .put("type", "response")
                    .put("id", id);
            if (error == null) {
                message.put("result", result == null ? JSONObject.NULL : result);
            } else {
                message.put("error", error);
            }
            sendJavascript(message);
        } catch (JSONException impossible) {
            throw new IllegalStateException(impossible);
        }
    }

    private void emit(String event, Object payload) {
        try {
            sendJavascript(new JSONObject()
                    .put("type", "event")
                    .put("event", event)
                    .put("payload", payload == null ? JSONObject.NULL : payload));
        } catch (JSONException impossible) {
            throw new IllegalStateException(impossible);
        }
    }

    private void sendJavascript(JSONObject message) {
        String raw = message.toString();
        WebView view = webView;
        if (view == null) {
            queuedMessages.add(raw);
            return;
        }
        dispatchJavascript(raw);
    }

    private void dispatchJavascript(String raw) {
        WebView view = webView;
        if (view == null) {
            queuedMessages.add(raw);
            return;
        }
        activity.runOnUiThread(() -> view.evaluateJavascript(
                "window.__codexAndroidReceive && window.__codexAndroidReceive("
                        + JSONObject.quote(raw) + ")", null));
    }

    synchronized void close() {
        generation++;
        Process old = process;
        process = null;
        processInput = null;
        if (old != null) old.destroy();
    }
}
