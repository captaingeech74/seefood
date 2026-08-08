-- Website V3.1: menu pages are frequently published as large JPEG/PNG/WebP
-- documents. Keep these OCR jobs distinct from dish photography.

alter table website_asset_jobs drop constraint if exists website_asset_jobs_kind_check;
alter table website_asset_jobs add constraint website_asset_jobs_kind_check
  check(kind in ('pdf','image','menu_image'));

alter table website_asset_results drop constraint if exists website_asset_results_kind_check;
alter table website_asset_results add constraint website_asset_results_kind_check
  check(kind in ('pdf','image','menu_image'));

