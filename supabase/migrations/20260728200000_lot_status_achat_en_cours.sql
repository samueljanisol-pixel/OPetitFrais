-- Statut lot « achat_en_cours » (entre prêt et terminé).

alter table public.commande_fournisseur_lot
  drop constraint if exists commande_fournisseur_lot_status_check;

alter table public.commande_fournisseur_lot
  add constraint commande_fournisseur_lot_status_check
  check (status in ('brouillon', 'prete', 'achat_en_cours', 'terminee'));

insert into public.ref_status_label (domain, status_code, label, sort_order)
values ('commande_fournisseur_lot', 'achat_en_cours', 'Achat en cours', 25)
on conflict (domain, status_code) do update
set label = excluded.label,
    sort_order = excluded.sort_order;

-- Lots déjà saisis en achat mais encore « prêt »
update public.commande_fournisseur_lot l
set status = 'achat_en_cours'
where l.status = 'prete'
  and (
    exists (
      select 1
      from public.commande_fournisseur_lot_ligne ll
      where ll.lot_id = l.id
        and (
          coalesce(ll.qte_achat, 0) > 0
          or ll.prix_achat_unitaire is not null
          or (ll.montant_ligne_achat is not null and ll.montant_ligne_achat <> 0)
          or ll.marque_achete is true
        )
    )
    or exists (
      select 1
      from public.commande_fournisseur_lot_frais f
      where f.lot_id = l.id
    )
    or exists (
      select 1
      from public.commande_fournisseur_lot_vendeur_achat va
      where va.lot_id = l.id
        and va.status = 'cloture'
    )
    or exists (
      select 1
      from public.fournisseur_compte_achat c
      where c.lot_id = l.id
    )
  );

-- Lignes : update / insert achat sur prêt ou achat en cours
drop policy if exists "cfll update achat" on public.commande_fournisseur_lot_ligne;
create policy "cfll update achat"
  on public.commande_fournisseur_lot_ligne for update
  to authenticated
  using (
    public.current_role_has_permission('commandes_fournisseur.achat')
    and exists (
      select 1
      from public.commande_fournisseur_lot l
      where l.id = commande_fournisseur_lot_ligne.lot_id
        and l.status in ('prete', 'achat_en_cours', 'terminee')
    )
  )
  with check (
    public.current_role_has_permission('commandes_fournisseur.achat')
  );

drop policy if exists "cfll insert achat prete" on public.commande_fournisseur_lot_ligne;
create policy "cfll insert achat prete"
  on public.commande_fournisseur_lot_ligne for insert
  to authenticated
  with check (
    public.current_role_has_permission('commandes_fournisseur.achat')
    and exists (
      select 1
      from public.commande_fournisseur_lot l
      where l.id = commande_fournisseur_lot_ligne.lot_id
        and l.status in ('prete', 'achat_en_cours')
    )
  );

-- Passage prêt → achat en cours
drop policy if exists "cflot update achat en cours" on public.commande_fournisseur_lot;
create policy "cflot update achat en cours"
  on public.commande_fournisseur_lot for update
  to authenticated
  using (
    public.current_role_has_permission('commandes_fournisseur.achat')
    and commande_fournisseur_lot.status = 'prete'
  )
  with check (
    public.current_role_has_permission('commandes_fournisseur.achat')
    and commande_fournisseur_lot.status = 'achat_en_cours'
  );

-- Clôture : prêt ou achat en cours → terminée
drop policy if exists "cflot update achat cloture" on public.commande_fournisseur_lot;
create policy "cflot update achat cloture"
  on public.commande_fournisseur_lot for update
  to authenticated
  using (
    public.current_role_has_permission('commandes_fournisseur.achat')
    and commande_fournisseur_lot.status in ('prete', 'achat_en_cours')
  )
  with check (
    public.current_role_has_permission('commandes_fournisseur.achat')
    and commande_fournisseur_lot.status = 'terminee'
  );

