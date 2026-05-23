"use client";

import { useTranslations } from "next-intl";
import { Typography, Button } from "@mui/material";

export default function AccessRefusePage() {
  const t = useTranslations("backoffice.accessDenied");

  return (
    <main className="min-h-[calc(100vh-0px)] flex items-center justify-center bg-gradient-to-br from-rose-50 via-white to-slate-50 px-6 py-16">
      <div className="flex max-w-md flex-col items-center gap-2 text-center">
        <Typography variant="h5" component="h1" className="!font-semibold !text-slate-900">
          {t("title")}
        </Typography>
        <Typography variant="body2" className="!text-slate-600">
          {t("body")}
        </Typography>
        <Button href="/" variant="contained" color="success" sx={{ borderRadius: 3, textTransform: "none" }}>
          {t("backHome")}
        </Button>
      </div>
    </main>
  );
}
