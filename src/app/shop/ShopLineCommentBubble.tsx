"use client";

import { Box, Typography } from "@mui/material";

type Props = {
  comment: string;
  onClick?: () => void;
  maxWidth?: number | string;
};

/** Bulle d’info à gauche du bouton commentaire (vignette + panier). */
export default function ShopLineCommentBubble({
  comment,
  onClick,
  maxWidth = 120,
}: Props) {
  const trimmed = comment.trim();
  if (!trimmed) return null;

  return (
    <Box
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      sx={{
        position: "relative",
        maxWidth,
        px: 0.75,
        py: 0.375,
        borderRadius: 1,
        bgcolor: "rgba(236, 253, 245, 0.96)",
        border: "1px solid",
        borderColor: "success.light",
        boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
        cursor: onClick ? "pointer" : "default",
        flexShrink: 1,
        minWidth: 0,
        "&::after": {
          content: '""',
          position: "absolute",
          top: "50%",
          right: -5,
          width: 8,
          height: 8,
          bgcolor: "rgba(236, 253, 245, 0.96)",
          borderTop: "1px solid",
          borderRight: "1px solid",
          borderColor: "success.light",
          transform: "translateY(-50%) rotate(45deg)",
        },
      }}
    >
      <Typography
        variant="caption"
        color="success.dark"
        sx={{
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          fontSize: "0.58rem",
          lineHeight: 1.25,
          fontStyle: "italic",
        }}
      >
        {trimmed}
      </Typography>
    </Box>
  );
}
