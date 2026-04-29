export interface ElementVisibilityToggle {
  未标记: boolean;
  车线: boolean;
}

export interface AnnotationVisibilityToggle {
  车线编号: boolean;
  区域: boolean;
  档位: boolean;
  单双: boolean;
  DML: boolean;
}

export interface ViewState {
  元素: ElementVisibilityToggle;
  标注: AnnotationVisibilityToggle;
}

export const DEFAULT_VIEW_STATE: ViewState = {
  元素: {
    未标记: true,
    车线: true,
  },
  标注: {
    车线编号: true,
    区域: true,
    档位: true,
    单双: true,
    DML: true,
  },
};
