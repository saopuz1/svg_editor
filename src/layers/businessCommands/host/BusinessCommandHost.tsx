import { ExtractCarlineHost } from "./ExtractCarlineHost";
import { MarkGearHost } from "./MarkGearHost";
import { MarkOddEvenHost } from "./MarkOddEvenHost";
import type {
  BusinessCommandCanvasHostProps,
  BusinessCommandId,
} from "./businessCommandHostShared";

interface BusinessCommandHostProps extends BusinessCommandCanvasHostProps {
  kind: BusinessCommandId | null;
}

export function BusinessCommandHost({
  kind,
  ...props
}: BusinessCommandHostProps) {
  switch (kind) {
    case "extract-carline":
      return <ExtractCarlineHost {...props} />;
    case "mark-gear":
      return <MarkGearHost {...props} />;
    case "mark-odd-even":
      return <MarkOddEvenHost {...props} />;
    default:
      return null;
  }
}
