update public.colonies
set name = 'Dreams Pvt Ltd'
where slug = 'demo';

update public.colonies
set name = 'Juicify Pvt Ltd'
where slug = 'north';

update public.colony_settings as settings
set legal_name = colonies.name
from public.colonies as colonies
where settings.colony_id = colonies.id
  and colonies.slug in ('demo', 'north');
