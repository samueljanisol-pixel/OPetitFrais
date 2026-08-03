-- Permissions commandes client pour le rôle administrateur (accès explicite en plus de is_full_access).

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.slug = 'administrateur'
  and p.key like 'commandes_client.%'
on conflict do nothing;
