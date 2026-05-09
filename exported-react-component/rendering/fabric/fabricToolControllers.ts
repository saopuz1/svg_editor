import {
  ActiveSelection,
  Line,
  Path,
  PencilBrush,
  Polyline,
  type FabricObject,
} from "fabric";
import type {
  ToolController,
  ToolControllerContext,
  ToolControllerRegistry,
} from "../../layers/edit/toolController";
import { createCommand, createTextboxNode } from "../../layers/edit/commands";
import { CANCEL_ACTIVE_DRAWING_EVENT } from "../../layers/edit/shortcuts";
import {
  createPathNodeFromFabricPath,
  ensureNumber,
  getNodeIdFromObject,
} from "./fabricProjection";

type FabricMouseDownEvent = {
  target?: FabricObject;
  scenePoint?: { x?: unknown; y?: unknown };
};

type FabricPathCreatedEvent = {
  path?: FabricObject;
};

type FabricMouseUpEvent = {
  target?: FabricObject;
  scenePoint?: { x?: unknown; y?: unknown };
};

type FabricMouseMoveEvent = {
  scenePoint?: { x?: unknown; y?: unknown };
};

type Point2D = { x: number; y: number };
type Segment = { a: Point2D; b: Point2D };

function distanceBetweenPoints(a: Point2D, b: Point2D) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function toPoint2D(point?: { x?: unknown; y?: unknown }, fallback?: Point2D) {
  return {
    x: ensureNumber(point?.x, fallback?.x ?? 0),
    y: ensureNumber(point?.y, fallback?.y ?? 0),
  };
}

function appendPoint(points: Point2D[], point: Point2D, minDistance = 4) {
  const last = points[points.length - 1];
  if (!last || distanceBetweenPoints(last, point) >= minDistance) {
    points.push(point);
    return;
  }
  points[points.length - 1] = point;
}

function getPolylineSegments(points: Point2D[], closed = false): Segment[] {
  const segments: Segment[] = [];
  for (let i = 1; i < points.length; i += 1) {
    segments.push({ a: points[i - 1], b: points[i] });
  }
  if (closed && points.length > 2) {
    segments.push({ a: points[points.length - 1], b: points[0] });
  }
  return segments;
}

function orientation(a: Point2D, b: Point2D, c: Point2D) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function isPointOnSegment(
  point: Point2D,
  a: Point2D,
  b: Point2D,
  epsilon = 1e-6,
) {
  return (
    Math.min(a.x, b.x) - epsilon <= point.x &&
    point.x <= Math.max(a.x, b.x) + epsilon &&
    Math.min(a.y, b.y) - epsilon <= point.y &&
    point.y <= Math.max(a.y, b.y) + epsilon &&
    Math.abs(orientation(a, b, point)) <= epsilon
  );
}

function segmentsIntersect(first: Segment, second: Segment) {
  const o1 = orientation(first.a, first.b, second.a);
  const o2 = orientation(first.a, first.b, second.b);
  const o3 = orientation(second.a, second.b, first.a);
  const o4 = orientation(second.a, second.b, first.b);
  const epsilon = 1e-6;

  if (
    ((o1 > epsilon && o2 < -epsilon) || (o1 < -epsilon && o2 > epsilon)) &&
    ((o3 > epsilon && o4 < -epsilon) || (o3 < -epsilon && o4 > epsilon))
  ) {
    return true;
  }

  return (
    isPointOnSegment(second.a, first.a, first.b, epsilon) ||
    isPointOnSegment(second.b, first.a, first.b, epsilon) ||
    isPointOnSegment(first.a, second.a, second.b, epsilon) ||
    isPointOnSegment(first.b, second.a, second.b, epsilon)
  );
}

function distancePointToSegment(point: Point2D, segment: Segment) {
  const dx = segment.b.x - segment.a.x;
  const dy = segment.b.y - segment.a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return distanceBetweenPoints(point, segment.a);

  const t = Math.max(
    0,
    Math.min(
      1,
      ((point.x - segment.a.x) * dx + (point.y - segment.a.y) * dy) / lenSq,
    ),
  );

  return distanceBetweenPoints(point, {
    x: segment.a.x + t * dx,
    y: segment.a.y + t * dy,
  });
}

