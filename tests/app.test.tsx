// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  gpsStart: vi.fn(),
  gpsStop: vi.fn(),
}));
vi.mock("../src/platform/preferences", () => ({
  defaultPreferences: { locale: "ru", theme: "light", favorites: [] },
  loadPreferences: async () => ({
    locale: "ru",
    theme: "light",
    favorites: [],
  }),
  savePreferences: mocks.save,
}));
vi.mock("../src/platform/geolocation", () => ({
  ForegroundLocation: class {
    start = mocks.gpsStart;
    stop = mocks.gpsStop;
  },
}));
// DOM tests deliberately replace the GPU renderer; these are not visual/WebGL tests.
vi.mock("../src/components/Map3D", () => ({
  Map3D: React.forwardRef((_props, ref) => {
    React.useImperativeHandle(ref, () => ({
      zoom() {},
      reset() {},
      focus() {},
    }));
    return <div data-testid="gpu-placeholder" />;
  }),
}));
import App from "../src/App";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.save.mockResolvedValue(undefined);
  mocks.gpsStop.mockResolvedValue(undefined);
  mocks.gpsStart.mockResolvedValue(undefined);
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }),
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const user = () => userEvent.setup();
const nav = (name: string) =>
  within(document.querySelector(".desktop-nav") as HTMLElement).getByRole(
    "button",
    { name },
  );