-- Réouverture : terminée → achat en cours
drop policy if exists "cflot update achat reopen" on public.commande_fournisseur_lot;
create policy "cflot update achat reopen"
  on public.commande_fournisseur_lot for update
  to authenticated
  using (
    public.current_role_has_permission('commandes_fournisseur.achat')
    and commande_fournisseur_lot.status = 'terminee'
  )
  with check (
    public.current_role_has_permission('commandes_fournisseur.achat')
    and commande_fournisseur_lot.status = 'achat_en_cours'
  );

-- Photos / état vendeur achat : prêt ou achat en cours (ou terminé en lecture)
drop policy if exists "lot vendeur achat write" on public.commande_fournisseur_lot_vendeur_achat;
create policy "lot vendeur achat write"
  on public.commande_fournisseur_lot_vendeur_achat for all
  to authenticated
  using (
    public.current_role_has_permission('commandes_fournisseur.achat')
    and exists (
      select 1
      from public.commande_fournisseur_lot l
      where l.id = lot_id
        and l.status in ('prete', 'achat_en_cours', 'terminee')
    )
  )
  with check (
    public.current_role_has_permission('commandes_fournisseur.achat')
    and exists (
      select 1
      from public.commande_fournisseur_lot l
      where l.id = lot_id
        and l.status in ('prete', 'achat_en_cours', 'terminee')
    )
  );

drop policy if exists "lot vendeur photo write" on public.commande_fournisseur_lot_vendeur_photo;
create policy "lot vendeur photo write"
  on public.commande_fournisseur_lot_vendeur_photo for all
  to authenticated
  using (
    public.current_role_has_permission('commandes_fournisseur.achat')
    and exists (
      select 1
      from public.commande_fournisseur_lot l
      where l.id = lot_id
        and l.status in ('prete', 'achat_en_cours', 'terminee')
    )
  )
  with check (
    public.current_role_has_permission('commandes_fournisseur.achat')
    and exists (
      select 1
      from public.commande_fournisseur_lot l
      where l.id = lot_id
        and l.status in ('prete', 'achat_en_cours', 'terminee')
    )
  );

-- Consolidation : photos commande WhatsApp tant que lot encore ouvert à l’achat
drop policy if exists "lot vendeur photo insert consolidation" on public.commande_fournisseur_lot_vendeur_photo;
create policy "lot vendeur photo insert consolidation"
  on public.commande_fournisseur_lot_vendeur_photo for insert
  to authenticated
  with check (
    public.current_role_has_permission('commandes_fournisseur.consolidation')
    and exists (
      select 1
      from public.commande_fournisseur_lot l
      where l.id = lot_id
        and l.status in ('prete', 'achat_en_cours')
    )
  );

drop policy if exists "lot vendeur photo update consolidation" on public.commande_fournisseur_lot_vendeur_photo;
create policy "lot vendeur photo update consolidation"
  on public.commande_fournisseur_lot_vendeur_photo for update
  to authenticated
  using (
    public.current_role_has_permission('commandes_fournisseur.consolidation')
    and exists (
      select 1
      from public.commande_fournisseur_lot l
      where l.id = lot_id
        and l.status in ('prete', 'achat_en_cours')
    )
  )
  with check (
    public.current_role_has_permission('commandes_fournisseur.consolidation')
    and exists (
      select 1
      from public.commande_fournisseur_lot l
      where l.id = lot_id
        and l.status in ('prete', 'achat_en_cours')
    )
  );

-- Commentaires vendeur consolidation aussi en achat_en_cours
drop policy if exists "lot vendeur comment write consolidation" on public.commande_fournisseur_lot_vendeur_comment;
create policy "lot vendeur comment write consolidation"
  on public.commande_fournisseur_lot_vendeur_comment for all
  to authenticated
  using (
    public.current_role_has_permission('commandes_fournisseur.consolidation')
    and exists (
      select 1
      from public.commande_fournisseur_lot l
      where l.id = lot_id
        and l.status in ('brouillon', 'prete', 'achat_en_cours')
    )
  )
  with check (
    public.current_role_has_permission('commandes_fournisseur.consolidation')
    and exists (
      select 1
      from public.commande_fournisseur_lot l
      where l.id = lot_id
        and l.status in ('brouillon', 'prete', 'achat_en_cours')
    )
  );