function distanceBetweenSegments(first: Segment, second: Segment) {
  if (segmentsIntersect(first, second)) return 0;
  return Math.min(
    distancePointToSegment(first.a, second),
    distancePointToSegment(first.b, second),
    distancePointToSegment(second.a, first),
    distancePointToSegment(second.b, first),
  );
}

function buildPreviewPolyline(
  points: Point2D[],
  options?: {
    stroke?: string;
    strokeWidth?: number;
    strokeDashArray?: number[];
    opacity?: number;
  },
) {
  return new Polyline(points, {
    fill: "",
    stroke: options?.stroke ?? "#2563eb",
    strokeWidth: options?.strokeWidth ?? 2,
    strokeDashArray: options?.strokeDashArray,
    opacity: options?.opacity ?? 1,
    selectable: false,
    evented: false,
    objectCaching: false,
  } as never);
}

function transformPointWithMatrix(point: Point2D, matrix: number[]): Point2D {
  return {
    x: matrix[0] * point.x + matrix[2] * point.y + matrix[4],
    y: matrix[1] * point.x + matrix[3] * point.y + matrix[5],
  };
}

function sampleQuadratic(
  from: Point2D,
  control: Point2D,
  to: Point2D,
  steps = 12,
) {
  const points: Point2D[] = [];
  for (let index = 1; index <= steps; index += 1) {
    const t = index / steps;
    const mt = 1 - t;
    points.push({
      x: mt * mt * from.x + 2 * mt * t * control.x + t * t * to.x,
      y: mt * mt * from.y + 2 * mt * t * control.y + t * t * to.y,
    });
  }
  return points;
}

function sampleCubic(
  from: Point2D,
  control1: Point2D,
  control2: Point2D,
  to: Point2D,
  steps = 16,
) {
  const points: Point2D[] = [];
  for (let index = 1; index <= steps; index += 1) {
    const t = index / steps;
    const mt = 1 - t;
    points.push({
      x:
        mt * mt * mt * from.x +
        3 * mt * mt * t * control1.x +
        3 * mt * t * t * control2.x +
        t * t * t * to.x,
      y:
        mt * mt * mt * from.y +
        3 * mt * mt * t * control1.y +
        3 * mt * t * t * control2.y +
        t * t * t * to.y,
    });
  }
  return points;
}

function reflectControlPoint(control: Point2D | null, anchor: Point2D) {
  if (!control) return anchor;
  return {
    x: anchor.x * 2 - control.x,
    y: anchor.y * 2 - control.y,
  };
}

