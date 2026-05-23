import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { normalizeLocale, defaultTimeZone } from "@/i18n/config";
import { LOCALE_COOKIE_NAME } from "@/lib/i18n/locale-cookie";

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const locale = normalizeLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);

  return {
    locale,
    timeZone: defaultTimeZone,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
