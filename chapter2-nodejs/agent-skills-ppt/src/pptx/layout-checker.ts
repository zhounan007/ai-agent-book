export type LayoutElementKind = "text" | "shape" | "line";

export interface LayoutBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LayoutElement extends LayoutBox {
  name: string;
  kind: LayoutElementKind;
  allowOverlap?: boolean;
}

export interface LayoutIssue {
  type: "out-of-bounds" | "overlap";
  slideNumber: number;
  elements: string[];
  message: string;
}

export interface SlideLayoutReport {
  slideNumber: number;
  width: number;
  height: number;
  elements: LayoutElement[];
  issues: LayoutIssue[];
}

const EPSILON = 0.001;

function intersects(a: LayoutElement, b: LayoutElement): boolean {
  return (
    a.x < b.x + b.w - EPSILON &&
    a.x + a.w > b.x + EPSILON &&
    a.y < b.y + b.h - EPSILON &&
    a.y + a.h > b.y + EPSILON
  );
}

export class SlideLayoutTracker {
  readonly #slideNumber: number;
  readonly #width: number;
  readonly #height: number;
  readonly #elements: LayoutElement[] = [];

  constructor(slideNumber: number, width: number, height: number) {
    this.#slideNumber = slideNumber;
    this.#width = width;
    this.#height = height;
  }

  add(element: LayoutElement): void {
    this.#elements.push({ ...element });
  }

  report(): SlideLayoutReport {
    const issues: LayoutIssue[] = [];

    for (const element of this.#elements) {
      if (
        element.x < -EPSILON ||
        element.y < -EPSILON ||
        element.w <= 0 ||
        element.h <= 0 ||
        element.x + element.w > this.#width + EPSILON ||
        element.y + element.h > this.#height + EPSILON
      ) {
        issues.push({
          type: "out-of-bounds",
          slideNumber: this.#slideNumber,
          elements: [element.name],
          message: `元素 ${element.name} 超出 ${this.#width} × ${this.#height} 英寸页面。`,
        });
      }
    }

    for (let left = 0; left < this.#elements.length; left += 1) {
      const first = this.#elements[left]!;
      if (first.allowOverlap || first.kind === "line") continue;
      for (let right = left + 1; right < this.#elements.length; right += 1) {
        const second = this.#elements[right]!;
        if (second.allowOverlap || second.kind === "line") continue;
        if (intersects(first, second)) {
          issues.push({
            type: "overlap",
            slideNumber: this.#slideNumber,
            elements: [first.name, second.name],
            message: `元素 ${first.name} 与 ${second.name} 意外重叠。`,
          });
        }
      }
    }

    return {
      slideNumber: this.#slideNumber,
      width: this.#width,
      height: this.#height,
      elements: this.#elements.map((element) => ({ ...element })),
      issues,
    };
  }
}
