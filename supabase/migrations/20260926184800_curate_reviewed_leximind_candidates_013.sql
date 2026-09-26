-- Reviewed LexiMind curation batch 013.

update public.lexicon
set definition='Anatomie. Os pair du crâne situé dans la région de la tempe.',
    source='Wiktionnaire fr + Lexique 4',
    source_url='https://fr.wiktionary.org/wiki/temporal',
    content_status='ready',
    curation_state='approved',
    curation_reason='wiktionary_pos_and_sense_verified',
    curation_source_url='https://fr.wiktionary.org/wiki/temporal',
    curated_at=now()
where lower(word)='temporal' and upper(pos)='NOM'
  and source='Lexique 4' and content_status='hidden'
  and curation_state='pending_source'
  and nullif(btrim(definition),'') is null;

update public.lexicon
set curation_state='rejected',
    curation_reason='pos_mismatch',
    curation_source_url=case lower(word)
      when 'sinon' then 'https://fr.wiktionary.org/wiki/sinon'
      when 'rebonjour' then 'https://fr.wiktionary.org/wiki/rebonjour'
      else curation_source_url
    end,
    curated_at=now()
where content_status='hidden' and source='Lexique 4'
  and curation_state='pending_source'
  and nullif(btrim(definition),'') is null
  and (lower(word),upper(pos)) in (
    ('quelques','NOM'),
    ('sinon','ADV'),
    ('voilà','NOM'),
    ('rebonjour','NOM'),
    ('biométrique','NOM')
  );

update public.lexicon
set curation_state='rejected',
    curation_reason='inflected_form',
    curation_source_url=case lower(word)
      when 'enclenche' then 'https://fr.wiktionary.org/wiki/enclencher'
      else curation_source_url
    end,
    curated_at=now()
where content_status='hidden' and source='Lexique 4'
  and curation_state='pending_source'
  and nullif(btrim(definition),'') is null
  and (lower(word),upper(pos)) in (
    ('enclenche','NOM'),
    ('téléportez','NOM'),
    ('dysfonctionnelle','NOM'),
    ('inquièterais','NOM')
  );

update public.lexicon
set curation_state='rejected',
    curation_reason='orthographic_variant',
    curation_source_url=case lower(word)
      when 'show-business' then 'https://fr.wiktionary.org/wiki/show_business'
      when 'je-ne-sais-quoi' then 'https://fr.wiktionary.org/wiki/je-ne-sais-quoi'
      else curation_source_url
    end,
    curated_at=now()
where content_status='hidden' and source='Lexique 4'
  and curation_state='pending_source'
  and nullif(btrim(definition),'') is null
  and (lower(word),upper(pos)) in (
    ('show-business','NOM'),
    ('je-ne-sais-quoi','NOM')
  );

update public.lexicon
set curation_state='rejected',
    curation_reason='foreign_or_noise',
    curated_at=now()
where lower(word)='center' and upper(pos)='NOM'
  and source='Lexique 4' and content_status='hidden'
  and curation_state='pending_source'
  and nullif(btrim(definition),'') is null;

update public.lexicon
set curation_state='rejected',
    curation_reason='named_entity',
    curated_at=now()
where content_status='hidden' and source='Lexique 4'
  and curation_state='pending_source'
  and nullif(btrim(definition),'') is null
  and (lower(word),upper(pos)) in (
    ('californie','NOM'),('william','NOM'),('floride','NOM'),('allemagne','NOM'),
    ('scott','NOM'),('parker','NOM'),('saint-esprit','NOM'),('oliver','NOM'),
    ('sammy','NOM'),('satan','NOM'),('jacob','NOM'),('madison','NOM'),
    ('stewart','NOM'),('chase','NOM'),('pierce','NOM'),('venise','NOM'),
    ('queens','NOM'),('lloyd','NOM'),('barbie','NOM'),('klein','NOM'),
    ('belgique','NOM'),('reich','NOM'),('finch','NOM'),('blair','NOM')
  );
