import { Button, Typography } from "@mui/material";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Typography variant="subtitle1" className="!font-semibold !text-slate-900">
            Administration
          </Typography>
          <div className="flex flex-wrap gap-1">
            <Button href="/admin/utilisateurs" size="small" variant="text" sx={{ textTransform: "none" }}>
              Utilisateurs
            </Button>
            <Button href="/admin/roles" size="small" variant="text" sx={{ textTransform: "none" }}>
              Rôles & accès
            </Button>
            <Button href="/" size="small" variant="outlined" color="success" sx={{ textTransform: "none" }}>
              Accueil
            </Button>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-4 py-6">{children}</div>
    </div>
  );
}
