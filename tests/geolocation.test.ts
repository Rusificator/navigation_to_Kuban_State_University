import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  permissions: vi.fn(),
  watch: vi.fn(),
  clear: vi.fn(),
}));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true },
}));
vi.mock("@capacitor/geolocation", () => ({
  Geolocation: {
    requestPermissions: mock.permissions,
    watchPosition: mock.watch,
    clearWatch: mock.clear,
  },
}));
import { ForegroundLocation } from "../src/platform/geolocation";
beforeEach(() => {
  vi.clearAllMocks();
  mock.permissions.mockResolvedValue({ location: "granted" });
  mock.clear.mockResolvedValue(undefined);
});
describe("Foreground location lifecycle", () => {
  it("does not publish a permission result after the user stops tracking", async () => {
    let resolve!: (value: unknown) => void;
    mock.permissions.mockReturnValue(new Promise((r) => (resolve = r)));
    const service = new ForegroundLocation(),
      error = vi.fn();
    const pending = service.start(vi.fn(), error);
    await Promise.resolve();
    await service.stop();
    resolve({ location: "denied" });
    await pending;
    expect(error).not.toHaveBeenCalled();
    expect(mock.watch).not.toHaveBeenCalled();
  });
  it("clears a watch that finishes registration after cancellation", async () => {
    let resolve!: (value: string) => void;
    mock.watch.mockReturnValue(new Promise((r) => (resolve = r)));
    const service = new ForegroundLocation();
    const pending = service.start(vi.fn(), vi.fn());
    await vi.waitFor(() => expect(mock.watch).toHaveBeenCalledOnce());
    await service.stop();
    resolve("late-watch");
    await pending;
    expect(mock.clear).toHaveBeenCalledWith({ id: "late-watch" });
  });
  it("ignores callbacks from a superseded watcher and cleans up exactly once", async () => {
    let callback!: (p: unknown, e?: unknown) => void;
    mock.watch.mockImplementation(async (_options, fn) => {
      callback = fn;
      return "watch-1";
    });
    const service = new ForegroundLocation(),
      fix = vi.fn();
    await service.start(fix, vi.fn());
    await service.stop();
    await service.stop();
    callback({
      coords: { latitude: 45, longitude: 39, accuracy: 5 },
      timestamp: Date.now(),
    });
    expect(fix).not.toHaveBeenCalled();
    expect(mock.clear).toHaveBeenCalledTimes(1);
  });
});
