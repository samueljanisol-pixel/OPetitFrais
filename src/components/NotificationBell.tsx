"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Badge,
  Box,
  Button,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Menu,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import NotificationsOutlinedIcon from "@mui/icons-material/NotificationsOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import AppLink from "@/components/AppLink";
import { useSessionPermissions } from "@/lib/auth/useSessionPermissions";
import { useNotifications, type ClientNotification } from "@/lib/notifications/useNotifications";
import { useAppFormat } from "@/lib/i18n/useAppFormat";

function NotificationListContent({
  notifications,
  loading,
  unreadCount,
  onItemClick,
  onMarkAllRead,
  onClose,
  t,
  formatDateTime,
}: {
  notifications: ClientNotification[];
  loading: boolean;
  unreadCount: number;
  onItemClick: (n: ClientNotification) => void;
  onMarkAllRead: () => void;
  onClose: () => void;
  t: ReturnType<typeof useTranslations<"backoffice.notifications">>;
  formatDateTime: (value: Date | string | number) => string;
}) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", maxHeight: { xs: "70vh", sm: 420 }, minWidth: { sm: 320 } }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 2,
          py: 1.5,
          gap: 1,
        }}
      >
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          {t("title")}
        </Typography>
        {unreadCount > 0 ? (
          <Button size="small" onClick={() => void onMarkAllRead()} sx={{ textTransform: "none", minHeight: 44 }}>
            {t("markAllRead")}
          </Button>
        ) : null}
      </Box>
      <Divider />
      {loading && notifications.length === 0 ? (
        <Typography sx={{ p: 2, color: "text.secondary" }}>{t("loading")}</Typography>
      ) : notifications.length === 0 ? (
        <Typography sx={{ p: 2, color: "text.secondary" }}>{t("empty")}</Typography>
      ) : (
        <List dense disablePadding sx={{ overflow: "auto", flex: 1 }}>
          {notifications.map((n) => (
            <ListItemButton
              key={n.id}
              onClick={() => onItemClick(n)}
              sx={{
                minHeight: 56,
                py: 1.25,
                bgcolor: n.read_at ? "transparent" : "action.hover",
                alignItems: "flex-start",
              }}
            >
              <ListItemText
                primary={n.title}
                secondary={
                  <>
                    <Typography component="span" variant="body2" sx={{ display: "block" }} color="text.secondary">
                      {n.body}
                    </Typography>
                    <Typography component="span" variant="caption" color="text.disabled">
                      {formatDateTime(n.created_at)}
                    </Typography>
                  </>
                }
                slotProps={{
                  primary: { sx: { fontWeight: n.read_at ? 400 : 600 }, variant: "body2" },
                }}
              />
            </ListItemButton>
          ))}
        </List>
      )}
      <Divider />
      <Box sx={{ p: 1 }}>
        <Button
          component={AppLink}
          href="/notifications"
          fullWidth
          startIcon={<SettingsOutlinedIcon />}
          onClick={onClose}
          sx={{ textTransform: "none", justifyContent: "flex-start", minHeight: 44 }}
        >
          {t("settings")}
        </Button>
      </Box>
    </Box>
  );
}

export default function NotificationBell() {
  const router = useRouter();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const t = useTranslations("backoffice.notifications");
  const { formatDateTime } = useAppFormat();
  const { can, loading: sessionLoading } = useSessionPermissions();
  const enabled = !sessionLoading && can("commandes_fournisseur.consolidation");
  const { notifications, unreadCount, loading, markRead, markAllRead } = useNotifications(enabled);

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const open = Boolean(anchorEl);

  const handleOpen = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      if (isMobile) {
        setDrawerOpen(true);
      } else {
        setAnchorEl(event.currentTarget);
      }
    },
    [isMobile],
  );

  const handleClose = useCallback(() => {
    setAnchorEl(null);
    setDrawerOpen(false);
  }, []);

  const handleItemClick = useCallback(
    async (n: ClientNotification) => {
      if (!n.read_at) await markRead(n.id);
      handleClose();
      router.push(n.link_url);
    },
    [markRead, handleClose, router],
  );

  const handleMarkAllRead = useCallback(async () => {
    await markAllRead();
  }, [markAllRead]);

  if (!enabled) return null;

  const listProps = {
    notifications,
    loading,
    unreadCount,
    onItemClick: (n: ClientNotification) => void handleItemClick(n),
    onMarkAllRead: () => void handleMarkAllRead(),
    onClose: handleClose,
    t,
    formatDateTime,
  };

  return (
    <>
      <IconButton
        onClick={handleOpen}
        aria-label={t("bellAria", { count: unreadCount })}
        color="inherit"
        sx={{ minWidth: 44, minHeight: 44 }}
        className="text-emerald-700"
      >
        <Badge badgeContent={unreadCount > 0 ? unreadCount : undefined} color="error" max={99}>
          <NotificationsOutlinedIcon />
        </Badge>
      </IconButton>

      {!isMobile ? (
        <Menu
          anchorEl={anchorEl}
          open={open}
          onClose={handleClose}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
          transformOrigin={{ vertical: "top", horizontal: "right" }}
          slotProps={{ paper: { sx: { width: 360, maxWidth: "100vw" } } }}
        >
          <NotificationListContent {...listProps} />
        </Menu>
      ) : (
        <Drawer
          anchor="bottom"
          open={drawerOpen}
          onClose={handleClose}
          slotProps={{
            paper: {
              sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: "85vh" },
            },
          }}
        >
          <Box sx={{ width: "100%", pt: 1 }}>
            <Box sx={{ mx: "auto", mb: 1, height: 4, width: 40, borderRadius: 2, bgcolor: "divider" }} />
            <NotificationListContent {...listProps} />
          </Box>
        </Drawer>
      )}
    </>
  );
}
