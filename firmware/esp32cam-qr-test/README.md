# ESP32-CAM QR bench test

Stage 1 of the hardware build. Goal: hold a student card in front of the
camera and see its token appear in the serial monitor. Nothing else — no WiFi,
no server call, no lock. Everything later depends on this being reliable, and
it is much easier to debug on a desk than inside a cabinet.

## Getting a card to test with

Log in as `admin` and open <http://localhost:3000/api/admin/cards>.

Print one sheet at **100% scale** (turn off "fit to page"), or — for bench
testing only — just display the page on a laptop screen and use the browser
zoom until a QR measures **34mm** across with a ruler. A matte laptop screen
reads fine at this stage.

The printed card is what the real system uses, because at retrieval time the
student's phone is locked inside the cabinet and cannot display anything.

## Focus the lens first

**This is the step everyone skips and then spends an evening on.** ESP32-CAM
modules leave the factory focused for roughly one metre. At 8cm your card is a
blur and quirc will never decode it.

1. The lens barrel screws in and out. There is usually a dab of glue on the
   thread — break it carefully with a fingernail or tweezers.
2. Flash the standard `CameraWebServer` example, open the stream, and hold a
   card at 8cm.
3. Turn the barrel slowly, usually **counter-clockwise** to focus nearer, until
   the QR modules have hard edges rather than grey mush.
4. Put a small dot of nail polish on the thread to stop it drifting.
5. *Then* flash this sketch.

## Installing the library

`ESP32QRCodeReader` is **not in the Arduino Library Manager** — searching for
it there returns nothing. Install it from source:

1. Open <https://github.com/alvarowolfx/ESP32QRCodeReader>
2. Green **Code** button → **Download ZIP**
3. Arduino IDE → **Sketch → Include Library → Add .ZIP Library** → pick the file
4. Verify: **File → Examples** should now list *ESP32QRCodeReader*

Download it fresh. Older copies fail to compile against current ESP32 cores
with `implicit declaration of function ps_malloc`.

### Then fix the layout — required, or it will not compile

The repo is laid out for PlatformIO: headers live in `include/`, sources in
`src/`. PlatformIO adds both to the include path. **Arduino IDE does not** —
seeing `library.properties`, it treats this as a 1.5-format library, where only
`src/` is searched. `include/` is ignored completely, and you get:

```
fatal error: ESP32QRCodeReader.h: No such file or directory
Alternatives for ESP32QRCodeReader.h: []
```

Copy the two headers into `src/`:

```
cp include/ESP32QRCodeReader.h include/ESP32CameraPins.h src/
```

Or in Explorer: open the library folder, copy `ESP32QRCodeReader.h` and
`ESP32CameraPins.h` from `include\` into `src\`. Leave the originals alone so
the PlatformIO layout still works.

Afterwards `src/` should hold:

```
src/
├── ESP32CameraPins.h      <- copied
├── ESP32QRCodeReader.h    <- copied
├── ESP32QRCodeReader.cpp
├── openmv/
└── quirc/
```

### And patch two missing includes

`ps_malloc` is an Arduino-ESP32 macro that lives in `Arduino.h`. Upstream added
that include to `quirc.c` but missed two other files that also call it, so the
build dies with:

```
error: implicit declaration of function 'ps_malloc'
```

This is not fixed by downloading a newer copy — it is still broken on master.
Add the includes yourself.

**`src/quirc/decode.c`** — after the existing `#include <stdlib.h>`:

```c
#include <Arduino.h>
```

**`src/openmv/collections.c`** — after `#include "collections.h"`, which is
missing three:

```c
#include <stdlib.h>
#include <string.h>
#include <Arduino.h>
```

Both patches are already applied in this working copy. They will be lost if you
reinstall the library, so come back here if `ps_malloc` errors reappear.

### And give the camera a second frame buffer

Upstream sets `fb_count = 1`. With only one buffer the driver has nowhere to put
the next frame while quirc spends 150-400ms decoding the current one, so
`cam_task` logs a "failed to get the frame on time" warning — and that log call
runs the entire newlib `vprintf` chain on `cam_task`'s own small stack, trips
its canary and panics the board:

```
Guru Meditation Error: Core 0 panic'ed (Unhandled debug exception).
Debug exception reason: Stack canary watchpoint triggered (cam_task)
```

It survives a while before dying, because it needs a slow decode to trigger —
which is exactly what happens the moment you hold a QR code up.

In **`src/ESP32QRCodeReader.cpp`**, replace `cameraConfig.fb_count = 1;` with:

```c
cameraConfig.fb_count = 2;
cameraConfig.grab_mode = CAMERA_GRAB_LATEST;
cameraConfig.fb_location = CAMERA_FB_IN_PSRAM;
```

A second QVGA greyscale buffer costs 77KB of PSRAM out of 4MB. `GRAB_LATEST` is
what a scanner wants regardless — the freshest frame, not a stale queued one.

The sketch also calls `esp_log_level_set("cam_hal", ESP_LOG_NONE)` before
`reader.setup()`, which blocks the crash path itself rather than just making it
rarer. Both belt and braces, because a panic here means a locker that reboots
mid-scan.

### Board package version

Use ESP32 core **3.2.1**. Version **3.3.0 breaks this library**, and Boards
Manager will offer you 3.3.0 as the newest — pin it explicitly:

