import type { DocumentState } from "../data/types";
import type {
  ExtractCarlineSession,
  MarkGearSession,
  MarkOddEvenSession,
} from "../businessCommands/businessCommandTypes";
import {
  applyExtractCarlineSession,
  buildExtractCarlinePreviewDocument,
} from "../businessCommands/extractCarlinePreview";
import { createExtractCarlineSessionFromDocument } from "../businessCommands/extractCarlineSession";
import {
  applyMarkGearSession,
  buildMarkGearPreviewDocument,
} from "../businessCommands/markGearPreview";
import { createMarkGearSession } from "../businessCommands/markGearSession";
import {
  applyMarkOddEvenSession,
  buildMarkOddEvenPreviewDocument,
  createMarkOddEvenSession,
} from "../businessCommands/markOddEvenSession";
import {
  resetDocumentForExtractCarline,
  resetDocumentForMarkGear,
  resetDocumentForMarkOddEven,
} from "../businessCommands/businessCommandReset";

export type BusinessCommandId =
  | "extract-carline"
  | "mark-gear"
  | "mark-odd-even";

export type ActiveBusinessCommandState =
  | {
      kind: "extract-carline";
      session: ExtractCarlineSession;
    }
  | {
      kind: "mark-gear";
      session: MarkGearSession;
    }
  | {
      kind: "mark-odd-even";
      session: MarkOddEvenSession;
    };

export function createBusinessCommandState(
  kind: BusinessCommandId,
  document: DocumentState,
): ActiveBusinessCommandState {
  switch (kind) {
    case "extract-carline":
      return {
        kind,
        session: createExtractCarlineSessionFromDocument(document),
      };
    case "mark-gear":
      return {
        kind,
        session: createMarkGearSession(document),
      };
    case "mark-odd-even":
      return {
        kind,
        session: createMarkOddEvenSession(document),
      };
  }
}

export function buildBusinessCommandPreviewDocument(
  base: DocumentState,
  state: ActiveBusinessCommandState | null,
): DocumentState {
  if (!state) return base;

  switch (state.kind) {
    case "extract-carline":
      return buildExtractCarlinePreviewDocument(base, state.session).document;
    case "mark-gear":
      return buildMarkGearPreviewDocument(base, state.session).document;
    case "mark-odd-even":
      return buildMarkOddEvenPreviewDocument(base, state.session).document;
  }
}

export function applyBusinessCommandState(
  base: DocumentState,
  state: ActiveBusinessCommandState,
): DocumentState {
  switch (state.kind) {
    case "extract-carline":
      return applyExtractCarlineSession(base, state.session);
    case "mark-gear":
      return applyMarkGearSession(base, state.session);
    case "mark-odd-even":
      return applyMarkOddEvenSession(base, state.session);
  }
}

export function resetDocumentForBusinessCommand(
  base: DocumentState,
  kind: BusinessCommandId,
): DocumentState {
  switch (kind) {
    case "extract-carline":
      return resetDocumentForExtractCarline(base);
    case "mark-gear":
      return resetDocumentForMarkGear(base);
    case "mark-odd-even":
      return resetDocumentForMarkOddEven(base);
  }
}