function getPathPolylines(obj: Path): Point2D[][] {
  const rawPath = (obj as Path & { path?: unknown }).path;
  if (!Array.isArray(rawPath)) return [];

  const polylines: Point2D[][] = [];
  const matrix = (obj.calcTransformMatrix() as number[]) ?? [1, 0, 0, 1, 0, 0];
  const pathOffset = (obj.pathOffset ?? { x: 0, y: 0 }) as Point2D;

  let current: Point2D = { x: 0, y: 0 };
  let subpathStart: Point2D | null = null;
  let activePolyline: Point2D[] = [];
  let previousCubicControl: Point2D | null = null;
  let previousQuadraticControl: Point2D | null = null;

  const pushPolyline = () => {
    if (activePolyline.length > 1) polylines.push(activePolyline);
    activePolyline = [];
  };

  const pushPoint = (point: Point2D) => {
    activePolyline.push(
      transformPointWithMatrix(
        { x: point.x - pathOffset.x, y: point.y - pathOffset.y },
        matrix,
      ),
    );
  };

  for (const commandValue of rawPath) {
    if (!Array.isArray(commandValue) || typeof commandValue[0] !== "string") {
      continue;
    }

    const command = String(commandValue[0]);
    const args = commandValue as unknown as unknown[];

    if (command === "M" || command === "m") {
      pushPolyline();
      current =
        command === "M"
          ? {
              x: ensureNumber(commandValue[1], current.x),
              y: ensureNumber(commandValue[2], current.y),
            }
          : {
              x: current.x + ensureNumber(commandValue[1], 0),
              y: current.y + ensureNumber(commandValue[2], 0),
            };
      subpathStart = current;
      previousCubicControl = null;
      previousQuadraticControl = null;
      pushPoint(current);
      continue;
    }

    if (!subpathStart) {
      subpathStart = current;
      pushPoint(current);
    }

    if (command === "L" || command === "l") {
      current =
        command === "L"
          ? {
              x: ensureNumber(commandValue[1], current.x),
              y: ensureNumber(commandValue[2], current.y),
            }
          : {
              x: current.x + ensureNumber(commandValue[1], 0),
              y: current.y + ensureNumber(commandValue[2], 0),
            };
      previousCubicControl = null;
      previousQuadraticControl = null;
      pushPoint(current);
      continue;
    }

    if (command === "H" || command === "h") {
      current =
        command === "H"
          ? { x: ensureNumber(commandValue[1], current.x), y: current.y }
          : { x: current.x + ensureNumber(commandValue[1], 0), y: current.y };
      previousCubicControl = null;
      previousQuadraticControl = null;
      pushPoint(current);
      continue;
    }

    if (command === "V" || command === "v") {
      current =
        command === "V"
          ? { x: current.x, y: ensureNumber(commandValue[1], current.y) }
          : { x: current.x, y: current.y + ensureNumber(commandValue[1], 0) };
      previousCubicControl = null;
      previousQuadraticControl = null;
      pushPoint(current);
      continue;
    }

    if (command === "C" || command === "c") {
      const control1 =
        command === "C"
          ? {
              x: ensureNumber(commandValue[1], current.x),
              y: ensureNumber(commandValue[2], current.y),
            }
          : {
              x: current.x + ensureNumber(commandValue[1], 0),
              y: current.y + ensureNumber(commandValue[2], 0),
            };
      const control2 =
        command === "C"
          ? {
              x: ensureNumber(commandValue[3], current.x),
              y: ensureNumber(commandValue[4], current.y),
            }
          : {
              x: current.x + ensureNumber(commandValue[3], 0),
              y: current.y + ensureNumber(commandValue[4], 0),
            };
      const to =
        command === "C"
          ? {
              x: ensureNumber(commandValue[5], current.x),
              y: ensureNumber(commandValue[6], current.y),
            }
          : {
              x: current.x + ensureNumber(commandValue[5], 0),
              y: current.y + ensureNumber(commandValue[6], 0),
            };
      for (const point of sampleCubic(current, control1, control2, to)) {
        pushPoint(point);
      }
      current = to;
      previousCubicControl = control2;
      previousQuadraticControl = null;
      continue;
    }

    if (command === "S" || command === "s") {
      const control1 = reflectControlPoint(previousCubicControl, current);
      const control2 =
        command === "S"
          ? {
              x: ensureNumber(commandValue[1], current.x),
              y: ensureNumber(commandValue[2], current.y),
            }
          : {
              x: current.x + ensureNumber(commandValue[1], 0),
              y: current.y + ensureNumber(commandValue[2], 0),
            };
      const to =
        command === "S"
          ? {
              x: ensureNumber(commandValue[3], current.x),
              y: ensureNumber(commandValue[4], current.y),
            }
          : {
              x: current.x + ensureNumber(commandValue[3], 0),
              y: current.y + ensureNumber(commandValue[4], 0),
            };
      for (const point of sampleCubic(current, control1, control2, to)) {
        pushPoint(point);
      }
      current = to;
      previousCubicControl = control2;
      previousQuadraticControl = null;
      continue;
    }

    if (command === "Q" || command === "q") {
      const control =
        command === "Q"
          ? {
              x: ensureNumber(commandValue[1], current.x),
              y: ensureNumber(commandValue[2], current.y),
            }
          : {
              x: current.x + ensureNumber(commandValue[1], 0),
              y: current.y + ensureNumber(commandValue[2], 0),
            };
      const to =
        command === "Q"
          ? {
              x: ensureNumber(commandValue[3], current.x),
              y: ensureNumber(commandValue[4], current.y),
            }
          : {
              x: current.x + ensureNumber(commandValue[3], 0),
              y: current.y + ensureNumber(commandValue[4], 0),
            };
      for (const point of sampleQuadratic(current, control, to)) {
        pushPoint(point);
      }
      current = to;
      previousCubicControl = null;
      previousQuadraticControl = control;
      continue;
    }

    if (command === "T" || command === "t") {
      const control = reflectControlPoint(previousQuadraticControl, current);
      const to =
        command === "T"
          ? {
              x: ensureNumber(commandValue[1], current.x),
              y: ensureNumber(commandValue[2], current.y),
            }
          : {
              x: current.x + ensureNumber(commandValue[1], 0),
              y: current.y + ensureNumber(commandValue[2], 0),
            };
      for (const point of sampleQuadratic(current, control, to)) {
        pushPoint(point);
      }
      current = to;
      previousCubicControl = null;
      previousQuadraticControl = control;
      continue;
    }

    if (command === "A" || command === "a") {
      current =
        command === "A"
          ? {
              x: ensureNumber(args[6], current.x),
              y: ensureNumber(args[7], current.y),
            }
          : {
              x: current.x + ensureNumber(args[6], 0),
              y: current.y + ensureNumber(args[7], 0),
            };
      previousCubicControl = null;
      previousQuadraticControl = null;
      pushPoint(current);
      continue;
    }

    if (command === "Z" || command === "z") {
      if (subpathStart) {
        pushPoint(subpathStart);
        current = subpathStart;
      }
      previousCubicControl = null;
      previousQuadraticControl = null;
      pushPolyline();
    }
  }

  pushPolyline();
  return polylines;
}

