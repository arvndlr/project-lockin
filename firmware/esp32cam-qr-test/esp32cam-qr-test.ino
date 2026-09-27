  /*
  * Project LockIn — ESP32-CAM QR reader, bench test
  * ------------------------------------------------
  * Stage 1 of the camera work: decode a student card and print the token to
  * serial. No WiFi, no server, no lock. If this doesn't work reliably on a
  * desk, it won't work bolted to a cabinet, so prove it here first.
  *
  * BOARD SETTINGS (Arduino IDE → Tools):
  *   Board             AI Thinker ESP32-CAM
  *   Partition Scheme  Huge APP (3MB No OTA/1MB SPIFFS)   <-- required, the
  *                     camera driver + quirc will not fit the default 1.2MB app
  *   Flash Mode        DIO
  *
  *   This board has no PSRAM or Upload Speed menu — the board definition fixes
  *   PSRAM on (-DBOARD_HAS_PSRAM) and the speed at 460800. If uploads fail at
  *   that rate, switch to the ESP32 Dev Module entry and set PSRAM=Enabled,
  *   Huge APP, 4MB flash, 115200 by hand.
  *
  *   ESP32 board package: use 3.2.1. Version 3.3.0 is known to break this
  *   library, and the Boards Manager will happily offer you 3.3.0 as the
  *   newest. Pin it explicitly.
  *
  * LIBRARY:
  *   ESP32QRCodeReader by Alvaro Viebrantz. It is NOT in the Arduino Library
  *   Manager, so searching for it there finds nothing. Install it from source:
  *
  *     1. https://github.com/alvarowolfx/ESP32QRCodeReader -> Code -> Download ZIP
  *     2. Arduino IDE -> Sketch -> Include Library -> Add .ZIP Library
  *     3. Confirm it worked: File -> Examples should now list ESP32QRCodeReader
  *
  *   Download it fresh rather than using an old copy — older versions fail to
  *   compile against current ESP32 cores with "implicit declaration of function
  *   ps_malloc".
  *
  * FLASHING:
  *   With an ESP32-CAM-MB baseboard, just press Upload. If it times out with
  *   "Failed to connect to ESP32", hold BOOT, tap RST, release BOOT, upload.
  *   Tap RST once more after it finishes to leave bootloader mode.
  *
  *   On a bare board with a USB-TTL adapter: jumper GPIO0 to GND, press RESET,
  *   upload, REMOVE the jumper, press RESET again. Skipping the removal is why
  *   "it uploaded but nothing happens".
  */

  #include <Arduino.h>
  #include "ESP32QRCodeReader.h"

  // QVGA (320x240) is stated explicitly even though it is the library default,
  // because the 34mm QR size in server/src/lib/cards.ts is calculated against
  // this exact frame width. Change one and the other stops being true.
  ESP32QRCodeReader reader(CAMERA_MODEL_AI_THINKER, FRAMESIZE_QVGA);

  // The red status LED on the back of the AI-Thinker board. Active LOW.
  // Deliberately NOT the white flash LED on GPIO4 — that one is far too harsh at
  // card distance and reflects off lamination straight back into the lens.
  static const int LED_PIN = 33;

  // A card sitting in the guide gets decoded several times a second. Without
  // this, one student standing there would fire a dozen scans.
  static const uint32_t REPEAT_IGNORE_MS = 3000;
  static String   lastToken;
  static uint32_t lastTokenAt = 0;

  // Rough health signal while you tune focus and lighting: how many frames the
  // decoder actually got something out of.
  static uint32_t decodeCount = 0;
  static uint32_t lastFailAt   = 0;

  static void blink(int times) {
    for (int i = 0; i < times; i++) {
      digitalWrite(LED_PIN, LOW);
      delay(60);
      digitalWrite(LED_PIN, HIGH);
      delay(60);
    }
  }

  void onQrCodeTask(void *pvParameters) {
    // static, not automatic: QRCodeData carries a 1KB payload buffer, and
    // there is only ever one of this task, so there is no reason to spend a
    // quarter of the task stack on it.
    static struct QRCodeData qrCodeData;

    while (true) {
      if (reader.receiveQrCode(&qrCodeData, 100)) {
        if (!qrCodeData.valid) {
          // On failure the library puts quirc_strerror() into the payload, which
          // is far more useful than "it didn't work":
          //   "Format data ECC failure" - cannot read even the format bits.
          //   "ECC failure"             - format bits fine, module data did not
          //                               survive. Mild blur or at the limit.
          //   "Invalid grid size"       - geometry: skewed, or quiet zone clipped.
          // Rate-limited; this fires several times a second.
          uint32_t failNow = millis();
          if (failNow - lastFailAt > 1000) {
            lastFailAt = failNow;
            Serial.printf("[.] found a code, could not decode: %s\n",
                          (const char *)qrCodeData.payload);
          }
          continue;
        }

        String token = String((const char *)qrCodeData.payload);
        uint32_t now = millis();

        if (token == lastToken && (now - lastTokenAt) < REPEAT_IGNORE_MS) {
          lastTokenAt = now;   // still being held up; keep the window alive
          continue;
        }

        lastToken   = token;
        lastTokenAt = now;
        decodeCount++;

        Serial.println();
        Serial.println("==============================");
        Serial.printf("  TOKEN : %s\n", token.c_str());
        Serial.printf("  LENGTH: %d  (expect 12)\n", token.length());
        Serial.printf("  DECODE: #%u\n", decodeCount);
        Serial.println("==============================");

        // A 12-character base64url string is what newQrToken() produces. Anything
        // else means you scanned some other QR code, not a LockIn card.
        if (token.length() != 12) {
          Serial.println("  ^ not a LockIn token - wrong QR?");
        }

        blink(2);
      }

      vTaskDelay(100 / portTICK_PERIOD_MS);
    }
  }

  void setup() {
    Serial.begin(115200);
    delay(400);

    pinMode(LED_PIN, OUTPUT);
    digitalWrite(LED_PIN, HIGH);   // off

    Serial.println();
    Serial.println("LockIn - ESP32-CAM QR bench test");

    // quirc needs a full greyscale frame plus a region map, which will not fit in
    // internal RAM. Some ESP32-CAM clones ship without PSRAM; stop loudly rather
    // than crash-looping in the camera driver, which looks like a wiring fault.
    if (!psramFound()) {
      Serial.println("FATAL: no PSRAM detected. This board cannot run quirc.");
      while (true) { blink(1); delay(400); }
    }
    Serial.printf("PSRAM: %u bytes free\n", (unsigned)ESP.getFreePsram());

    // setup() reports why it failed rather than just not working — a camera that
    // never initialises otherwise looks identical to a card that never decodes,
    // and the usual cause is a ribbon connector that is not fully seated.
    // cam_hal logs a warning from inside cam_task whenever the application is
    // too slow to collect a frame. That one log call runs the whole newlib
    // vprintf + VFS + heap chain on cam_task's small stack and trips its canary,
    // panicking the board. quirc needs a few hundred ms per frame, so that
    // warning is guaranteed to fire sooner or later. Silence the tag.
    esp_log_level_set("cam_hal", ESP_LOG_NONE);

    QRCodeReaderSetupErr err = reader.setup();
    if (err != SETUP_OK) {
      Serial.printf("FATAL: camera setup failed (code %d)\n", (int)err);
      if (err == SETUP_NO_PSRAM_ERROR) {
        Serial.println("  no PSRAM");
      } else {
        Serial.println("  camera init failed - reseat the ribbon connector");
      }
      while (true) { blink(1); delay(400); }
    }

    reader.beginOnCore(1);   // keep decoding off core 0, which handles WiFi later

    // 8KB rather than the 4KB in the library example: this task also builds
    // an Arduino String and makes several Serial.printf calls, each taking
    // its own stack buffer.
    xTaskCreate(onQrCodeTask, "onQrCode", 8 * 1024, NULL, 4, NULL);

    Serial.println("Ready. Hold a card about 8cm from the lens.");
    Serial.println("If nothing decodes, the lens is almost certainly still");
    Serial.println("focused at 1m from the factory - see README.md.");
  }

  void loop() {
    delay(1000);
  }
