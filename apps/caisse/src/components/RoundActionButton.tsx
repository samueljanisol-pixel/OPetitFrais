import { Button, Tooltip } from "@mui/material";
import type { ReactNode } from "react";

type Props = {
  onClick: () => void;
  disabled?: boolean;
  color?: "primary" | "secondary" | "warning" | "error" | "success" | "info";
  title?: string;
  children: ReactNode;
  size?: number;
  fullWidth?: boolean;
};

export default function RoundActionButton({
  onClick,
  disabled = false,
  color = "primary",
  title,
  children,
  size = 56,
  fullWidth = false,
}: Props) {
  const button = (
    <Button
      variant="contained"
      color={color}
      disabled={disabled}
      sx={{
        width: fullWidth ? "100%" : size,
        height: size,
        minWidth: fullWidth ? 0 : size,
        borderRadius: fullWidth ? 1 : "50%",
        p: 0,
        flexShrink: 0,
      }}
      onClick={onClick}
    >
      {children}
    </Button>
  );

  if (title) {
    return (
      <Tooltip title={title} placement="left">
        <span style={fullWidth ? { display: "block", width: "100%" } : undefined}>{button}</span>
      </Tooltip>
    );
  }

  return button;
}