function getObjectOutlinePolylines(obj: FabricObject): Point2D[][] {
  if (obj instanceof Path) {
    const pathPolylines = getPathPolylines(obj);
    if (pathPolylines.length > 0) return pathPolylines;
  }

  const coords = obj.getCoords().map((point) => ({ x: point.x, y: point.y }));
  if (coords.length < 2) return [];
  return [coords];
}

function isLassoHitObject(points: Point2D[], obj: FabricObject) {
  if (!obj.visible) return false;

  const lassoSegments = getPolylineSegments(points, false);
  if (lassoSegments.length === 0) return false;

  const outlinePolylines = getObjectOutlinePolylines(obj);
  const strokeWidth = ensureNumber(
    (obj as FabricObject & { strokeWidth?: unknown }).strokeWidth,
    1,
  );
  const tolerance = Math.max(3, strokeWidth / 2 + 1);

  for (const polyline of outlinePolylines) {
    const outlineSegments = getPolylineSegments(
      polyline,
      !(obj instanceof Path),
    );
    for (const lassoSegment of lassoSegments) {
      for (const outlineSegment of outlineSegments) {
        if (
          distanceBetweenSegments(lassoSegment, outlineSegment) <= tolerance
        ) {
          return true;
        }
      }
    }
  }

  return false;
}

function createSelectionToolController(
  id: "select-box",
  cursor: "default",
): ToolController {
  return {
    id,
    activate({ canvas }: ToolControllerContext) {
      canvas.defaultCursor = cursor;
      canvas.isDrawingMode = false;
      canvas.selection = true;
      canvas.skipTargetFind = false;

      return () => {
        canvas.isDrawingMode = false;
        canvas.skipTargetFind = false;
        canvas.selection = true;
      };
    },
  };
}

