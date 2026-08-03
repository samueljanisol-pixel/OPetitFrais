import { Suspense } from "react";
import { CircularProgress, Box } from "@mui/material";
import PlanningClient from "./PlanningClient";

export default function PlanningPage() {
  return (
    <Suspense
      fallback={
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress />
        </Box>
      }
    >
      <PlanningClient />
    </Suspense>
  );
}
