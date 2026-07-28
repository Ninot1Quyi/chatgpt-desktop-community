package moe.shizuku.manager;

import android.os.Build;
import android.os.Bundle;

import moe.shizuku.manager.home.AdbDialogFragment;
import moe.shizuku.manager.home.HomeActivity;
import rikka.shizuku.Shizuku;

public class MainActivity extends HomeActivity {

    public static final String EXTRA_AUTO_START =
            "com.ninotquyi.codex.mobile.extra.AUTO_START";

    private boolean autoStart;
    private final Shizuku.OnBinderReceivedListener finishAfterStart = this::finish;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        autoStart = getIntent().getBooleanExtra(EXTRA_AUTO_START, false);
        super.onCreate(savedInstanceState);
        if (autoStart) Shizuku.addBinderReceivedListenerSticky(finishAfterStart);
    }

    @Override
    protected void onPostResume() {
        super.onPostResume();
        if (autoStart && !Shizuku.pingBinder()
                && Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            autoStart = false;
            new AdbDialogFragment().show(getSupportFragmentManager());
        }
    }

    @Override
    protected void onDestroy() {
        Shizuku.removeBinderReceivedListener(finishAfterStart);
        super.onDestroy();
    }
}