const selectLassoToolController: ToolController = {
  id: "select-lasso",
  activate({ canvas, editor, onSelectLassoGesture }: ToolControllerContext) {
    canvas.defaultCursor = "crosshair";
    canvas.isDrawingMode = false;
    canvas.selection = false;
    // Allow normal Fabric interactions (select/move/scale) when clicking objects/controls.
    // Only start drawing the lasso when the user presses on empty space.
    canvas.skipTargetFind = false;

    let preview: Polyline | null = null;
    let points: Point2D[] = [];
    let isDrawing = false;

    const removePreview = () => {
      if (!preview) return;
      canvas.remove(preview);
      preview = null;
    };

    const updatePreview = () => {
      removePreview();
      if (points.length === 0) return;
      preview = buildPreviewPolyline(points);
      canvas.add(preview);
      canvas.renderAll();
    };

    const commitSelection = () => {
      const selected = canvas
        .getObjects()
        .filter(
          (obj): obj is FabricObject =>
            obj !== preview &&
            Boolean(getNodeIdFromObject(obj)) &&
            isLassoHitObject(points, obj),
        );

      canvas.discardActiveObject();
      if (selected.length === 1) {
        canvas.setActiveObject(selected[0]);
      } else if (selected.length > 1) {
        canvas.setActiveObject(new ActiveSelection(selected, { canvas }));
      }

      editor.edit.act({
        type: "SET_SELECTION",
        payload: {
          nodeIds: selected
            .map((obj) => getNodeIdFromObject(obj))
            .filter((id): id is string => Boolean(id)),
        },
      });
      canvas.renderAll();
    };

    const onMouseDown = (opt: FabricMouseDownEvent) => {
      if (opt.target) return;
      isDrawing = true;
      points = [toPoint2D(opt.scenePoint)];
      updatePreview();
    };

    const onMouseMove = (opt: FabricMouseMoveEvent) => {
      if (!isDrawing) return;
      appendPoint(points, toPoint2D(opt.scenePoint, points[points.length - 1]));
      updatePreview();
    };

    const onMouseUp = () => {
      if (!isDrawing) return;
      isDrawing = false;
      if (points.length > 1) {
        if (onSelectLassoGesture?.(points.map((point) => ({ ...point })))) {
          canvas.discardActiveObject();
          editor.edit.act({ type: "SET_SELECTION", payload: { nodeIds: [] } });
          points = [];
          removePreview();
          canvas.renderAll();
          return;
        }
        commitSelection();
      } else {
        canvas.discardActiveObject();
        editor.edit.act({ type: "SET_SELECTION", payload: { nodeIds: [] } });
      }
      points = [];
      removePreview();
      canvas.renderAll();
    };

    canvas.on("mouse:down", onMouseDown);
    canvas.on("mouse:move", onMouseMove);
    canvas.on("mouse:up", onMouseUp);

    return () => {
      removePreview();
      canvas.off("mouse:down", onMouseDown);
      canvas.off("mouse:move", onMouseMove);
      canvas.off("mouse:up", onMouseUp);
      canvas.isDrawingMode = false;
      canvas.skipTargetFind = false;
      canvas.selection = true;
    };
  },
};

const drawTextToolController: ToolController = {
  id: "draw-text",
  activate({ canvas, editor }: ToolControllerContext) {
    canvas.defaultCursor = "text";
    canvas.isDrawingMode = false;
    canvas.selection = false;
    canvas.skipTargetFind = true;

    const onMouseDown = (opt: FabricMouseDownEvent) => {
      if (opt.target) return;

      const point = opt.scenePoint;
      const left = ensureNumber(point?.x, 120);
      const top = ensureNumber(point?.y, 120);

      const node = createTextboxNode({ left, top });
      editor.edit.execute(createCommand("新增节点", { node }), "创建文本");
    };

    canvas.on("mouse:down", onMouseDown);

    return () => {
      canvas.off("mouse:down", onMouseDown);
      canvas.isDrawingMode = false;
      canvas.skipTargetFind = false;
      canvas.selection = true;
    };
  },
};

