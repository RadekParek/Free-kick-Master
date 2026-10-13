package com.freekickmaster.game;

import android.content.Context;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import java.io.InputStream;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Run on a connected emulator/device with ./gradlew connectedDebugAndroidTest. */
@RunWith(AndroidJUnit4.class)
public class OfflinePackagingTest {
    @Test
    public void correctApplicationId() {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertEquals("com.freekickmaster.game", context.getPackageName());
    }

    @Test
    public void gameAndConfigAreBundled() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        try (InputStream game = context.getAssets().open("public/index.html")) {
            assertTrue("Bundled game entry point must not be empty", game.available() > 100);
        }
        try (InputStream config = context.getAssets().open("capacitor.config.json")) {
            assertTrue("Native configuration must be bundled", config.available() > 0);
        }
    }
}
