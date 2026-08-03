"use client";

import {
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Typography,
} from "@mui/material";
import { formatSalariesSiteLabel, type SalariesSite } from "@/lib/salaries/sites";

type Props = {
  sites: SalariesSite[];
  value: string;
  onChange: (siteId: string) => void;
  label: string;
  selectId: string;
  minWidth?: number;
};

export default function SalariesSiteSelect({
  sites,
  value,
  onChange,
  label,
  selectId,
  minWidth = 260,
}: Props) {
  if (sites.length === 0) return null;

  if (sites.length === 1) {
    const only = sites[0]!;
    return <Typography variant="body2">{formatSalariesSiteLabel(only)}</Typography>;
  }

  return (
    <FormControl size="small" sx={{ minWidth }}>
      <InputLabel id={selectId}>{label}</InputLabel>
      <Select
        labelId={selectId}
        label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {sites.map((s) => (
          <MenuItem key={s.id} value={s.id}>
            {formatSalariesSiteLabel(s)}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