const drawLineToolController: ToolController = {
  id: "draw-line",
  activate({ canvas, editor }: ToolControllerContext) {
    canvas.defaultCursor = "crosshair";
    canvas.selection = false;
    canvas.skipTargetFind = true;
    canvas.isDrawingMode = false;

    let start: { x: number; y: number } | null = null;
    let preview: Line | null = null;

    const removePreview = () => {
      if (!preview) return;
      canvas.remove(preview);
      preview = null;
    };

    const onMouseDown = (opt: FabricMouseDownEvent) => {
      if (opt.target) return;
      const p = opt.scenePoint;
      start = { x: ensureNumber(p?.x, 0), y: ensureNumber(p?.y, 0) };
      removePreview();

      preview = new Line([start.x, start.y, start.x, start.y], {
        stroke: "#111827",
        strokeWidth: 2,
        selectable: false,
        evented: false,
      } as never);
      canvas.add(preview);
    };

    const onMouseMove = (opt: FabricMouseMoveEvent) => {
      if (!start || !preview) return;
      const p = opt.scenePoint;
      const endX = ensureNumber(p?.x, start.x);
      const endY = ensureNumber(p?.y, start.y);
      preview.set({
        x1: start.x,
        y1: start.y,
        x2: endX,
        y2: endY,
      });
      preview.setCoords();
      canvas.renderAll();
    };

    const onMouseUp = (opt: FabricMouseUpEvent) => {
      if (!start) return;
      const p = opt.scenePoint;
      const end = {
        x: ensureNumber(p?.x, start.x),
        y: ensureNumber(p?.y, start.y),
      };
      const startX = start.x;
      const startY = start.y;
      start = null;
      removePreview();

      const minX = Math.min(startX, end.x);
      const minY = Math.min(startY, end.y);
      const pathData = `M ${startX - minX} ${startY - minY} L ${end.x - minX} ${end.y - minY}`;

      const path = new Path(
        pathData as never,
        {
          left: minX,
          top: minY,
          stroke: "#111827",
          strokeWidth: 2,
          fill: null,
          originX: "left",
          originY: "top",
        } as never,
      );

      const node = createPathNodeFromFabricPath(
        path,
        editor.data.getState().scene.order.length,
      );
      node.name = "非车线直线";
      editor.edit.execute(createCommand("新增节点", { node }), "创建直线");
    };
    canvas.on("mouse:down", onMouseDown);
    canvas.on("mouse:move", onMouseMove);
    canvas.on("mouse:up", onMouseUp);

    return () => {
      removePreview();
      canvas.off("mouse:down", onMouseDown);
      canvas.off("mouse:move", onMouseMove);
      canvas.off("mouse:up", onMouseUp);
      canvas.isDrawingMode = false;
      canvas.skipTargetFind = false;
      canvas.selection = true;
    };
  },
};

const drawPathToolController: ToolController = {
  id: "draw-path",
  activate({ canvas, editor }: ToolControllerContext) {
    canvas.defaultCursor = "crosshair";
    canvas.selection = false;
    canvas.skipTargetFind = true;
    canvas.isDrawingMode = true;

    const brush = new PencilBrush(canvas);
    brush.width = 2;
    brush.color = "#111827";
    canvas.freeDrawingBrush = brush;

    const onPathCreated = (opt: FabricPathCreatedEvent) => {
      const path = opt.path;
      if (!(path instanceof Path)) return;

      const node = createPathNodeFromFabricPath(
        path,
        editor.data.getState().scene.order.length,
      );
      if (node.fabricObject.type === "path" && !node.fabricObject.path) {
        // If we can't extract path data reliably, keep the original Fabric object
        // instead of removing it and ending up with a "disappearing" stroke.
        return;
      }
      canvas.remove(path);
      editor.edit.execute(createCommand("新增节点", { node }), "创建曲线");
    };

    canvas.on("path:created", onPathCreated);

    return () => {
      canvas.off("path:created", onPathCreated);
      canvas.isDrawingMode = false;
      canvas.skipTargetFind = false;
      canvas.selection = true;
    };
  },
};

