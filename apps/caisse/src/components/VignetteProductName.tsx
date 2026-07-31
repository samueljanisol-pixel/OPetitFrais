import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { Typography, type TypographyProps } from "@mui/material";

type Props = {
  text: string;
  maxFontSize?: number;
  minFontSize?: number;
  fontWeight?: number;
  lineHeight?: number;
  sx?: TypographyProps["sx"];
};

/** Texte vignette : réduit la police jusqu'à afficher tout le libellé (sans ellipsis). */
export default function VignetteProductName({
  text,
  maxFontSize = 11,
  minFontSize = 6.5,
  fontWeight = 700,
  lineHeight = 1.15,
  sx,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [fontSize, setFontSize] = useState(maxFontSize);

  const fitText = useCallback(() => {
    const container = containerRef.current;
    const textEl = textRef.current;
    if (!container || !textEl) return;

    const maxHeight = container.clientHeight;
    if (maxHeight <= 0) return;

    let size = maxFontSize;
    while (size > minFontSize) {
      textEl.style.fontSize = `${size}px`;
      if (textEl.scrollHeight <= maxHeight + 1) break;
      size -= 0.5;
    }

    textEl.style.fontSize = "";
    setFontSize(size);
  }, [maxFontSize, minFontSize, text]);

  useLayoutEffect(() => {
    fitText();
  }, [fitText]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      fitText();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [fitText]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        minHeight: 0,
        overflow: "hidden",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
    >
      <Typography
        variant="caption"
        component="div"
        sx={{
          fontSize,
          fontWeight,
          lineHeight,
          width: "100%",
          textAlign: "center",
          wordBreak: "break-word",
          hyphens: "auto",
          ...sx,
        }}
      >
        <span ref={textRef} style={{ display: "block", fontSize: "inherit", lineHeight: "inherit" }}>
          {text}
        </span>
      </Typography>
    </div>
  );
}