async function openRoom(u: ReturnType<typeof user>, code = "A421") {
  await u.click(
    screen.getByRole("button", { name: /Аудитория, корпус или место/ }),
  );
  const dialog = screen.getByRole("dialog");
  await u.type(within(dialog).getByRole("textbox"), code);
  const result = within(dialog).getByRole("button", { name: /А421/ });
  await u.click(result);
}
describe("Student journeys", () => {
  // These integration journeys render real campus data; allow slow CI hosts.
  const journeyTimeout = 15000;
  it(
    "finds a room using Latin characters and persists a campus-scoped favourite",
    async () => {
      const u = user();
      render(<App />);
      await openRoom(u);
      expect(screen.getByRole("heading", { name: "А421" })).toBeTruthy();
      await u.click(screen.getByRole("button", { name: "В избранное" }));
      await u.click(nav("Избранное"));
      expect(
        screen.getByRole("button", { name: /А421.*Библиотека/ }),
      ).toBeTruthy();
      await waitFor(() =>
        expect(mocks.save).toHaveBeenLastCalledWith(
          expect.objectContaining({
            favorites: [expect.stringMatching(/:rect10886$/)],
          }),
        ),
      );
    },
    journeyTimeout,
  );
  it(
    "builds a real route and advances explicitly to the destination floor",
    async () => {
      const u = user();
      render(<App />);
      await openRoom(u);
      await u.click(screen.getByRole("button", { name: "Маршрут сюда" }));
      await u.click(screen.getByRole("button", { name: "Построить маршрут" }));
      expect(
        screen.getByRole("heading", { name: "Ваш маршрут готов" }),
      ).toBeTruthy();
      expect(
        screen.getByRole("img", { name: "План кампуса, этаж 1" }),
      ).toBeTruthy();
      await u.click(screen.getByRole("button", { name: "Начать путь" }));
      let attempts = 0;
      while (
        screen.queryByRole("button", { name: "Следующий шаг" }) &&
        attempts++ < 50
      )
        await u.click(screen.getByRole("button", { name: "Следующий шаг" }));
      expect(attempts).toBeLessThan(50);
      expect(
        screen.getByRole("img", { name: "План кампуса, этаж 4" }),
      ).toBeTruthy();
      await u.click(screen.getByRole("button", { name: "Завершить маршрут" }));
      expect(screen.getByText("Маршрут завершён")).toBeTruthy();
    },
    journeyTimeout,
  );
  it(
    "changes the whole interface language and theme without losing navigation",
    async () => {
      const u = user();
      render(<App />);
      await u.click(nav("Настройки"));
      await u.click(screen.getByRole("button", { name: "English" }));
      expect(document.documentElement.lang).toBe("en");
      expect(screen.getByRole("heading", { name: "Settings" })).toBeTruthy();
      await u.click(
        within(
          document.querySelector(".theme-picker") as HTMLElement,
        ).getByRole("button", { name: "Dark" }),
      );
      expect(document.documentElement.dataset.theme).toBe("dark");
      await u.click(nav("Map"));
      expect(
        screen.getByRole("button", { name: /Room, building or place/ }),
      ).toBeTruthy();
    },
    journeyTimeout,
  );
  it(
    "shows denied GPS access and permits a new attempt",
    async () => {
      mocks.gpsStart.mockImplementation(async (_fix, error) => error("denied"));
      const u = user();
      render(<App />);
      await u.click(screen.getByRole("button", { name: "Моё местоположение" }));
      expect(screen.getByText(/Доступ к местоположению запрещён/)).toBeTruthy();
      await u.click(screen.getByRole("button", { name: "Включить GPS" }));
      expect(mocks.gpsStart).toHaveBeenCalledTimes(2);
      await u.click(screen.getByRole("button", { name: "2D" }));
      expect(document.querySelector(".position-marker")).toBeNull();
    },
    journeyTimeout,
  );
  it(
    "keeps search keyboard focus inside the dialog and restores it on Escape",
    async () => {
      const u = user();
      render(<App />);
      const launch = screen.getByRole("button", {
        name: /Аудитория, корпус или место/,
      });
      await u.click(launch);
      expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(
        true,
      );
      await u.keyboard("{Escape}");
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(document.activeElement).toBe(launch);
    },
    journeyTimeout,
  );
  it(
    "opens a report with keyboard support and never sends it automatically",
    async () => {
      const u = user();
      render(<App />);
      await openRoom(u);
      await u.click(screen.getByRole("button", { name: "Сообщить об ошибке" }));
      const dialog = screen.getByRole("dialog");
      expect(document.activeElement).toBe(within(dialog).getByRole("textbox"));
      expect(
        (
          within(dialog).getByRole("button", {
            name: "Сохранить или поделиться",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true);
      await u.keyboard("{Escape}");
      expect(screen.queryByRole("dialog")).toBeNull();
    },
    journeyTimeout,
  );

  it(
    "opens only mobilisation office 215 and its official source",
    async () => {
      const u = user();
      render(<App />);
      await u.click(
        screen.getByRole("button", { name: /Аудитория, корпус или место/ }),
      );
      const dialog = screen.getByRole("dialog");
      await u.type(within(dialog).getByRole("textbox"), "моб отдел");
      const results = within(dialog).getAllByRole("button", {
        name: /Мобилизационный отдел/,
      });
      expect(results).toHaveLength(1);
      await u.click(results[0]);
      expect(
        screen.getByRole("heading", { name: "Мобилизационный отдел · 215" }),
      ).toBeTruthy();
      expect(
        screen
          .getByRole("link", { name: "Телефонный справочник КубГУ" })
          .getAttribute("href"),
      ).toBe("https://tel.kubsu.ru/");
      await u.click(screen.getByRole("button", { name: "2D" }));
      expect(
        screen.getByRole("img", { name: "План кампуса, этаж 2" }),
      ).toBeTruthy();
    },
    journeyTimeout,
  );
  it(
    "opens stadium and dormitory cards with no invented floor or route",
    async () => {
      const u = user();
      render(<App />);
      await u.click(
        screen.getByRole("button", { name: /Аудитория, корпус или место/ }),
      );
      const dialog = screen.getByRole("dialog");
      await u.type(within(dialog).getByRole("textbox"), "стадион");
      await u.click(
        within(dialog).getByRole("button", { name: /Стадион КубГУ/ }),
      );
      expect(
        screen.getByRole("heading", { name: "Стадион КубГУ" }),
      ).toBeTruthy();
      expect(
        document.querySelector(".detail-location")?.textContent,
      ).not.toContain("этаж");
      expect(
        (
          screen.getByRole("button", {
            name: "Маршрут сюда",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true);
      await u.click(screen.getByRole("button", { name: "2D" }));
      expect(
        document.querySelector(
          '.campus-place-labels [data-place="campus-stadium"]',
        )?.textContent,
      ).toBe("Стадион");
      await u.click(screen.getByRole("button", { name: "GPS-карта" }));
      const label = document.querySelector(
        '.osm-place-label[data-place="campus-dorm-4"]',
      ) as SVGElement;
      expect(label).toBeTruthy();
      label.focus();
      await u.keyboard("{Enter}");
      expect(
        screen.getByRole("heading", { name: "Общежитие № 4" }),
      ).toBeTruthy();
      expect(
        screen.getByRole("img", { name: "Географическая карта кампуса" }),
      ).toBeTruthy();
      expect(
        document.querySelectorAll(".outdoor-svg polygon.selected"),
      ).toHaveLength(1);
    },
    journeyTimeout,
  );
  it(
    "does not highlight unnamed map shapes when no place is selected",
    async () => {
      const u = user();
      render(<App />);
      await u.click(screen.getByRole("button", { name: "2D" }));
      expect(
        document.querySelectorAll(".context-buildings .selected"),
      ).toHaveLength(0);
      await u.click(screen.getByRole("button", { name: "GPS-карта" }));
      expect(
        document.querySelectorAll(".outdoor-svg polygon.selected"),
      ).toHaveLength(0);
    },
    journeyTimeout,
  );
});
