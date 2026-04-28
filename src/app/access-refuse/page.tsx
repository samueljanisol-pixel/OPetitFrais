import { Typography, Button } from "@mui/material";

export default function AccessRefusePage() {
  return (
    <main className="min-h-[calc(100vh-0px)] flex items-center justify-center bg-gradient-to-br from-rose-50 via-white to-slate-50 px-6 py-16">
      <div className="flex max-w-md flex-col items-center gap-2 text-center">
        <Typography variant="h5" component="h1" className="!font-semibold !text-slate-900">
          Accès refusé
        </Typography>
        <Typography variant="body2" className="!text-slate-600">
          Votre compte ne dispose pas des droits nécessaires pour cette page. Contactez un administrateur.
        </Typography>
        <Button href="/" variant="contained" color="success" sx={{ borderRadius: 3, textTransform: "none" }}>
          Retour à l&apos;accueil
        </Button>
      </div>
    </main>
  );
}
