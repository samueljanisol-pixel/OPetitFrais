"use client";

import { Box, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import type { SaisieCommentEntry } from "@/lib/commandes-fournisseur/ligne-saisie-comments";

type Props = {
  comments: SaisieCommentEntry[];
  /** Commentaire saisi sur la commande magasin (récap), affiché en premier si présent. */
  lineComment?: string | null;
  /** `chip` : pastille mise en valeur (récap à droite). */
  variant?: "default" | "chip";
  className?: string;
};

function CommentChip({ text, magasinPrefix }: { text: string; magasinPrefix?: string }) {
  return (
    <Box
      sx={{
        px: 1,
        py: 0.5,
        borderRadius: 1,
        maxWidth: { xs: "10.5rem", sm: "14rem" },
        bgcolor: (t) =>
          t.palette.mode === "dark"
            ? alpha(t.palette.info.main, 0.22)
            : alpha(t.palette.info.main, 0.14),
        border: 1,
        borderColor: (t) => alpha(t.palette.info.main, 0.35),
      }}
    >
      <Typography
        variant="caption"
        component="p"
        className="!m-0 whitespace-pre-wrap"
        sx={{
          fontWeight: 600,
          color: (t) => (t.palette.mode === "dark" ? t.palette.info.light : t.palette.info.dark),
          lineHeight: 1.35,
        }}
      >
        {magasinPrefix ? (
          <>
            <Box component="span" sx={{ fontWeight: 700 }}>
              {magasinPrefix}
            </Box>
            {" : "}
            {text}
          </>
        ) : (
          text
        )}
      </Typography>
    </Box>
  );
}

/** Affiche commentaire(s) de saisie sous une ligne produit (achat ou récap). */
export default function LigneSaisieComments({
  comments,
  lineComment,
  variant = "default",
  className,
}: Props) {
  const trimmedLine =
    typeof lineComment === "string" && lineComment.trim().length > 0
      ? lineComment.trim()
      : null;
  const hasSaisie = comments.length > 0;

  if (!trimmedLine && !hasSaisie) {
    return null;
  }

  if (variant === "chip") {
    return (
      <div className={className ?? "min-w-0"}>
        {trimmedLine ? <CommentChip text={trimmedLine} /> : null}
        {comments.map((c, idx) => (
          <Box key={`${c.magasinLabel}-${idx}`} className={trimmedLine || idx > 0 ? "!mt-1" : undefined}>
            <CommentChip
              text={c.comment}
              magasinPrefix={comments.length > 1 || trimmedLine ? c.magasinLabel : undefined}
            />
          </Box>
        ))}
      </div>
    );
  }

  return (
    <div className={className ?? "!mt-1 w-full min-w-0"}>
      {trimmedLine ? (
        <Typography
          variant="caption"
          color="text.secondary"
          component="p"
          className="!m-0 whitespace-pre-wrap"
        >
          {trimmedLine}
        </Typography>
      ) : null}
      {comments.map((c, idx) => (
        <Typography
          key={`${c.magasinLabel}-${idx}`}
          variant="caption"
          color="text.secondary"
          component="p"
          className="!m-0 whitespace-pre-wrap"
        >
          {comments.length > 1 || trimmedLine ? (
            <>
              <span className="font-medium">{c.magasinLabel}</span>
              {" : "}
              {c.comment}
            </>
          ) : (
            c.comment
          )}
        </Typography>
      ))}
    </div>
  );
}
