do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'companies'
      and column_name = 'address_line1'
  ) then
    alter table public.companies rename column address_line1 to street_address;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'companies'
      and column_name = 'address_line2'
  ) then
    alter table public.companies drop column address_line2;
  end if;
end $$;

