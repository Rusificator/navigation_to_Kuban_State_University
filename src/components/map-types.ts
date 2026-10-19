import type { Point } from "../domain/types";
export interface MapHandle {
  zoom: (factor: number) => void;
  reset: () => void;
  focus: (point: Point) => void;
}
