
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid, uuid)           FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_member(uuid, uuid)          FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_write_money(uuid, uuid)    FROM PUBLIC, anon;
