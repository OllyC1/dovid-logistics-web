-- Pricing activation is performed only by authenticated server routes.

revoke execute on function public.activate_pricing_configuration_version(uuid,text) from authenticated;
revoke execute on function public.activate_rate_card(uuid) from authenticated;
grant execute on function public.activate_pricing_configuration_version(uuid,text) to service_role;
grant execute on function public.activate_rate_card(uuid) to service_role;
