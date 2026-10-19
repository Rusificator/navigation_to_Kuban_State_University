import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";
import type { Fix } from "../domain/location";

/** One foreground subscription, explicit consent, no server or history. */
export class ForegroundLocation {
  private watch: string | null = null;
  private generation = 0;
  async start(
    onFix: (fix: Fix) => void,
    onError: (code: "denied" | "unavailable") => void,
  ) {
    await this.stop();
    const generation = ++this.generation;
    try {
      if (Capacitor.isNativePlatform()) {
        const p = await Geolocation.requestPermissions({
          permissions: ["location"],
        });
        if (generation !== this.generation) return;
        if (p.location === "denied") {
          onError("denied");
          return;
        }
      }
      if (generation !== this.generation) return;
      const id = await Geolocation.watchPosition(
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 5000,
          minimumUpdateInterval: 3000,
        },
        (position, error) => {
          if (generation !== this.generation) return;
          if (error) {
            onError(
              error.code === "OS-PLUG-GLOC-0003" || error.code === 1
                ? "denied"
                : "unavailable",
            );
            return;
          }
          if (position)
            onFix({ ...position.coords, timestamp: position.timestamp });
        },
      );
      if (generation !== this.generation) await Geolocation.clearWatch({ id });
      else this.watch = id;
    } catch (error) {
      if (generation !== this.generation) return;
      const code = (error as { code?: string | number }).code;
      onError(
        code === "OS-PLUG-GLOC-0003" || code === 1 ? "denied" : "unavailable",
      );
    }
  }
  async stop() {
    this.generation++;
    const id = this.watch;
    this.watch = null;
    if (id) await Geolocation.clearWatch({ id }).catch(() => undefined);
  }
}
