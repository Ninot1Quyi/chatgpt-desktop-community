package moe.shizuku.manager;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.MimeTypeMap;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.File;
import java.io.FileInputStream;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;

import rikka.shizuku.Shizuku;

public final class CodexActivity extends Activity {

    private static final String APP_HOST = "codex.local";

    private WebView webView;
    private CodexBridge bridge;
    private boolean helperStartAttempted;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.WHITE);
        getWindow().setNavigationBarColor(Color.WHITE);
        getWindow().getDecorView().setSystemUiVisibility(
                getWindow().getDecorView().getSystemUiVisibility()
                        | android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);

        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccess(true);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMediaPlaybackRequiresUserGesture(false);

        bridge = new CodexBridge(this);
        webView.addJavascriptInterface(bridge, "CodexNative");
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                bridge.onPageReady(view);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme();
                if ("https".equals(scheme) && APP_HOST.equals(uri.getHost())) return false;
                if ("http".equals(scheme) || "https".equals(scheme)) {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                    return true;
                }
                return false;
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(
                    WebView view,
                    WebResourceRequest request) {
                Uri uri = request.getUrl();
                WebResourceResponse response = localFileResponse(uri);
                return response == null ? assetResponse(uri) : response;
            }
        });
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        webView.loadUrl("https://" + APP_HOST + "/index.html");
        bridge.start();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (!helperStartAttempted && !Shizuku.pingBinder()) {
            helperStartAttempted = true;
            startActivity(new Intent(this, MainActivity.class)
                    .putExtra(MainActivity.EXTRA_AUTO_START, true));
        }
    }

    private WebResourceResponse assetResponse(Uri uri) {
        if (!"https".equals(uri.getScheme()) || !APP_HOST.equals(uri.getHost())) return null;
        try {
            String path = uri.getPath();
            if (path == null || !path.startsWith("/") || path.contains("..")) return null;
            String extension = MimeTypeMap.getFileExtensionFromUrl(uri.toString());
            String mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension);
            if ("js".equals(extension)) mime = "application/javascript";
            if ("woff2".equals(extension)) mime = "font/woff2";
            return new WebResourceResponse(
                    mime == null ? "application/octet-stream" : mime,
                    mime != null && (mime.startsWith("text/") || mime.contains("javascript"))
                            ? StandardCharsets.UTF_8.name() : null,
                    getAssets().open("codex" + path));
        } catch (Exception ignored) {
            return null;
        }
    }

    private WebResourceResponse localFileResponse(Uri uri) {
        if (!"codex-file".equals(uri.getScheme()) || !"local".equals(uri.getHost())) return null;
        try {
            String encoded = uri.getEncodedPath();
            if (encoded == null || encoded.length() < 2) return null;
            File file = new File(URLDecoder.decode(encoded.substring(1), StandardCharsets.UTF_8.name()));
            String path = file.getCanonicalPath();
            String files = getFilesDir().getCanonicalPath() + File.separator;
            String cache = getCacheDir().getCanonicalPath() + File.separator;
            if ((!path.startsWith(files) && !path.startsWith(cache)) || !file.isFile()) return null;
            String extension = MimeTypeMap.getFileExtensionFromUrl(file.toURI().toString());
            String mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension);
            return new WebResourceResponse(
                    mime == null ? "application/octet-stream" : mime,
                    null,
                    new FileInputStream(file));
        } catch (Exception ignored) {
            return null;
        }
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        bridge.close();
        webView.destroy();
        super.onDestroy();
    }
}
