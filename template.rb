gem "blacklight"
gem "blacklight-gallery", :github => 'projectblacklight/blacklight-gallery'
gem "blacklight-spotlight", :github => 'sul-dlss/spotlight'
gem 'sir-trevor-rails', :github => 'sul-dlss/sir-trevor-rails'
gem 'openseadragon', :github => 'sul-dlss/openseadragon-rails'
gem "jettywrapper"

run "bundle install"

# run the blacklight install generator
blacklight_options = ENV.fetch("BLACKLIGHT_INSTALL_OPTIONS", '--devise --jettywrapper')
generate 'blacklight:install', blacklight_options

blacklight_gallery_options = ENV.fetch("BLACKLIGHT_GALLERY_INSTALL_OPTIONS", '')
if blacklight_gallery_options != false
  generate 'blacklight_gallery:install', blacklight_gallery_options
end

spotlight_options = ENV.fetch("SPOTLIGHT_INSTALL_OPTIONS", '--openseadragon --mailer_default_url_host=localhost:3000')
generate 'spotlight:install', spotlight_options
rake "spotlight:install:migrations"
rake "db:migrate"

rake "spotlight:initialize"
