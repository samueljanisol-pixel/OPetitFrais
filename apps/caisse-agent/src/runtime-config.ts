/** Surcharges en mémoire (POST /config depuis la caisse). */
let scalePortOverride: string | undefined;
let ticketPrinterOverride: string | undefined;

export function setRuntimeHardwareConfig(partial: {
  scalePort?: string;
  ticketPrinter?: string;
}): void {
  if (partial.scalePort !== undefined) {
    const trimmed = partial.scalePort.trim();
    scalePortOverride = trimmed.length > 0 ? trimmed : undefined;
  }
  if (partial.ticketPrinter !== undefined) {
    const trimmed = partial.ticketPrinter.trim();
    ticketPrinterOverride = trimmed.length > 0 ? trimmed : undefined;
  }
}

export function getRuntimeScalePort(): string | undefined {
  return scalePortOverride;
}

export function getRuntimeTicketPrinter(): string | undefined {
  return ticketPrinterOverride;
}
