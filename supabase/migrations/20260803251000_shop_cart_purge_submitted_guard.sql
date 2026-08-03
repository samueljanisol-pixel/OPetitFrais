-- Renforce le trigger : jamais de purge sur une commande déjà soumise.

CREATE OR REPLACE FUNCTION public.shop_cart_purge_product_on_unavailable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF NEW.active IS NOT FALSE AND NEW.visible_vitrine IS NOT FALSE THEN
    RETURN NEW;
  END IF;

  IF OLD.active IS NOT DISTINCT FROM NEW.active
     AND OLD.visible_vitrine IS NOT DISTINCT FROM NEW.visible_vitrine THEN
    RETURN NEW;
  END IF;

  UPDATE public.shop_cart sc
  SET lines = COALESCE(
    (
      SELECT jsonb_agg(elem ORDER BY ord)
      FROM jsonb_array_elements(sc.lines) WITH ORDINALITY AS t(elem, ord)
      WHERE elem->>'productId' IS DISTINCT FROM NEW.id::text
    ),
    '[]'::jsonb
  )
  WHERE sc.status = 'active'
    AND sc.submitted_at IS NULL
    AND sc.lines @> jsonb_build_array(jsonb_build_object('productId', NEW.id::text));

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.shop_cart_purge_product_on_unavailable() IS
  'Retire un produit des paniers boutique en cours (status=active, non soumis). Les commandes submitted conservent leurs lignes.';
