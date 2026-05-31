-- Migration: gemini_image_model
-- Seed image_model for the gemini provider so it's ready when Imagen support is wired into the edge function

update provider_config
set image_model = 'imagen-4.0-generate-preview-05-20',
    image_multiplier = 1.0
where provider = 'gemini';
