-- rls_auto_enable() only runs as the ensure_rls event trigger; nobody should call it over the API.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
