-- Migration: gemini_image_model
-- Seed image_model for the gemini provider so it's ready when Imagen support is wired into the edge function

update provider_config
set image_model = 'gemini-3.1-flash-image',
    image_multiplier = 1.0
where provider = 'gemini';