const drawBezierToolController: ToolController = {
  id: "draw-bezier",
  activate({ canvas, editor }: ToolControllerContext) {
    canvas.defaultCursor = "crosshair";
    canvas.selection = false;
    canvas.skipTargetFind = true;
    canvas.isDrawingMode = false;

    let startPoint: Point2D | null = null;
    let endPoint: Point2D | null = null;
    let previewCurve: Polyline | null = null;
    let previewGuide: Polyline | null = null;

    const removePreview = () => {
      if (previewGuide) {
        canvas.remove(previewGuide);
        previewGuide = null;
      }
      if (previewCurve) {
        canvas.remove(previewCurve);
        previewCurve = null;
      }
      canvas.renderAll();
    };

    const renderLinePreview = (points: Point2D[]) => {
      removePreview();
      if (points.length < 2) return;
      previewCurve = buildPreviewPolyline(points);
      canvas.add(previewCurve);
      canvas.renderAll();
    };

    const renderQuadraticPreview = (
      from: Point2D,
      control: Point2D,
      to: Point2D,
    ) => {
      removePreview();
      previewGuide = buildPreviewPolyline([from, control, to], {
        stroke: "#94a3b8",
        strokeWidth: 1,
        strokeDashArray: [6, 4],
        opacity: 0.95,
      });
      previewCurve = buildPreviewPolyline([
        from,
        ...sampleQuadratic(from, control, to),
      ]);
      canvas.add(previewGuide);
      canvas.add(previewCurve);
      canvas.renderAll();
    };

    const resetDrawing = () => {
      startPoint = null;
      endPoint = null;
      removePreview();
    };

    const onMouseMove = (opt: FabricMouseMoveEvent) => {
      const pointer = toPoint2D(
        opt.scenePoint,
        endPoint ?? startPoint ?? { x: 0, y: 0 },
      );
      if (!startPoint) return;
      if (!endPoint) {
        renderLinePreview([startPoint, pointer]);
        return;
      }
      renderQuadraticPreview(startPoint, pointer, endPoint);
    };

    const onMouseDown = (opt: FabricMouseDownEvent) => {
      const pointer = toPoint2D(opt.scenePoint);
      if (!startPoint) {
        startPoint = pointer;
        renderLinePreview([startPoint, startPoint]);
        return;
      }

      if (!endPoint) {
        if (distanceBetweenPoints(startPoint, pointer) < 2) return;
        endPoint = pointer;
        renderLinePreview([startPoint, endPoint]);
        return;
      }

      const controlPoint = pointer;
      const minX = Math.min(startPoint.x, controlPoint.x, endPoint.x);
      const minY = Math.min(startPoint.y, controlPoint.y, endPoint.y);
      const pathData = `M ${startPoint.x - minX} ${startPoint.y - minY} Q ${controlPoint.x - minX} ${controlPoint.y - minY} ${endPoint.x - minX} ${endPoint.y - minY}`;

      const path = new Path(
        pathData as never,
        {
          left: minX,
          top: minY,
          stroke: "#111827",
          strokeWidth: 2,
          fill: null,
          originX: "left",
          originY: "top",
        } as never,
      );

      const node = createPathNodeFromFabricPath(
        path,
        editor.data.getState().scene.order.length,
      );
      node.name = "非车线贝塞尔曲线";
      editor.edit.execute(
        createCommand("新增节点", { node }),
        "创建贝塞尔曲线",
      );
      resetDrawing();
    };

    const onCancelDrawing = () => {
      resetDrawing();
    };

    canvas.on("mouse:down", onMouseDown);
    canvas.on("mouse:move", onMouseMove);
    window.addEventListener(CANCEL_ACTIVE_DRAWING_EVENT, onCancelDrawing);

    return () => {
      resetDrawing();
      canvas.off("mouse:down", onMouseDown);
      canvas.off("mouse:move", onMouseMove);
      window.removeEventListener(CANCEL_ACTIVE_DRAWING_EVENT, onCancelDrawing);
      canvas.isDrawingMode = false;
      canvas.skipTargetFind = false;
      canvas.selection = true;
    };
  },
};

export function registerDefaultFabricToolControllers(
  registry: ToolControllerRegistry,
) {
  registry.register(createSelectionToolController("select-box", "default"));
  registry.register(selectLassoToolController);
  registry.register(drawTextToolController);
  registry.register(drawLineToolController);
  registry.register(drawPathToolController);
  registry.register(drawBezierToolController);
}
