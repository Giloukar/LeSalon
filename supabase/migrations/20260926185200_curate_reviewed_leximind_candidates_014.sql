-- Reviewed LexiMind curation batch 014.

update public.lexicon
set curation_state='rejected',
    curation_reason='pos_mismatch',
    curation_source_url=case lower(word)
      when 'national-socialiste' then 'https://fr.wiktionary.org/wiki/national-socialiste'
      else curation_source_url
    end,
    curated_at=now()
where content_status='hidden' and source='Lexique 4'
  and curation_state='pending_source'
  and nullif(btrim(definition),'') is null
  and (lower(word),upper(pos)) in (
    ('national-socialiste','NOM'),
    ('quatre-vingt','NOM')
  );

update public.lexicon
set curation_state='rejected',
    curation_reason='orthographic_variant',
    curation_source_url=case lower(word)
      when 'contre-proposition' then 'https://fr.wiktionary.org/wiki/contre-proposition'
      when 'appareil-photo' then 'https://fr.wiktionary.org/wiki/appareil_photo'
      when 'bla-bla-bla' then 'https://fr.wiktionary.org/wiki/bla-bla-bla'
      when 'cardio-vasculaire' then 'https://fr.wiktionary.org/wiki/cardio-vasculaire'
      else curation_source_url
    end,
    curated_at=now()
where content_status='hidden' and source='Lexique 4'
  and curation_state='pending_source'
  and nullif(btrim(definition),'') is null
  and (lower(word),upper(pos)) in (
    ('contre-proposition','NOM'),
    ('appareil-photo','NOM'),
    ('bla-bla-bla','NOM'),
    ('cardio-vasculaire','ADJ')
  );

update public.lexicon
set curation_state='rejected',
    curation_reason='inflected_form',
    curated_at=now()
where content_status='hidden' and source='Lexique 4'
  and curation_state='pending_source'
  and nullif(btrim(definition),'') is null
  and (lower(word),upper(pos)) in (
    ('institutionnalisé','ADJ'),
    ('new-yorkaise','NOM'),
    ('débarasse','NOM'),
    ('entrainements','NOM'),
    ('rafraichissant','NOM'),
    ('subspatiale','NOM'),
    ('téléporte','NOM'),
    ('reconnaitrais','NOM'),
    ('fraichement','NOM')
  );

update public.lexicon
set curation_state='rejected',
    curation_reason='foreign_or_noise',
    curated_at=now()
where content_status='hidden' and source='Lexique 4'
  and curation_state='pending_source'
  and nullif(btrim(definition),'') is null
  and (lower(word),upper(pos)) in (
    ('field','NOM'),('hospital','NOM'),('homie','NOM'),('eagles','NOM'),
    ('awards','NOM'),('trade','NOM'),('christmas','NOM'),('foods','NOM'),
    ('chocolate','NOM'),('games','NOM'),('irish','NOM')
  );

update public.lexicon
set curation_state='rejected',
    curation_reason='named_entity',
    curated_at=now()
where content_status='hidden' and source='Lexique 4'
  and curation_state='pending_source'
  and nullif(btrim(definition),'') is null
  and (lower(word),upper(pos)) in (
    ('gates','NOM'),('portland','NOM'),('pepsi','NOM'),('skype','NOM'),
    ('lucien','NOM'),('coca-cola','NOM'),('rutherford','NOM'),('colisée','NOM')
  );
