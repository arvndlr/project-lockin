import QRCode from "qrcode";

// Every QR in this system has to survive being read by the ESP32-CAM at the
// locker, not just by a phone camera, so the options live here rather than
// being spelled out at each call site.
//
// The two settings that matter for the hardware scanner:
//
//   margin: 4  — the quiet zone the QR spec actually requires. Phone scanners
//                and html5-qrcode cope with less, but quirc (the decoder on the
//                ESP32) finds the corner patterns by flood-filling regions, and
//                without a real quiet zone the code bleeds into whatever is
//                printed next to it and never locates them.
//
//   level "M"  — a 12-character token (see newQrToken) fits a version-1 QR at
//                error-correction M, which holds 14 bytes. That is the smallest
//                QR there is: 21x21 modules. Going up to level Q drops capacity
//                to 11 bytes, which would push us to version 2 (25x25) and cost
//                us roughly 20% of the pixels-per-module the camera gets to work
//                with. Keep tokens at 14 characters or fewer to stay on
//                version 1.
const CAMERA_SAFE = { margin: 4, errorCorrectionLevel: "M" } as const;

/** PNG data URL, for display on screen. */
export function qrDataUrl(token: string, width: number): Promise<string> {
  return QRCode.toDataURL(token, { ...CAMERA_SAFE, width });
}

/** SVG markup, for print — stays sharp at any physical size. */
export function qrSvg(token: string): Promise<string> {
  return QRCode.toString(token, { ...CAMERA_SAFE, type: "svg" });
}
