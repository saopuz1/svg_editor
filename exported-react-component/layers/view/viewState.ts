export interface LineVisibilityToggle {
  非车线: boolean;
  车线: boolean;
}

export interface AnnotationTextVisibilityToggle {
  车线编号: boolean;
  区域: boolean;
  档位: boolean;
  单双: boolean;
  DML: boolean;
}

export interface OriginalTextVisibilityToggle {
  原文本: boolean;
}

export interface ViewState {
  线条: LineVisibilityToggle;
  文本: OriginalTextVisibilityToggle;
  标注文本: AnnotationTextVisibilityToggle;
}

export const DEFAULT_VIEW_STATE: ViewState = {
  线条: {
    非车线: true,
    车线: true,
  },
  文本: {
    原文本: true,
  },
  标注文本: {
    车线编号: true,
    区域: true,
    档位: true,
    单双: true,
    DML: true,
  },
};
