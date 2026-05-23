import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { useLocale } from "next-intl";
import { isRtl, type AppLocale } from "@/i18n/config";

export function useBackChevronIcon() {
  const locale = useLocale() as AppLocale;
  return isRtl(locale) ? ChevronRightIcon : ChevronLeftIcon;
}
