import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { normalizeLocale, defaultTimeZone } from "@/i18n/config";
import { LOCALE_COOKIE_NAME } from "@/lib/i18n/locale-cookie";
import { applyMessageOverrides, getBaseMessages } from "@/lib/i18n/message-catalog";
import { loadServerOverrides } from "@/lib/i18n/server-overrides";

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const locale = normalizeLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
  const overrides = await loadServerOverrides(locale);
  const messages = applyMessageOverrides(getBaseMessages(locale), overrides);

  return {
    locale,
    timeZone: defaultTimeZone,
    messages,
  };
});