Tools → Board → Boards Manager → search `esp32` → version dropdown → 3.2.1

### Board settings

Selecting **AI Thinker ESP32-CAM** gives you a deliberately short Tools menu.
There is no PSRAM entry and no Upload Speed entry, because the board definition
fixes both:

- **PSRAM** is compiled in unconditionally (`-DBOARD_HAS_PSRAM`). It is always
  on for this board and cannot be turned off. Nothing to set.
- **Upload Speed** is hard-coded to 460800.
- **Partition Scheme** already defaults to `huge_app`, which is what we need.

So the only things worth checking:

| Setting | Value |
|---|---|
| Board | AI Thinker ESP32-CAM |
| Partition Scheme | **Huge APP (3MB No OTA/1MB SPIFFS)** |
| Flash Mode | DIO |

Wrong partition scheme is the usual cause of a sketch that uploads and then
bootloops.

### If uploads keep failing at 460800

Some CH340 baseboards and cables are not reliable at that rate, and this board
gives you no menu to lower it. Switch to the **ESP32 Dev Module** board entry
instead, which exposes the full menu, and set it up manually:

| Setting | Value |
|---|---|
| Board | ESP32 Dev Module |
| PSRAM | **Enabled** (critical — quirc will not run without it) |
| Partition Scheme | Huge APP (3MB No OTA/1MB SPIFFS) |
| Flash Size | 4MB (32Mb) |
| Upload Speed | 115200 |

Same chip, same result — you are only trading the preset for slower, more
forgiving uploads.

## Flashing

### With the ESP32-CAM-MB baseboard

Seat the ESP32-CAM on the MB (it only fits one way — the silkscreen outline on
the baseboard shows the orientation) and connect micro-USB.

A port named **USB-SERIAL CH340 (COMx)** should appear in Tools → Port. If no
new port shows up at all:

- The cable may be **charge-only**. This is the single most common cause. Try a
  different cable before anything else.
- Otherwise install the CH340 driver from <https://www.wch-ic.com/downloads/CH341SER_EXE.html>
  and replug.

Then just press Upload. If it fails with `Failed to connect to ESP32: Timed
out waiting for packet header`, the auto-reset circuit on your MB revision
isn't triggering — do it manually:

1. Hold **BOOT** (IO0)
2. Tap **RST**
3. Release **BOOT**
4. Upload immediately

Serial monitor at **115200**.

> The MB is a programmer, not a power supply for the finished build. It is fine
> for this bench test, but once WiFi and the camera run together a laptop USB
> port will sag — the real unit gets the 5V rail described in the main hardware
> plan.

### Without the baseboard (bare ESP32-CAM + USB-TTL adapter)

| Step | Action |
|---|---|
| 1 | Jumper **GPIO0 → GND** |
| 2 | Press **RESET** |
| 3 | Upload |
| 4 | **Remove the jumper** |
| 5 | Press **RESET** again |

Forgetting step 4 is why "it uploaded but nothing happens" — the board comes
back up in bootloader mode instead of running your sketch.

## Expected output

```
LockIn — ESP32-CAM QR bench test
PSRAM: 4192123 bytes free
Ready. Hold a card about 8cm from the lens.

==============================
  TOKEN : K7bQ2xRt9mPa
  LENGTH: 12  (expect 12)
  DECODE: #1
==============================
```

The red LED blinks twice on each new token.

## Troubleshooting

| Symptom | Cause |
|---|---|
| `FATAL: no PSRAM detected` | Clone board without PSRAM. quirc can't run — you need a different module |
| Nothing at all, no serial output | Still in bootloader — on the MB, tap RST after upload finishes |
| Boot messages appear, then output stops mid-`setup()` | A non-ASCII character in a `Serial.print` string. Keep all serial output plain ASCII — an em-dash is three UTF-8 bytes and the monitor can swallow the line |
| No COM port appears | Charge-only USB cable (most likely), or CH340 driver missing |
| `Failed to connect to ESP32` | Hold BOOT, tap RST, release BOOT, then upload |
| `found a code but could not decode it` | Focus or glare. This message means the camera *sees* a QR, so the lens is close — keep tuning |
| Can't find the library in Library Manager | It isn't there — install the ZIP from GitHub, see above |
| `ESP32QRCodeReader.h: No such file or directory` | Headers still in `include/`. Copy them into `src/`, see above |
| `implicit declaration of function 'ps_malloc'` | Missing includes in `decode.c` / `collections.c`, see above |
| `Stack canary watchpoint triggered (cam_task)` | One frame buffer starving the driver. Set `fb_count = 2`, see above |
| Compiles but bootloops | ESP32 core 3.3.0 (use 3.2.1), or wrong partition scheme |
| Sketch too large | Partition Scheme is not set to **Huge APP (3MB No OTA)** |
| Works on paper, fails on laminate | Glossy lamination reflecting your light source. Use matte, or move the light off-axis |
| Decodes at 15cm but not 8cm | Lens focused too far out — keep turning the barrel |

## Next stage

Once this decodes reliably, stage 2 adds WiFi and POSTs the token to
`/api/kiosk/scan`, which needs no server changes — that endpoint already takes
a bare `qrToken` string regardless of which client sends it.
